// Compare comments, declarations, types, values, and punctuation.
export type ColorRole = "background" | "foreground" | "accent";
export type HexColor = `#${string}`;

export enum PreviewMode {
  Gallery = "gallery",
  Live = "live"
}

export interface ThemeOptions {
  readonly name: string;
  readonly colors: Record<ColorRole, HexColor>;
  minimumContrast?: number;
}

export class ThemePreview {
  static readonly version = 1;
  private enabled = false;

  constructor(private readonly options: ThemeOptions) {}

  get description(): string {
    return `${this.options.name}: ${this.options.colors.accent}`;
  }

  async render(mode: PreviewMode = PreviewMode.Gallery): Promise<string[]> {
    const contrast = this.options.minimumContrast ?? 4.5;
    if (contrast < 1 || !Number.isFinite(contrast)) {
      throw new RangeError("Contrast must be a finite number of at least one.");
    }

    this.enabled = mode === PreviewMode.Live;
    const entries = Object.entries(this.options.colors);
    return entries.map(([role, color], index) =>
      `${index + 1}. ${role.padEnd(10)} ${color} (${this.enabled ? "live" : "gallery"})`
    );
  }
}

export function describe<T extends ThemeOptions>(theme: T): string {
  return `${theme.name} has ${Object.keys(theme.colors).length} colors.`;
}

export const theme = {
  name: "Themer Lab",
  colors: {
    background: "#121314",
    foreground: "#bfbfbf",
    accent: "#297aa0"
  },
  minimumContrast: 7
} satisfies ThemeOptions;

export const preview = new ThemePreview(theme);

// Bracket levels cycle through Colors 1-6; closing brackets match their pair.
export const nestedBrackets = ((((((true))))));
