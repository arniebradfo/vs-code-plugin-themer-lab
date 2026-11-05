import { isSampleLanguage } from "./samples";
import {
  ClientMessage,
  ReferenceTheme,
  SemanticTokenStyle,
  SyntaxParameters,
  SyntaxAdjustmentMode,
  SyntaxAdjustmentParameter,
  ThemeParameters,
  TokenColorRule,
  colorParameterKeys,
  infoSources,
  numericParameterLimits,
  personalityDefaults,
  personalityKeys,
  syntaxFamilies,
  syntaxAdjustmentModes,
  syntaxAdjustmentParameters,
  syntaxPaletteModes,
  syntaxNumericParameterLimits,
  themeModes,
  ThemeMode
} from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

export function isThemeColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
}

export function parseThemeMode(value: unknown): ThemeMode {
  const mode = themeModes.find((mode) => mode === value);
  if (!mode) throw new Error("Theme mode must be dark or light.");
  return mode;
}

export function parseParameters(value: unknown): ThemeParameters {
  const input = requireRecord(value, "Theme parameters");
  const result: ThemeParameters = {
    mode: parseThemeMode(input.mode),
    background: "",
    foreground: "",
    accent: "",
    infoSource: "accent",
    info: "",
    warning: "",
    error: "",
    added: "",
    deleted: "",
    modified: "",
    surfaceSpread: 1,
    mutedContrast: 1,
    borderStrength: 1,
    overlayOpacity: 1,
    ...personalityDefaults
  };
  const infoSource = infoSources.find((source) => source === input.infoSource);
  if (!infoSource) {
    throw new Error("infoSource must be accent, foreground, or custom.");
  }
  result.infoSource = infoSource;
  for (const key of colorParameterKeys) {
    const color = input[key];
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) {
      throw new Error(`${key} must be an opaque six-digit hex color.`);
    }
    result[key] = color;
  }
  for (const key of Object.keys(numericParameterLimits) as (keyof typeof numericParameterLimits)[]) {
    const number = input[key];
    const limits = numericParameterLimits[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < limits.min || number > limits.max) {
      throw new Error(`${key} must be between ${limits.min} and ${limits.max}.`);
    }
    result[key] = number;
  }
  for (const key of personalityKeys) {
    if (typeof input[key] !== "boolean") throw new Error(`${key} must be a boolean.`);
    result[key] = input[key];
  }
  return result;
}

export function parseSyntaxParameters(value: unknown): SyntaxParameters {
  const input = requireRecord(value, "Syntax parameters");
  const result: SyntaxParameters = {
    red: "", amber: "", green: "", teal: "", blue: "", violet: "", neutral: "", comments: "",
    chromaBoost: 0, lightnessShift: 0,
    lightnessMode: "auto", chromaMode: "auto", paletteMode: "auto",
    lightnessBase: null, seedSnapshots: {}
  };
  for (const family of syntaxFamilies) {
    const color = input[family];
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error(`Syntax ${family} must be an opaque six-digit hex color.`);
    }
    result[family] = color.toLowerCase();
  }
  for (const key of Object.keys(syntaxNumericParameterLimits) as (keyof typeof syntaxNumericParameterLimits)[]) {
    const value = input[key];
    const limits = syntaxNumericParameterLimits[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < limits.min || value > limits.max) {
      throw new Error(`Syntax ${key} must be between ${limits.min} and ${limits.max}.`);
    }
    result[key] = value;
  }
  const adjustmentMode = (key: SyntaxAdjustmentParameter): SyntaxAdjustmentMode => {
    const legacyKey = key === "chromaMode" ? "autoChroma" : "autoLightness";
    if (Object.hasOwn(input, key)) {
      if (Object.hasOwn(input, legacyKey)) throw new Error(`Syntax ${key} cannot be combined with legacy ${legacyKey}.`);
      const mode = syntaxAdjustmentModes.find((mode) => mode === input[key]);
      if (!mode) throw new Error(`Syntax ${key} must be auto, manual, or off.`);
      return mode;
    }
    // Normalize older panel drafts and recorded native evidence without changing their colors.
    if (typeof input[legacyKey] !== "boolean") throw new Error(`Syntax ${key} must be auto, manual, or off.`);
    return input[legacyKey] ? "auto" : "manual";
  };
  for (const key of syntaxAdjustmentParameters) result[key] = adjustmentMode(key);
  if (Object.hasOwn(input, "paletteMode")) {
    if (Object.hasOwn(input, "autoHue")) throw new Error("Syntax paletteMode cannot be combined with legacy autoHue.");
    const mode = syntaxPaletteModes.find((mode) => mode === input.paletteMode);
    if (!mode) throw new Error("Syntax paletteMode must be auto, anchored, or manual.");
    result.paletteMode = mode;
  } else {
    if (typeof input.autoHue !== "boolean") throw new Error("Syntax paletteMode must be auto, anchored, or manual.");
    result.paletteMode = input.autoHue ? "auto" : "manual";
  }
  if (result.chromaMode === "off" && result.chromaBoost !== 0) {
    throw new Error("Syntax chromaMode off requires zero chromaBoost.");
  }
  if (result.lightnessMode === "off" && result.lightnessShift !== 0) {
    throw new Error("Syntax lightnessMode off requires zero lightnessShift.");
  }
  if (input.lightnessBase !== null) {
    const base = requireRecord(input.lightnessBase, "Syntax lightnessBase");
    const number = (key: "text" | "comments") => {
      const value = base[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Syntax lightnessBase.${key} must be between 0 and 1.`);
      }
      return value;
    };
    result.lightnessBase = { text: number("text"), comments: number("comments") };
    if (Object.hasOwn(base, "neutral")) {
      const neutral = base.neutral;
      if (typeof neutral !== "number" || !Number.isFinite(neutral) || neutral < 0 || neutral > 1) {
        throw new Error("Syntax lightnessBase.neutral must be between 0 and 1.");
      }
      result.lightnessBase.neutral = neutral;
    }
    if (result.lightnessMode !== "manual") throw new Error("Only manual lightness can have a lightnessBase.");
  }
  const snapshots = requireRecord(input.seedSnapshots, "Syntax seedSnapshots");
  for (const key of Object.keys(snapshots)) {
    const family = syntaxFamilies.find((family) => family === key);
    if (!family) throw new Error(`Unknown syntax seed snapshot ${key}.`);
    const seed = requireRecord(snapshots[family], `Syntax seedSnapshots.${family}`);
    const component = (key: "l" | "c" | "h", maximum: number) => {
      const value = seed[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
        throw new Error(`Syntax seedSnapshots.${family}.${key} must be between 0 and ${maximum}.`);
      }
      return value;
    };
    result.seedSnapshots[family] = { l: component("l", 1), c: component("c", 1), h: component("h", 360) };
  }
  if (result.paletteMode !== "manual" && Object.keys(result.seedSnapshots).length > 0) {
    throw new Error("Auto and Anchored palettes cannot have manual seedSnapshots.");
  }
  return result;
}

export function parseTokenRules(value: unknown, label: string): TokenColorRule[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a token rule array; external tmTheme files are not supported by this capture tool.`);
  }
  return value.map((entry, index) => {
    const rule = requireRecord(entry, `${label}[${index}]`);
    const settings = requireRecord(rule.settings, `${label}[${index}].settings`);
    const result: TokenColorRule = { settings: {} };
    if (rule.name !== undefined) {
      result.name = requireString(rule.name, "Token name");
    }
    if (rule.scope !== undefined) {
      if (typeof rule.scope === "string") {
        result.scope = rule.scope;
      } else if (Array.isArray(rule.scope) && rule.scope.every((item): item is string => typeof item === "string")) {
        result.scope = rule.scope;
      } else {
        throw new Error(`${label}[${index}].scope must be a string or string array.`);
      }
    }
    for (const key of ["foreground", "background"] as const) {
      if (settings[key] !== undefined) {
        if (!isThemeColor(settings[key])) {
          throw new Error(`Invalid token ${key} in ${label}[${index}].`);
        }
        result.settings[key] = settings[key];
      }
    }
    if (settings.fontStyle !== undefined) {
      if (typeof settings.fontStyle !== "string") {
        throw new Error(`Invalid fontStyle in ${label}[${index}].`);
      }
      result.settings.fontStyle = settings.fontStyle;
    }
    return result;
  });
}

export function parseSemanticColors(value: unknown): Record<string, string | SemanticTokenStyle> {
  if (value === undefined) {
    return {};
  }
  const input = requireRecord(value, "Semantic token colors");
  const result: Record<string, string | SemanticTokenStyle> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (typeof entry === "string") {
      if (!isThemeColor(entry)) {
        throw new Error(`Invalid semantic token color: ${key}.`);
      }
      result[key] = entry;
    } else {
      const style = requireRecord(entry, `Semantic token style ${key}`);
      const parsed: SemanticTokenStyle = {};
      if (style.foreground !== undefined) {
        if (!isThemeColor(style.foreground)) {
          throw new Error(`Invalid semantic foreground: ${key}.`);
        }
        parsed.foreground = style.foreground;
      }
      for (const property of ["bold", "italic", "underline", "strikethrough"] as const) {
        if (style[property] !== undefined) {
          if (typeof style[property] !== "boolean") {
            throw new Error(`Invalid semantic ${property}: ${key}.`);
          }
          parsed[property] = style[property];
        }
      }
      result[key] = parsed;
    }
  }
  return result;
}

export function parseReferenceTheme(value: unknown): ReferenceTheme {
  const input = requireRecord(value, "Reference theme");
  if (input.schemaVersion !== 1) {
    throw new Error("Unsupported reference schema version.");
  }
  const vscode = requireRecord(input.vscode, "VS Code metadata");
  const theme = requireRecord(input.theme, "Theme metadata");
  const coverage = requireRecord(input.coverage, "Coverage metadata");
  if ((theme.type !== "dark" && theme.type !== "light") || coverage.kind !== "explicit-theme-chain" ||
      coverage.registeredDefaultsIncluded !== false || coverage.runtimeResolved !== false) {
    throw new Error("Unsupported reference kind or coverage claims.");
  }
  if (!Array.isArray(input.sources)) {
    throw new Error("Reference sources must be an array.");
  }
  const sources = input.sources.map((entry) => {
    const source = requireRecord(entry, "Reference source");
    const sha256 = requireString(source.sha256, "Source hash");
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error("Invalid source SHA-256.");
    }
    return { path: requireString(source.path, "Source path"), sha256 };
  });
  const colors: ReferenceTheme["colors"] = {};
  for (const [id, raw] of Object.entries(requireRecord(input.colors, "Reference colors"))) {
    const entry = requireRecord(raw, `Reference color ${id}`);
    if (entry.value !== null && !isThemeColor(entry.value)) {
      throw new Error(`Invalid reference color: ${id}.`);
    }
    colors[id] = { value: entry.value, source: requireString(entry.source, `Color source ${id}`) };
  }
  if (!Array.isArray(coverage.limitations) ||
      !coverage.limitations.every((entry): entry is string => typeof entry === "string")) {
    throw new Error("Coverage limitations must be a string array.");
  }
  if (typeof input.semanticHighlighting !== "boolean") {
    throw new Error("semanticHighlighting must be a boolean.");
  }
  return {
    schemaVersion: 1,
    vscode: {
      version: requireString(vscode.version, "VS Code version"),
      commit: requireString(vscode.commit, "VS Code commit")
    },
    theme: {
      id: requireString(theme.id, "Theme id"),
      name: requireString(theme.name, "Theme name"),
      type: theme.type
    },
    sources,
    coverage: {
      kind: "explicit-theme-chain",
      registeredDefaultsIncluded: false,
      runtimeResolved: false,
      limitations: coverage.limitations
    },
    colors,
    tokenColors: parseTokenRules(input.tokenColors, "Reference tokens"),
    semanticHighlighting: input.semanticHighlighting,
    semanticTokenColors: parseSemanticColors(input.semanticTokenColors)
  };
}

export function parseClientMessage(value: unknown): ClientMessage {
  const input = requireRecord(value, "Webview message");
  switch (input.type) {
    case "ready":
    case "reset":
    case "resetSyntax":
    case "export":
    case "apply":
    case "applyWorkspace":
    case "cancel":
      return { type: input.type };
    case "parameters":
      {
        const parameters = parseParameters(input.parameters);
        if (typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) || input.revision < 1) {
          throw new Error("Parameter revision must be a positive safe integer.");
        }
        return { type: "parameters", parameters, syntaxParameters: parseSyntaxParameters(input.syntaxParameters), revision: input.revision };
      }
    case "livePreview":
      if (typeof input.enabled !== "boolean") {
        throw new Error("Live preview enabled must be a boolean.");
      }
      return { type: "livePreview", enabled: input.enabled };
    case "openSample":
      if (input.language === undefined) {
        return { type: "openSample" };
      }
      if (!isSampleLanguage(input.language)) {
        throw new Error("Unsupported sample language.");
      }
      return { type: "openSample", language: input.language };
    default:
      throw new Error("Unknown webview message.");
  }
}
