// JavaScript adds regular expressions, private fields, and JSDoc types.
const HEX_COLOR = /^#[a-f\d]{6}$/i;

export class Palette {
  static defaultAccent = "#297aa0";
  #accent;

  /**
   * @param {string} accent An opaque six-digit color.
   */
  constructor(accent = Palette.defaultAccent) {
    if (!HEX_COLOR.test(accent)) {
      throw new TypeError(`Invalid accent: "${accent}"`);
    }
    this.#accent = accent;
  }

  get description() {
    return `Accent ${this.#accent.toUpperCase()}`;
  }

  async preview(enabled = true) {
    const roles = ["background", "foreground", "accent"];
    const overrides = { accent: this.#accent, description: null };
    const { accent, description } = overrides;
    const label = description ?? "Themer Lab";

    if (!enabled) return [];
    return roles.map((role, index) => ({
      role,
      color: role === "accent" ? accent : "#bfbfbf",
      label: `${label}\n${index + 1}: ${role}`
    }));
  }
}

export const palette = new Palette();
