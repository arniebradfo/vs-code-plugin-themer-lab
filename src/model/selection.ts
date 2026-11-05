import { compositeColors, contrastRatio, nativeCssAlpha, parseColor } from "../color";
import type { GeneratedPalette, GeneratedSyntax } from "../shared/types";

export const inactiveSelectionId = "editor.inactiveSelectionBackground";
export const inactiveSelectionContrastTarget = 4.5;

export function limitInactiveSelectionOpacity(overlay: string, canvas: string, foregrounds: readonly string[]): string {
  const color = parseColor(overlay);
  if (parseColor(canvas).alpha !== 1 || foregrounds.length === 0 ||
    foregrounds.some((foreground) => parseColor(foreground).alpha !== 1)) {
    throw new Error("Inactive selection protection requires an opaque canvas and at least one opaque foreground.");
  }
  const targets = foregrounds.map((foreground) => ({
    foreground, ratio: Math.min(inactiveSelectionContrastTarget, contrastRatio(foreground, canvas))
  }));
  const readable = (candidate: string) => {
    const alpha = parseColor(candidate).alpha ?? 1;
    // VS Code rounds alpha to three decimals internally, then two when emitting CSS.
    const nativeAlpha = nativeCssAlpha(alpha);
    return [alpha, nativeAlpha].every((opacity) => {
      const background = compositeColors(candidate, canvas, opacity);
      return targets.every(({ foreground, ratio }) => contrastRatio(foreground, background) >= ratio);
    });
  };
  if (readable(overlay)) return overlay;
  const rgb = [color.r, color.g, color.b].map((channel) =>
    Math.round(channel * 255).toString(16).padStart(2, "0")).join("");
  // Check encoded alpha bytes, not a monotonicity assumption about colored backgrounds.
  for (let alpha = Math.round((color.alpha ?? 1) * 255) - 1; alpha >= 0; alpha--) {
    const candidate = `#${rgb}${alpha.toString(16).padStart(2, "0")}`;
    if (readable(candidate)) return candidate;
  }
  throw new Error("Inactive selection protection could not preserve the canvas contrast.");
}

export function withSyntaxSelectionContrast(palette: GeneratedPalette, syntax: GeneratedSyntax): GeneratedPalette {
  const overlay = palette.colors[inactiveSelectionId];
  if (overlay === undefined) return palette;
  const canvas = palette.colors["editor.background"];
  const foreground = palette.colors.foreground;
  if (!canvas || !foreground) throw new Error("Inactive selection protection is missing its canvas or primary foreground.");
  const protectedColor = limitInactiveSelectionOpacity(overlay, canvas, [foreground, syntax.editorForeground]);
  return protectedColor === overlay ? palette : {
    ...palette, colors: { ...palette.colors, [inactiveSelectionId]: protectedColor }
  };
}
