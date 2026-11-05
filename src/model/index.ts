import { clamp, contrastingForeground, limitOklchChroma, parseColor, toHex, toOklab, toOklch } from "../color";
import type {
  GeneratedPalette,
  ModelFit,
  PaletteEvaluation,
  ReferenceTheme,
  ThemeParameters
} from "../shared/types";
import { parseParameters } from "../shared/validation";
import { inspectPalette, validateTolerance } from "./evaluation";
import { inactiveSelectionId, limitInactiveSelectionOpacity } from "./selection";
import { limitPaintedTintChroma, overlayTint, readableAccent, tintOverlay, withAccentActiveItems } from "./personality";
import {
  Assignment,
  classifyColor,
  controls,
  fixedScrollbarOpacityPattern,
  interactionSurfaceBackdrops,
  modelDefinitions,
  opacityFor,
  overlayTintProfile,
  parameterDefaults,
  parameterSourceIds,
  supplementalColors
} from "./rules";

export { inspectPalette } from "./evaluation";
export { modelDefinition, modelDefinitions } from "./rules";

export function getDefaultParameters(reference: ReferenceTheme): ThemeParameters {
  const seed = (id: string): string => {
    const value = reference.colors[id]?.value;
    if (value === undefined || value === null) {
      throw new Error(`Cannot fit model: explicit anchor ${id} is missing or null.`);
    }
    const color = parseColor(value);
    if (color.alpha !== 1) {
      throw new Error(`Cannot fit model: anchor ${id} must be opaque.`);
    }
    return toHex(color);
  };
  return {
    mode: reference.theme.type,
    background: seed(parameterSourceIds.background),
    foreground: seed(parameterSourceIds.foreground),
    accent: seed(parameterSourceIds.accent),
    info: seed(parameterSourceIds.info),
    warning: seed(parameterSourceIds.warning),
    error: seed(parameterSourceIds.error),
    added: seed(parameterSourceIds.added),
    deleted: seed(parameterSourceIds.deleted),
    modified: seed(parameterSourceIds.modified),
    ...parameterDefaults
  };
}

export function generatePalette(
  reference: ReferenceTheme,
  parameters: ThemeParameters
): GeneratedPalette {
  const effective = parseParameters(parameters);
  if (effective.mode !== reference.theme.type) throw new Error("Theme parameters must match the selected reference mode.");
  const definition = modelDefinitions[effective.mode];
  const families = definition.families;
  const background = toOklab(effective.background);
  const foreground = toOklab(effective.foreground);
  const accent = toOklch(effective.accent);
  let info = effective.info;
  if (effective.infoSource !== "custom") {
    const source = toOklch(effective[effective.infoSource]);
    const lightness = clamp(source.l + definition.infoLightnessLift);
    info = toHex({
      ...source,
      l: lightness,
      c: limitOklchChroma(lightness, source.c, source.h ?? 0)
    });
  }
  const direction = foreground.l < background.l ? -1 : 1;
  const render = (assignment: Assignment, alpha: number, surfaceSpread: number): string => {
    const family = families[assignment.family];
    if (family.anchor === "black") {
      return toHex({ mode: "rgb", r: 0, g: 0, b: 0, alpha });
    }
    if (family.anchor === "source") {
      const role = assignment.role;
      if (role !== "info" && role !== "warning" && role !== "error" &&
        role !== "added" && role !== "deleted" && role !== "modified") {
        throw new Error(`Source family requires a severity or change role, received ${role}.`);
      }
      const sourceHex = (role === "info" ? info : effective[role]).toLowerCase();
      const source = toOklab(sourceHex);
      const color = family.amount === 1
        ? `${sourceHex}${alpha === 1 ? "" : Math.round(alpha * 255).toString(16).padStart(2, "0")}`
        : toHex({
          mode: "oklab",
          l: background.l + (source.l - background.l) * family.amount,
          a: background.a + (source.a - background.a) * family.amount,
          b: background.b + (source.b - background.b) * family.amount,
          alpha
        });
      return assignment.onColor ? contrastingForeground(color) : color;
    }
    if (family.anchor === "accent") {
      const color = toHex({
        mode: "oklch",
        l: clamp(accent.l + family.amount),
        c: accent.c,
        h: accent.h ?? 0,
        alpha
      });
      return assignment.role === "text" ? contrastingForeground(color) : color;
    }
    if (family.anchor === "background") {
      const scale = assignment.role === "border" ? effective.borderStrength : surfaceSpread;
      return toHex({
        ...background,
        l: clamp(background.l + direction * family.amount * scale),
        alpha
      });
    }
    let amount: number = family.amount;
    if (assignment.role === "text" && amount < 1) {
      amount *= effective.mutedContrast;
    } else if (assignment.role === "border") {
      amount *= effective.borderStrength;
    }
    return toHex({
      ...foreground,
      l: clamp(background.l + (foreground.l - background.l) * amount),
      ...(assignment.role === "border" ? {
        // Pivot foreground-derived borders around the full canvas color, not just its lightness.
        a: background.a + (foreground.a - background.a) * effective.borderStrength,
        b: background.b + (foreground.b - background.b) * effective.borderStrength
      } : {}),
      alpha
    });
  };

  let palette: GeneratedPalette = {
    colors: {},
    roles: {},
    coverage: { total: Object.keys(reference.colors).length, generated: 0, preserved: 0, unresolved: 0, unscoredGenerated: 0 }
  };
  // A family is rendered once: neither source RGB nor per-ID adjustments enter it.
  const renderedFamilies = new Map<string, string>();
  const rendered = (id: string, assignment: Assignment): string => {
    const tint = effective.tintNeutralOverlays ? overlayTintProfile(id, assignment, effective.mode) : undefined;
    const opacity = opacityFor(effective.mode, assignment.opacity);
    const alpha = clamp(opacity * (opacity < 1 && !fixedScrollbarOpacityPattern.test(id) ? effective.overlayOpacity : 1));
    const surfaceSpread = effective.mode === "light" && interactionSurfaceBackdrops(id) ? 1 : effective.surfaceSpread;
    const key = `${assignment.role}/${assignment.family}/${alpha}/${assignment.onColor === true}/${tint ?? ""}/${surfaceSpread}`;
    let value = renderedFamilies.get(key);
    if (value === undefined) {
      value = render(assignment, alpha, surfaceSpread);
      if (tint) value = tintOverlay(value, effective.accent, tint);
      renderedFamilies.set(key, value);
    }
    return value;
  };
  for (const [id, entry] of Object.entries(reference.colors)) {
    if (entry.value === null) {
      palette.coverage.unresolved++;
      continue;
    }
    parseColor(entry.value);
    const assignment = classifyColor(id, effective.mode);
    if (!assignment) {
      palette.colors[id] = entry.value;
      palette.roles[id] = "preserved";
      palette.coverage.preserved++;
      continue;
    }
    palette.colors[id] = rendered(id, assignment);
    palette.roles[id] = assignment.role;
    palette.coverage.generated++;
  }
  for (const id of Object.keys(supplementalColors)) {
    if (Object.hasOwn(reference.colors, id)) {
      continue;
    }
    const assignment = classifyColor(id, effective.mode);
    if (!assignment) {
      throw new Error(`Missing source rule for supplemental color ${id}.`);
    }
    palette.colors[id] = rendered(id, assignment);
    palette.roles[id] = assignment.role;
    palette.coverage.unscoredGenerated++;
  }
  if (effective.tintNeutralOverlays && accent.c >= overlayTint.achromaticThreshold) {
    const selection = classifyColor("list.activeSelectionBackground", effective.mode);
    if (!selection) throw new Error("Interaction tint consistency is missing its shared active-selection rule.");
    const referenceTint = rendered("list.activeSelectionBackground", selection);
    const limited = new Map<string, string>();
    for (const [id, color] of Object.entries(palette.colors)) {
      if (palette.roles[id] !== "surface") continue;
      const backdropIds = interactionSurfaceBackdrops(id);
      if (!backdropIds) continue;
      const backdropId = backdropIds.find((candidate) => palette.colors[candidate] !== undefined);
      const background = backdropId ? palette.colors[backdropId] : undefined;
      if (!background) throw new Error(`Interaction tint consistency is missing its backdrop ${backdropIds.join(" / ")}.`);
      const key = `${color}/${background}`;
      let value = limited.get(key);
      if (value === undefined) {
        value = limitPaintedTintChroma(color, referenceTint, background);
        limited.set(key, value);
      }
      palette.colors[id] = value;
    }
  }
  const selection = palette.colors[inactiveSelectionId];
  if (selection !== undefined) {
    palette.colors[inactiveSelectionId] = limitInactiveSelectionOpacity(selection, effective.background, [effective.foreground]);
  }
  const codeBackground = palette.colors["textPreformat.background"];
  if (palette.colors["textPreformat.foreground"] !== undefined && codeBackground !== undefined) {
    palette.colors["textPreformat.foreground"] = readableAccent(effective.accent, effective.accent, [codeBackground]);
  }
  if (effective.accentActiveItems) palette = withAccentActiveItems(palette, effective.accent);
  return palette;
}

export function evaluatePalette(
  reference: ReferenceTheme,
  palette: GeneratedPalette,
  tolerance = 3
): PaletteEvaluation {
  return inspectPalette(reference, palette, tolerance).evaluation;
}

export function fitModel(reference: ReferenceTheme, tolerance = 3): ModelFit {
  validateTolerance(tolerance);
  const parameters = getDefaultParameters(reference);
  const palette = generatePalette(reference, parameters);
  return {
    controlCount: controls.length,
    fixedRuleCount: modelDefinitions[reference.theme.type].fixedRuleCount,
    exceptionCount: palette.coverage.preserved,
    parameters,
    palette,
    evaluation: evaluatePalette(reference, palette, tolerance)
  };
}
