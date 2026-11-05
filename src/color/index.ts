import { converter, formatHex, formatHex8, toGamut } from "culori";
import type { Oklab, Oklch, Rgb } from "culori";
import { isThemeColor } from "../shared/validation";

const rgb = converter("rgb");
const oklab = converter("oklab");
const oklch = converter("oklch");
const mapToSrgb = toGamut("rgb", "oklch");

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    throw new Error("Color components must be finite.");
  }
  return Math.min(max, Math.max(min, value));
}

export function parseColor(value: string): Rgb {
  if (!isThemeColor(value)) {
    throw new Error(`Invalid theme color: ${String(value)}. Expected hex RGB or RGBA.`);
  }
  const result = rgb(value);
  if (!result) {
    throw new Error(`Cannot convert theme color: ${value}.`);
  }
  return { ...result, alpha: result.alpha ?? 1 };
}

export function toOklab(value: string): Oklab {
  const color = parseColor(value);
  const result = oklab(color);
  // Culori's matrix sums can put white just above L=1. Keep the exact
  // sRGB endpoints canonical rather than widening any evaluation threshold.
  if (color.r === color.g && color.g === color.b && (color.r === 0 || color.r === 1)) {
    return { ...result, l: color.r, a: 0, b: 0 };
  }
  return result;
}

export function toOklch(value: string): Oklch {
  return oklch(toOklab(value));
}

export function limitOklchChroma(lightness: number, chroma: number, hue: number): number {
  if (![lightness, chroma, hue].every(Number.isFinite) || lightness < 0 || lightness > 1 || chroma < 0) {
    throw new Error("Chroma limiting requires lightness in [0,1], nonnegative chroma, and a finite hue.");
  }
  if (lightness === 0 || lightness === 1 || chroma === 0) return 0;
  const fits = (candidate: number) => {
    const color = rgb({ mode: "oklch", l: lightness, c: candidate, h: hue });
    return [color.r, color.g, color.b].every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1);
  };
  if (fits(chroma)) return chroma;
  let lower = 0;
  let upper = chroma;
  for (let iteration = 0; iteration < 24; iteration++) {
    const middle = (lower + upper) / 2;
    if (fits(middle)) lower = middle;
    else upper = middle;
  }
  return lower;
}

export function toHex(color: Rgb | Oklab | Oklch): string {
  const components = color.mode === "rgb"
    ? [color.r, color.g, color.b]
    : color.mode === "oklab"
      ? [color.l, color.a, color.b]
      : [color.l, color.c, color.h ?? 0];
  if (!components.every(Number.isFinite)) {
    throw new Error("Color components must be finite.");
  }
  const alpha = color.alpha ?? 1;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error("Color alpha must be finite and between 0 and 1.");
  }
  if (color.mode === "oklch" && color.c < 0) {
    throw new Error("OKLCH chroma must be nonnegative.");
  }
  const mapped = mapToSrgb({ ...color, alpha });
  if (![mapped.r, mapped.g, mapped.b].every(Number.isFinite)) {
    throw new Error("Gamut mapping produced a non-finite color.");
  }
  const output = { ...mapped, alpha };
  return (alpha === 1 ? formatHex(output) : formatHex8(output)).toLowerCase();
}

/** Euclidean OKLab distance × 100; alpha is deliberately measured separately. */
export function deltaE(left: string, right: string): number {
  const a = toOklab(left);
  const b = toOklab(right);
  return 100 * Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function alphaError(left: string, right: string): number {
  return Math.abs((parseColor(left).alpha ?? 1) - (parseColor(right).alpha ?? 1));
}

export function nativeCssAlpha(alpha: number): number {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error("Native CSS alpha must be between 0 and 1.");
  return Number((Math.round(alpha * 1000) / 1000).toFixed(2));
}

/** Source-over in encoded sRGB, as an approximation to browser paint compositing. */
export function compositeColors(foreground: string, background: string, foregroundAlpha?: number): string {
  if (foregroundAlpha !== undefined && (!Number.isFinite(foregroundAlpha) || foregroundAlpha < 0 || foregroundAlpha > 1)) {
    throw new Error("Composite foreground alpha must be finite and between 0 and 1.");
  }
  const front = parseColor(foreground);
  const back = parseColor(background);
  const fa = foregroundAlpha ?? front.alpha ?? 1;
  const ba = back.alpha ?? 1;
  const alpha = fa + ba * (1 - fa);
  if (alpha === 0) {
    return "#00000000";
  }
  const channel = (f: number, b: number): number => (f * fa + b * ba * (1 - fa)) / alpha;
  return toHex({
    mode: "rgb",
    r: channel(front.r, back.r),
    g: channel(front.g, back.g),
    b: channel(front.b, back.b),
    alpha
  });
}

export function relativeLuminance(value: string): number {
  const color = parseColor(value);
  if (color.alpha !== 1) {
    throw new Error("Luminance requires an opaque color; composite transparency first.");
  }
  const linearize = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function contrastingForeground(background: string): "#000000" | "#ffffff" {
  return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background)
    ? "#000000"
    : "#ffffff";
}
