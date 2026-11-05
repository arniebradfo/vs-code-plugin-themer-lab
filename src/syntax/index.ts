import type { Oklch } from "culori";
import { clamp, contrastRatio, deltaE, limitOklchChroma, parseColor, toHex, toOklab, toOklch } from "../color";
import { validateTolerance } from "../model/evaluation";
import { parameterSourceIds } from "../model/rules";
import { syntaxAutoModes, syntaxFamilies, syntaxNumericParameterLimits, syntaxWheelFamilies } from "../shared/types";
import type { ContrastCheck, GeneratedPalette, GeneratedSyntax, ReferenceTheme, ResolvedSyntax, SemanticTokenStyle, SyntaxAdjustmentMode, SyntaxAdjustmentParameter, SyntaxAnchors, SyntaxAutoMode, SyntaxFamily, SyntaxPaletteMode, SyntaxParameters, SyntaxRole, SyntaxSeed, ThemeMode, ThemeParameters, TokenColorRule } from "../shared/types";
import { parseSyntaxParameters } from "../shared/validation";
export { syntaxAutoModes, syntaxFamilies, syntaxNumericParameterLimits, syntaxPaletteModes, syntaxRoles } from "../shared/types";
export type { GeneratedSyntax, SyntaxFamily, SyntaxParameters, SyntaxRole } from "../shared/types";
export { parseSyntaxParameters } from "../shared/validation";

export const syntaxSourceScopes: Record<SyntaxFamily, string> = {
  red: "keyword",
  amber: "entity.name.tag.css",
  green: "support.type.property-name.json",
  teal: "entity.name.type",
  blue: "constant",
  violet: "entity.name.function",
  neutral: "meta.block",
  comments: "comment"
};

const lightSyntaxSourceScopes: Record<SyntaxFamily, string> = {
  ...syntaxSourceScopes,
  amber: "support.function",
  green: "entity.name.tag",
  teal: "support.type",
  violet: "keyword.control"
};

export const syntaxFamilyLabels: Record<SyntaxFamily, string> = {
  blue: "Color 1",
  violet: "Color 2",
  red: "Color 3",
  amber: "Color 4",
  green: "Color 5",
  teal: "Color 6",
  neutral: "Color 7 - Neutral",
  comments: "Comments"
};

export const syntaxFamilyDescriptions: Record<SyntaxFamily, string> = {
  blue: "The accent-linked family in Auto and the editable anchor in Anchored. Originally blue. Strings, constants, attributes, headings, support symbols, and bracket nesting level 1.",
  violet: "Originally violet. Functions, control-flow keywords, regex markers, and bracket level 2.",
  red: "Originally red. Keywords, escapes, syntax error tokens, removed text, and bracket level 3.",
  amber: "Originally amber/gold. Declarations, CSS selectors, built-in functions, gold escapes, and bracket level 4.",
  green: "Originally green. Tags, JSON keys, numeric shades, added text, and bracket level 5.",
  teal: "Originally teal. Types, classes, namespaces, inherited type shades, and bracket level 6.",
  neutral: "Originally cool gray. Code text and punctuation, not comments. Negative Chroma boost reduces its tint; positive boost leaves it unchanged.",
  comments: "Originally muted blue-gray. Comment text and delimiters use their own seed, independent of Color 7. Global chroma and lightness adjustments still apply."
};

export const maximumSyntaxHueShift = 15;
export const syntaxParameterDefaults = {
  chromaBoost: 0, lightnessShift: 0,
  lightnessMode: "auto", chromaMode: "auto", paletteMode: "auto",
  lightnessBase: null, seedSnapshots: {}
} satisfies Pick<SyntaxParameters, "chromaBoost" | "lightnessShift" | "lightnessMode" | "chromaMode" | "paletteMode" | "lightnessBase" | "seedSnapshots">;
export const syntaxVocabulary = {
  lightness: Array.from({ length: 41 }, (_, index) => (index - 32) / 40),
  chroma: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.75, 2],
  hue: [-15, -10, -5, 0, 5, 10, 15]
};

export const lightSyntaxVocabulary = {
  ...syntaxVocabulary,
  lightness: Array.from({ length: 65 }, (_, index) => (index - 32) / 40)
};
export const syntaxVocabularyFor = (mode: ThemeMode) => mode === "light" ? lightSyntaxVocabulary : syntaxVocabulary;

export interface SyntaxTransform {
  lightness: number;
  chroma: number;
  hue: number;
}

export interface SyntaxColorFit {
  source: string;
  family: SyntaxFamily;
  transform: SyntaxTransform;
  deltaE: number;
}

export interface SyntaxModel {
  mode: ThemeMode;
  parameters: SyntaxParameters;
  defaultAccent: string;
  editorForeground: SyntaxColorFit;
  tokenColors: { sourceIndex: number; rule: TokenColorRule; fit?: SyntaxColorFit; grouping?: "color" | "semantic" }[];
  semanticTokenColors: { selector: string; style: string | SemanticTokenStyle; fit?: SyntaxColorFit }[];
  semanticHighlighting: boolean;
  complexity: {
    inputCount: number;
    colorInputCount: number;
    globalSliderCount: number;
    automaticModeCount: number;
    maximumHueShift: number;
    sharedLightnessLevels: number;
    sharedChromaLevels: number;
    sharedHueLevels: number;
    learnedNumericCoefficients: 0;
    perTokenNumericResiduals: 0;
    colorAssignments: number;
    scopeAssignments: number;
    semanticAssignments: number;
  };
}

const hueDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);
const hue = (color: Oklch) => color.h ?? 0;

export function syntaxFamilySourceColors(model: SyntaxModel, family: SyntaxFamily): string[] {
  return [...new Set([
    ...(family === "neutral" ? [model.editorForeground.source] : []),
    ...model.tokenColors.flatMap(({ fit }) => fit?.family === family ? [fit.source] : []),
    ...model.semanticTokenColors.flatMap(({ fit }) => fit?.family === family ? [fit.source] : [])
  ])].sort();
}

function scopes(rule: TokenColorRule): string[] {
  return (Array.isArray(rule.scope) ? rule.scope : [rule.scope ?? ""])
    .flatMap((value) => value.split(",").map((scope) => scope.trim()));
}

export function getDefaultSyntaxParameters(reference: ReferenceTheme): SyntaxParameters {
  return parseSyntaxParameters({
    ...Object.fromEntries(syntaxFamilies.map((family) => {
      const scope = (reference.theme.type === "light" ? lightSyntaxSourceScopes : syntaxSourceScopes)[family];
      const source = [...reference.tokenColors].reverse().find((rule) =>
        scopes(rule).includes(scope) && rule.settings.foreground !== undefined
      )?.settings.foreground;
      if (source === undefined) throw new Error(`Missing explicit syntax anchor ${scope}.`);
      if (parseColor(source).alpha !== 1) throw new Error(`Syntax anchor ${scope} must be opaque.`);
      return [family, source];
    })),
    ...syntaxParameterDefaults
  });
}

export function classifySyntaxColor(source: string, parameters: SyntaxParameters, scope = "") {
  const color = toOklch(source);
  if (/(?:^|[\s.])comment(?:$|[\s.])/.test(scope)) {
    return { family: "comments" as const, grouping: "semantic" as const };
  }
  if (color.c < 0.025) return { family: "neutral" as const, grouping: "color" as const };
  // Keep diagnostic and diff meanings together at color-family boundaries.
  if (/^invalid|message\.error|token\.error-token|markup\.deleted|meta\.diff\.header\.from-file|punctuation\.definition\.deleted/.test(scope)) {
    return { family: "red" as const, grouping: "semantic" as const };
  }
  if (/markup\.inserted|meta\.diff\.header\.to-file|punctuation\.definition\.inserted/.test(scope)) {
    return { family: "green" as const, grouping: "semantic" as const };
  }
  if (scope === "token.warn-token") return { family: "amber" as const, grouping: "semantic" as const };
  let best: SyntaxFamily = "red";
  let distance = Infinity;
  for (const family of syntaxFamilies) {
    if (family === "neutral" || family === "comments") continue;
    const candidate = hueDistance(hue(color), hue(toOklch(parameters[family])));
    if (candidate < distance) {
      best = family;
      distance = candidate;
    }
  }
  return { family: best, grouping: "color" as const };
}

function variant(source: string, transform: SyntaxTransform): Oklch {
  if (!/^#[0-9a-f]{6}$/i.test(source) ||
    !lightSyntaxVocabulary.lightness.includes(transform.lightness) ||
    !syntaxVocabulary.chroma.includes(transform.chroma) ||
    !syntaxVocabulary.hue.includes(transform.hue)) {
    throw new Error("Syntax colors require an opaque source and a transform from the bounded shared vocabulary.");
  }
  const color = toOklch(source);
  return {
    mode: "oklch",
    l: clamp(color.l + transform.lightness),
    c: color.c * transform.chroma,
    h: (hue(color) + transform.hue + 360) % 360
  };
}

function encode(color: Oklch): string {
  return toHex({ ...color, c: limitOklchChroma(color.l, color.c, hue(color)), alpha: 1 });
}

export function shiftSyntaxLightness(lightness: number, amount: number): number {
  return amount <= 0 ? lightness * (1 + amount) : lightness + (1 - lightness) * amount;
}

export function scaleSyntaxAutoLightness(lightness: number, mode: ThemeMode = "dark"): number {
  const value = clamp(lightness);
  if (mode === "light" && value < 0.5) return 0.4 + 0.1 * (value / 0.5) ** 5;
  if (value <= 0.8) return value;
  // Match the original slope at 0.8, then ease toward 0.85 instead of white.
  return 0.85 - 0.05 * ((1 - value) / 0.2) ** 4;
}

export function adjustSyntaxColor(
  color: Oklch,
  family: SyntaxFamily,
  inputs: Pick<SyntaxParameters, "chromaBoost" | "lightnessShift">,
  lightnessBase = color.l
): string {
  const lightness = shiftSyntaxLightness(lightnessBase, inputs.lightnessShift);
  const chroma = limitOklchChroma(lightness, color.c, hue(color));
  const boost = family === "neutral" ? Math.min(0, inputs.chromaBoost) : inputs.chromaBoost;
  // A unit chroma search covers sRGB; each shade uses its own boundary.
  const maximum = boost > 0 && chroma > 1e-6 ? limitOklchChroma(lightness, 1, hue(color)) : chroma;
  return encode({
    ...color,
    l: lightness,
    c: boost <= 0 ? chroma * (1 + boost) : chroma + (maximum - chroma) * boost
  });
}

export function renderSyntaxColor(source: string, transform: SyntaxTransform): string {
  const color = variant(source, transform);
  if (transform.lightness === 0 && transform.chroma === 1 && transform.hue === 0) return source.toLowerCase();
  return encode(color);
}

const seedColor = (value: string): SyntaxSeed => {
  const color = toOklch(value);
  return { l: clamp(color.l), c: color.c < 1e-6 ? 0 : color.c, h: hue(color) };
};
const identityTransform: SyntaxTransform = { lightness: 0, chroma: 1, hue: 0 };

export function getSyntaxAnchors(parameters: ThemeParameters, palette: GeneratedPalette): SyntaxAnchors {
  const muted = palette.colors.descriptionForeground;
  if (!muted) throw new Error("Automatic syntax requires the generated descriptionForeground.");
  return { foreground: parameters.foreground, muted, accent: parameters.accent };
}

export function renderResolvedSyntaxColor(resolved: ResolvedSyntax, family: SyntaxFamily, transform = identityTransform): string {
  const seed = resolved.seeds[family];
  const color: Oklch = {
    mode: "oklch",
    l: clamp(seed.l + transform.lightness),
    c: seed.c * transform.chroma,
    h: (seed.h + transform.hue + 360) % 360
  };
  if (resolved.chromaBoost === 0 && resolved.lightnessShift === 0 && resolved.lightnessBase === null) {
    return transform.lightness === 0 && transform.chroma === 1 && transform.hue === 0
      ? resolved.sourceColors[family] : encode(color);
  }
  return adjustSyntaxColor(
    { ...color, c: limitOklchChroma(color.l, color.c, hue(color)) }, family, resolved,
    (family === "neutral" ? resolved.lightnessBase?.neutral : undefined) ??
      resolved.lightnessBase?.[family === "comments" ? "comments" : "text"] ?? color.l
  );
}

export function isSyntaxAutomatic(parameters: SyntaxParameters, mode: SyntaxAutoMode): boolean {
  return mode === "autoHue" ? parameters.paletteMode === "auto"
    : parameters[mode === "autoChroma" ? "chromaMode" : "lightnessMode"] === "auto";
}

export function resolveSyntaxParameters(model: SyntaxModel, parameters: SyntaxParameters, anchors?: SyntaxAnchors): ResolvedSyntax {
  const inputs = parseSyntaxParameters(parameters);
  if ((inputs.paletteMode === "anchored" || syntaxAutoModes.some((mode) => isSyntaxAutomatic(inputs, mode))) && !anchors) {
    throw new Error("Automatic syntax modes require UI foreground, muted text, and accent anchors.");
  }
  if (anchors && Object.values(anchors).some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
    throw new Error("Syntax UI anchors must be opaque six-digit hex colors.");
  }
  const accent = anchors ? seedColor(anchors.accent) : undefined;
  const anchored = inputs.paletteMode === "anchored";
  const primary = anchored ? seedColor(inputs.blue) : accent;
  const referencePrimary = seedColor(model.parameters.blue);
  const hueRotation = inputs.paletteMode !== "manual" && primary && primary.c >= 0.01
    ? ((primary.h - referencePrimary.h + 540) % 360) - 180 : 0;
  const anchorShift = anchored && primary
    ? primary.l <= referencePrimary.l
      ? (primary.l - referencePrimary.l) / referencePrimary.l
      : (primary.l - referencePrimary.l) / (1 - referencePrimary.l)
    : 0;
  const seeds = {} as Record<SyntaxFamily, SyntaxSeed>;
  const sourceColors = {} as Record<SyntaxFamily, string>;
  for (const family of syntaxFamilies) {
    if (inputs.paletteMode !== "manual" && anchors) {
      const source = family === "neutral" ? anchors.foreground : family === "comments" ? anchors.muted : model.parameters[family];
      const seed = seedColor(source);
      const wheel = syntaxWheelFamilies.some((key) => key === family);
      seeds[family] = anchored && family === "blue" && primary ? { ...primary } : {
        ...seed,
        l: anchored && wheel ? shiftSyntaxLightness(seed.l, anchorShift) : seed.l,
        c: anchored && wheel && primary ? seed.c * primary.c / referencePrimary.c : seed.c,
        h: (seed.h + (wheel ? hueRotation : 0) + 360) % 360
      };
      sourceColors[family] = anchored && family === "blue" ? inputs.blue
        : !wheel || (!anchored && hueRotation === 0) ? source.toLowerCase()
          : encode({ mode: "oklch", ...seeds[family] });
    } else {
      seeds[family] = { ...(inputs.seedSnapshots[family] ?? seedColor(inputs[family])) };
      sourceColors[family] = inputs[family];
    }
  }
  const referenceChroma = seedColor(model.defaultAccent).c;
  const autoBoost = accent ? 0.25 * (accent.c - referenceChroma) / (accent.c + referenceChroma) : 0;
  const resolved: ResolvedSyntax = {
    seeds, sourceColors, colors: { ...sourceColors },
    chromaBoost: inputs.chromaMode === "auto" ? anchored ? 0 : autoBoost : inputs.chromaBoost,
    lightnessShift: inputs.lightnessMode === "auto" ? 0 : inputs.lightnessShift,
    lightnessBase: inputs.lightnessMode === "auto" && anchors
      ? {
        text: anchored && primary ? primary.l : scaleSyntaxAutoLightness(seedColor(anchors.foreground).l, model.mode),
        comments: scaleSyntaxAutoLightness(seedColor(anchors.muted).l, model.mode),
        ...(anchored ? { neutral: scaleSyntaxAutoLightness(seedColor(anchors.foreground).l, model.mode) } : {})
      } : inputs.lightnessBase,
    hueRotation
  };
  for (const family of syntaxFamilies) resolved.colors[family] = renderResolvedSyntaxColor(resolved, family);
  return resolved;
}

export function setSyntaxAuto(
  model: SyntaxModel, parameters: SyntaxParameters, anchors: SyntaxAnchors, mode: SyntaxAutoMode, enabled: boolean
): SyntaxParameters {
  if (mode !== "autoHue") {
    return setSyntaxAdjustmentMode(model, parameters, anchors,
      mode === "autoChroma" ? "chromaMode" : "lightnessMode", enabled ? "auto" : "manual");
  }
  return setSyntaxPaletteMode(model, parameters, anchors, enabled ? "auto" : "manual");
}

export function setSyntaxPaletteMode(
  model: SyntaxModel, parameters: SyntaxParameters, anchors: SyntaxAnchors, mode: SyntaxPaletteMode
): SyntaxParameters {
  const inputs = parseSyntaxParameters(parameters);
  const previous = inputs.paletteMode;
  if (previous === mode) return inputs;
  const resolved = resolveSyntaxParameters(model, inputs, anchors);
  inputs.paletteMode = mode;
  inputs.seedSnapshots = mode === "manual" ? structuredClone(resolved.seeds) : {};
  if (mode === "manual") {
    for (const family of syntaxFamilies) inputs[family] = resolved.sourceColors[family];
    if (previous === "anchored") {
      if (inputs.lightnessMode === "auto") {
        inputs.lightnessMode = "manual";
        inputs.lightnessBase = resolved.lightnessBase;
        inputs.lightnessShift = 0;
      }
      if (inputs.chromaMode === "auto") {
        inputs.chromaMode = "manual";
        inputs.chromaBoost = resolved.chromaBoost;
      }
    }
  } else if (mode === "anchored") {
    inputs.blue = resolved.colors.blue;
    inputs.lightnessBase = null;
    inputs.lightnessShift = 0;
    inputs.chromaBoost = 0;
  }
  return parseSyntaxParameters(inputs);
}

export function setSyntaxAdjustmentMode(
  model: SyntaxModel, parameters: SyntaxParameters, anchors: SyntaxAnchors,
  key: SyntaxAdjustmentParameter, mode: SyntaxAdjustmentMode
): SyntaxParameters {
  const inputs = parseSyntaxParameters(parameters);
  const previous = inputs[key];
  if (previous === mode) return inputs;
  const resolved = resolveSyntaxParameters(model, inputs, anchors);
  inputs[key] = mode;
  if (key === "lightnessMode") {
    inputs.lightnessBase = mode === "manual" && previous === "auto" ? resolved.lightnessBase
      : mode === "manual" ? inputs.lightnessBase : null;
    inputs.lightnessShift = 0;
  } else if (mode === "off") {
    inputs.chromaBoost = 0;
  } else if (mode === "manual" && previous === "auto") {
    inputs.chromaBoost = resolved.chromaBoost;
  }
  return parseSyntaxParameters(inputs);
}

export function resetSyntaxGroup(model: SyntaxModel, parameters: SyntaxParameters, mode: SyntaxAutoMode): SyntaxParameters {
  const inputs = parseSyntaxParameters(parameters);
  if (mode === "autoHue" && inputs.paletteMode !== "manual") {
    throw new Error("Disable the derived palette by selecting Manual before resetting its seeds.");
  }
  if (isSyntaxAutomatic(inputs, mode)) throw new Error("Disable the corresponding automatic syntax mode before resetting its manual controls.");
  if (mode === "autoLightness") {
    inputs.lightnessShift = 0;
    inputs.lightnessBase = null;
  } else if (mode === "autoChroma") {
    inputs.chromaBoost = 0;
  } else {
    for (const family of syntaxFamilies) inputs[family] = model.parameters[family];
    inputs.seedSnapshots = {};
  }
  return inputs;
}

export function setSyntaxSeed(parameters: SyntaxParameters, family: SyntaxFamily, color: string): SyntaxParameters {
  const inputs = parseSyntaxParameters(parameters);
  if (inputs.paletteMode === "auto") throw new Error("Disable Auto syntax before editing syntax seeds.");
  if (inputs.paletteMode === "anchored" && family !== "blue") throw new Error("Only Color 1 can be edited in Anchored syntax.");
  inputs[family] = color;
  delete inputs.seedSnapshots[family];
  const result = parseSyntaxParameters(inputs);
  if (result.paletteMode === "anchored" && result.lightnessBase) {
    result.lightnessBase.text = seedColor(result.blue).l;
  }
  return result;
}

const syntaxModels = new WeakMap<ReferenceTheme, SyntaxModel>();

export function getSyntaxModel(reference: ReferenceTheme): SyntaxModel {
  let model = syntaxModels.get(reference);
  if (!model) {
    model = fitSyntaxModel(reference);
    syntaxModels.set(reference, model);
  }
  return model;
}

export function fitSyntaxModel(reference: ReferenceTheme): SyntaxModel {
  const vocabulary = syntaxVocabularyFor(reference.theme.type);
  const parameters: SyntaxParameters = {
    ...getDefaultSyntaxParameters(reference), lightnessMode: "manual", chromaMode: "manual", paletteMode: "manual"
  };
  const defaultAccent = reference.colors[parameterSourceIds.accent]?.value;
  if (!defaultAccent) throw new Error("Syntax fitting requires the native UI accent anchor.");
  const transforms = vocabulary.lightness.flatMap((lightness) =>
    vocabulary.chroma.flatMap((chroma) =>
      vocabulary.hue.filter((angle) => chroma !== 0 || angle === 0)
        .map((angle) => ({ lightness, chroma, hue: angle }))
    )
  ).sort((left, right) =>
    (Math.abs(left.lightness) * 40 + Math.abs(left.chroma - 1) * 2 + Math.abs(left.hue) / 5) -
    (Math.abs(right.lightness) * 40 + Math.abs(right.chroma - 1) * 2 + Math.abs(right.hue) / 5)
  );
  const candidates = new Map<SyntaxFamily, { transform: SyntaxTransform; color: ReturnType<typeof toOklab> }[]>();
  const fitted = new Map<string, SyntaxColorFit>();
  const fit = (source: string, family: SyntaxFamily): SyntaxColorFit => {
    const target = toOklab(source);
    if (parseColor(source).alpha !== 1) throw new Error("Syntax fitting requires opaque source colors.");
    const key = `${family}/${source.toLowerCase()}`;
    const cached = fitted.get(key);
    if (cached) return cached;
    let palette = candidates.get(family);
    if (!palette) {
      palette = transforms.filter((transform) =>
        (family !== "neutral" && family !== "comments") || transform.hue === 0
      )
        .map((transform) => ({ transform, color: toOklab(renderSyntaxColor(parameters[family], transform)) }));
      candidates.set(family, palette);
    }
    let best: SyntaxColorFit | undefined;
    for (const candidate of palette) {
      const error = 100 * Math.hypot(target.l - candidate.color.l, target.a - candidate.color.a, target.b - candidate.color.b);
      if (!best || error < best.deltaE) {
        best = { source: source.toLowerCase(), family, transform: { ...candidate.transform }, deltaE: error };
      }
    }
    if (!best) throw new Error("The shared syntax vocabulary has no color candidates.");
    fitted.set(key, best);
    return best;
  };
  const foreground = reference.colors["editor.foreground"]?.value;
  if (!foreground) throw new Error("The native editor.foreground is required for syntax fitting.");
  const tokenColors: SyntaxModel["tokenColors"] = [];
  reference.tokenColors.forEach((rule, sourceIndex) => {
    if (rule.settings.background !== undefined) throw new Error("Syntax background fitting is not supported.");
    if (rule.settings.foreground === undefined) {
      tokenColors.push({ sourceIndex, rule: structuredClone(rule) });
      return;
    }
    const groups: { family: SyntaxFamily; grouping: "color" | "semantic"; scopes: string[] }[] = [];
    for (const scope of scopes(rule)) {
      const assignment = classifySyntaxColor(rule.settings.foreground, parameters, scope);
      const previous = groups.at(-1);
      if (previous?.family === assignment.family && previous.grouping === assignment.grouping) previous.scopes.push(scope);
      else groups.push({ ...assignment, scopes: [scope] });
    }
    for (const group of groups) {
      const template = structuredClone(rule);
      if (group.scopes.length === 1 && group.scopes[0] === "") delete template.scope;
      else template.scope = group.scopes.length === 1 ? group.scopes[0] : group.scopes;
      tokenColors.push({ sourceIndex, rule: template, fit: fit(rule.settings.foreground, group.family), grouping: group.grouping });
    }
  });
  const semanticTokenColors = Object.entries(reference.semanticTokenColors).map(([selector, style]) => {
    const source = typeof style === "string" ? style : style.foreground;
    return {
      selector,
      style: structuredClone(style),
      ...(source === undefined ? {} : { fit: fit(source, classifySyntaxColor(source, parameters).family) })
    };
  });
  const editorForeground = fit(foreground, "neutral");
  return {
    mode: reference.theme.type,
    parameters, defaultAccent, editorForeground, tokenColors, semanticTokenColors,
    semanticHighlighting: reference.semanticHighlighting,
    complexity: {
      inputCount: syntaxFamilies.length + Object.keys(syntaxNumericParameterLimits).length + syntaxAutoModes.length,
      colorInputCount: syntaxFamilies.length,
      globalSliderCount: Object.keys(syntaxNumericParameterLimits).length,
      automaticModeCount: syntaxAutoModes.length,
      maximumHueShift: maximumSyntaxHueShift,
      sharedLightnessLevels: vocabulary.lightness.length,
      sharedChromaLevels: vocabulary.chroma.length,
      sharedHueLevels: vocabulary.hue.length,
      learnedNumericCoefficients: 0,
      perTokenNumericResiduals: 0,
      colorAssignments: fitted.size,
      scopeAssignments: tokenColors.filter((entry) => entry.fit !== undefined).length + semanticTokenColors.length + 1,
      semanticAssignments: tokenColors.filter((entry) => entry.grouping === "semantic").length
    }
  };
}

export function generateSyntax(model: SyntaxModel, parameters: SyntaxParameters, anchors?: SyntaxAnchors): GeneratedSyntax {
  return generateResolvedSyntax(model, resolveSyntaxParameters(model, parameters, anchors));
}

export function generateResolvedSyntax(model: SyntaxModel, resolved: ResolvedSyntax): GeneratedSyntax {
  const rendered = new Map<SyntaxColorFit, string>();
  const render = (fit: SyntaxColorFit): string => {
    const cached = rendered.get(fit);
    if (cached) return cached;
    const output = renderResolvedSyntaxColor(resolved, fit.family, fit.transform);
    rendered.set(fit, output);
    return output;
  };
  return {
    editorForeground: render(model.editorForeground),
    tokenColors: model.tokenColors.map(({ rule, fit }) => {
      if (rule.settings.foreground !== undefined && !fit) throw new Error("Missing fitted TextMate foreground.");
      return { ...structuredClone(rule), settings: { ...rule.settings, ...(fit ? { foreground: render(fit) } : {}) } };
    }),
    semanticHighlighting: model.semanticHighlighting,
    semanticTokenColors: Object.fromEntries(model.semanticTokenColors.map(({ selector, style, fit }) => {
      if (typeof style === "string") {
        if (!fit) throw new Error(`Missing semantic color fit ${selector}.`);
        return [selector, render(fit)];
      }
      if (style.foreground !== undefined && !fit) throw new Error(`Missing semantic color fit ${selector}.`);
      return [selector, { ...style, ...(fit ? { foreground: render(fit) } : {}) }];
    }))
  };
}

export function syntaxPreviewColors(syntax: GeneratedSyntax): Record<SyntaxRole, string> {
  const foreground = (scope: string): string => {
    const value = [...syntax.tokenColors].reverse().find((rule) =>
      scopes(rule).includes(scope) && rule.settings.foreground !== undefined
    )?.settings.foreground;
    if (value === undefined) throw new Error(`The syntax preview is missing its generated ${scope} foreground.`);
    return value;
  };
  return {
    text: syntax.editorForeground,
    comments: foreground("comment"),
    keywords: foreground("keyword"),
    strings: foreground("string"),
    numbers: foreground("constant.numeric"),
    types: foreground("entity.name.type"),
    functions: foreground("entity.name.function"),
    properties: foreground("entity.other.attribute-name"),
    declarations: foreground("entity.name")
  };
}

export function evaluateSyntaxContrast(syntax: GeneratedSyntax, background: string): ContrastCheck[] {
  return Object.entries(syntaxPreviewColors(syntax)).map(([role, foreground]) => {
    const ratio = contrastRatio(foreground, background);
    return { label: `Syntax ${role} (representative scope)`, foreground, background, ratio, target: 4.5, passes: ratio >= 4.5 };
  });
}

export function evaluateSyntaxRules(model: SyntaxModel, parameters: SyntaxParameters, tolerance = 3) {
  validateTolerance(tolerance);
  const generated = generateSyntax(model, parameters);
  const samples = [
    { id: "editor.foreground", fit: model.editorForeground, generated: generated.editorForeground },
    ...model.tokenColors.flatMap(({ rule, fit }, index) => fit ? [{
      id: `tokenColors[${index}]: ${scopes(rule).join(", ")}`, fit, generated: generated.tokenColors[index]?.settings.foreground
    }] : []),
    ...model.semanticTokenColors.flatMap(({ selector, fit }) => {
      const style = generated.semanticTokenColors[selector];
      return fit ? [{ id: `semanticTokenColors.${selector}`, fit, generated: typeof style === "string" ? style : style?.foreground }] : [];
    })
  ].map(({ id, fit, generated }) => {
    if (!generated) throw new Error(`Missing generated syntax color ${id}.`);
    const error = deltaE(fit.source, generated);
    return { id, family: fit.family, reference: fit.source, generated, deltaE: error, withinTolerance: error <= tolerance };
  });
  return {
    tolerance, count: samples.length,
    meanError: samples.reduce((sum, sample) => sum + sample.deltaE, 0) / samples.length,
    maxError: Math.max(...samples.map((sample) => sample.deltaE)),
    withinTolerancePercent: 100 * samples.filter((sample) => sample.withinTolerance).length / samples.length,
    samples
  };
}
