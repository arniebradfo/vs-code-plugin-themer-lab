import type { SampleLanguage } from "./samples";

export type { SampleLanguage } from "./samples";

export interface TokenColorRule {
  name?: string;
  scope?: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

export interface SemanticTokenStyle {
  foreground?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export const syntaxRoles = ["text", "comments", "keywords", "strings", "numbers", "types", "functions", "properties", "declarations"] as const;
export type SyntaxRole = (typeof syntaxRoles)[number];
export const syntaxWheelFamilies = ["blue", "violet", "red", "amber", "green", "teal"] as const;
export const syntaxFamilies = [...syntaxWheelFamilies, "neutral", "comments"] as const;
export type SyntaxFamily = (typeof syntaxFamilies)[number];
export const syntaxPaletteModes = ["auto", "anchored", "manual"] as const;
export type SyntaxPaletteMode = (typeof syntaxPaletteModes)[number];
export const syntaxNumericParameterLimits = {
  chromaBoost: { min: -1, max: 1, step: 0.01 },
  lightnessShift: { min: -1, max: 1, step: 0.01 }
} as const;
export type SyntaxNumericParameter = keyof typeof syntaxNumericParameterLimits;
export const syntaxAutoModes = ["autoLightness", "autoChroma", "autoHue"] as const;
export type SyntaxAutoMode = (typeof syntaxAutoModes)[number];
export const syntaxAdjustmentModes = ["auto", "manual", "off"] as const;
export type SyntaxAdjustmentMode = (typeof syntaxAdjustmentModes)[number];
export const syntaxAdjustmentParameters = ["chromaMode", "lightnessMode"] as const;
export type SyntaxAdjustmentParameter = (typeof syntaxAdjustmentParameters)[number];
export interface SyntaxSeed {
  l: number;
  c: number;
  h: number;
}
export interface SyntaxLightnessBase {
  text: number;
  comments: number;
  neutral?: number;
}
export type SyntaxParameters = Record<SyntaxFamily, string> & Record<SyntaxNumericParameter, number> &
  Record<SyntaxAdjustmentParameter, SyntaxAdjustmentMode> & {
    paletteMode: SyntaxPaletteMode;
    lightnessBase: SyntaxLightnessBase | null;
    seedSnapshots: Partial<Record<SyntaxFamily, SyntaxSeed>>;
  };

export interface SyntaxAnchors {
  foreground: string;
  muted: string;
  accent: string;
}

export interface ResolvedSyntax {
  seeds: Record<SyntaxFamily, SyntaxSeed>;
  sourceColors: Record<SyntaxFamily, string>;
  colors: Record<SyntaxFamily, string>;
  chromaBoost: number;
  lightnessShift: number;
  lightnessBase: SyntaxLightnessBase | null;
  hueRotation: number;
}

export interface GeneratedSyntax {
  editorForeground: string;
  tokenColors: TokenColorRule[];
  semanticHighlighting: boolean;
  semanticTokenColors: Record<string, string | SemanticTokenStyle>;
}

export interface GeneratedBrackets {
  colors: Record<string, string>;
  contrast: ContrastCheck;
  usesRedFallback: boolean;
}

export const themeModes = ["dark", "light"] as const;
export type ThemeMode = (typeof themeModes)[number];
export const themeSettingsTargets = ["user", "workspace"] as const;
export type ThemeSettingsTarget = (typeof themeSettingsTargets)[number];
export const previewThemeNames: Record<ThemeMode, string> = {
  dark: "Themer Lab Dark",
  light: "Themer Lab Light"
};
export const legacyPreviewThemeNames: Record<ThemeMode, string> = {
  dark: "Themer Lab Preview",
  light: "Themer Lab Light Preview"
};

export interface ReferenceTheme {
  schemaVersion: 1;
  vscode: { version: string; commit: string };
  theme: { id: string; name: string; type: ThemeMode };
  sources: { path: string; sha256: string }[];
  coverage: {
    kind: "explicit-theme-chain";
    registeredDefaultsIncluded: false;
    runtimeResolved: false;
    limitations: string[];
  };
  colors: Record<string, { value: string | null; source: string }>;
  tokenColors: TokenColorRule[];
  semanticHighlighting: boolean;
  semanticTokenColors: Record<string, string | SemanticTokenStyle>;
}

export const personalityKeys = ["accentActiveItems", "tintNeutralOverlays", "monochromeBrackets", "statefulStatusBar"] as const;
export type PersonalityToggle = (typeof personalityKeys)[number];
export const personalityDefaults = {
  accentActiveItems: false,
  tintNeutralOverlays: false,
  monochromeBrackets: false,
  statefulStatusBar: false
} as const satisfies Record<PersonalityToggle, boolean>;

export interface ThemeParameters extends Record<PersonalityToggle, boolean> {
  mode: ThemeMode;
  background: string;
  foreground: string;
  accent: string;
  infoSource: InfoSource;
  info: string;
  warning: string;
  error: string;
  added: string;
  deleted: string;
  modified: string;
  surfaceSpread: number;
  mutedContrast: number;
  borderStrength: number;
  overlayOpacity: number;
}

export interface ThemeDraft {
  parameters: ThemeParameters;
  syntaxParameters: SyntaxParameters;
}

export const infoSources = ["accent", "foreground", "custom"] as const;
export type InfoSource = (typeof infoSources)[number];
export const severityParameters = ["info", "warning", "error"] as const;
export type Severity = typeof severityParameters[number];
export const changeParameters = ["added", "deleted", "modified"] as const;
export type ChangeKind = typeof changeParameters[number];
export const colorParameterKeys = ["background", "foreground", "accent", ...severityParameters, ...changeParameters] as const;
export type ColorParameter = typeof colorParameterKeys[number];

export const numericParameterLimits = {
  surfaceSpread: { min: -3, max: 3, step: 0.01 },
  mutedContrast: { min: 0.25, max: 2, step: 0.01 },
  borderStrength: { min: -2, max: 2, step: 0.01 },
  overlayOpacity: { min: 0, max: 2, step: 0.01 }
} as const;

export type ColorRole = "surface" | "text" | "border" | "accent" | Severity | ChangeKind | "preserved";

export interface GeneratedPalette {
  colors: Record<string, string>;
  roles: Record<string, ColorRole>;
  coverage: {
    total: number;
    generated: number;
    preserved: number;
    unresolved: number;
    unscoredGenerated: number;
  };
}

export interface ContrastCheck {
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  target: number;
  passes: boolean;
}

export interface PaletteEvaluation {
  tolerance: number;
  meanError: number;
  p50Error: number;
  p95Error: number;
  maxError: number;
  alphaMeanError: number;
  alphaMaxError: number;
  withinTolerancePercent: number;
  worst: {
    id: string;
    reference: string;
    generated: string;
    deltaE: number;
    role: ColorRole;
  }[];
  contrast: ContrastCheck[];
}

export interface ModelFit {
  controlCount: number;
  fixedRuleCount: number;
  exceptionCount: number;
  parameters: ThemeParameters;
  palette: GeneratedPalette;
  evaluation: PaletteEvaluation;
}

export interface AppState {
  revision: number;
  drafts: Partial<Record<ThemeMode, ThemeDraft>>;
  baseline: {
    name: string;
    version: string;
    explicitColorCount: number;
    limitation: string;
  };
  parameters: ThemeParameters;
  syntax: {
    parameters: SyntaxParameters;
    resolved: ResolvedSyntax;
    palette: GeneratedSyntax;
    brackets: GeneratedBrackets;
    contrast: ContrastCheck[];
  };
  palette: GeneratedPalette;
  evaluation: PaletteEvaluation;
  model: { controlCount: number; fixedRuleCount: number; exceptionCount: number };
  livePreview: boolean;
  workspaceAvailable: boolean;
  recoveryPending: boolean;
  busy: boolean;
  status: string;
}

export type ClientMessage =
  | { type: "ready" }
  | { type: "parameters"; parameters: ThemeParameters; syntaxParameters: SyntaxParameters; revision: number }
  | { type: "reset" }
  | { type: "resetSyntax" }
  | { type: "export" }
  | { type: "livePreview"; enabled: boolean }
  | { type: "apply" }
  | { type: "applyWorkspace" }
  | { type: "cancel" }
  | { type: "openSample"; language?: SampleLanguage };

export type HostMessage =
  | { type: "state"; state: AppState }
  | { type: "error"; message: string };
