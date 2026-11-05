import { clamp, compositeColors, contrastingForeground, contrastRatio, limitOklchChroma, nativeCssAlpha, parseColor, toHex, toOklch } from "../color";
import type { ColorRole, GeneratedPalette, ReferenceTheme } from "../shared/types";

export const overlayTint = { accentMix: 0.65, maximumChroma: 0.14, achromaticThreshold: 0.01, quietScale: 0.35 } as const;
export type OverlayTintProfile = "overlay" | "surface" | "quiet";
export const activeItemContrastTarget = 4.5;
export const activeItemLightness = { min: 0.2, max: 0.9 } as const;
export const personalityFixedRuleCount = Object.keys(overlayTint).length + Object.keys(activeItemLightness).length + 1;

export const activeItemTargets: Record<string, readonly [background: string, canvas: string, hover?: string]> = {
  "tab.activeForeground": ["tab.activeBackground", "editor.background", "tab.hoverBackground"],
  "tab.unfocusedActiveForeground": ["tab.unfocusedActiveBackground", "editor.background", "tab.unfocusedHoverBackground"],
  "tab.selectedForeground": ["tab.selectedBackground", "editor.background"],
  "modernTab.activeForeground": ["modernTab.activeBackground", "sideBar.background", "modernTab.hoverBackground"],
  "modernEditorTab.activeForeground": ["modernEditorTab.activeBackground", "editor.background", "modernEditorTab.activeHoverBackground"],
  "activityBar.foreground": ["activityBar.activeBackground", "activityBar.background"],
  "activityBarTop.foreground": ["activityBarTop.activeBackground", "sideBar.background"],
  "modernActivityBarItem.activeForeground": ["modernActivityBarItem.activeBackground", "modernActivityBar.background", "modernActivityBarItem.hoverBackground"],
  "panelTitle.activeForeground": ["panel.background", "panel.background"],
  "menu.selectionForeground": ["menu.selectionBackground", "menu.background"],
  "menubar.selectionForeground": ["menubar.selectionBackground", "titleBar.activeBackground"],
  "list.activeSelectionForeground": ["list.activeSelectionBackground", "sideBar.background"],
  "list.activeSelectionIconForeground": ["list.activeSelectionBackground", "sideBar.background"],
  "list.inactiveSelectionForeground": ["list.inactiveSelectionBackground", "sideBar.background"],
  "list.inactiveSelectionIconForeground": ["list.inactiveSelectionBackground", "sideBar.background"],
  "list.focusForeground": ["list.focusBackground", "sideBar.background"]
};

export const statefulStatusColors = {
  "statusBar.background": "accent",
  "statusBar.foreground": "text",
  "statusBar.inactiveBackground": "accent",
  "statusBar.debuggingBackground": "accent",
  "statusBar.debuggingForeground": "text",
  "statusBar.debuggingBorder": "accent",
  "statusBar.noFolderBackground": "surface",
  "statusBar.noFolderForeground": "text",
  "statusBar.noFolderBorder": "border",
  "statusBarItem.hoverBackground": "accent",
  "statusBarItem.hoverForeground": "text",
  "statusBarItem.activeBackground": "accent",
  "statusBarItem.remoteBackground": "accent",
  "statusBarItem.remoteForeground": "text",
  "statusBarItem.remoteHoverBackground": "accent",
  "statusBarItem.remoteHoverForeground": "text"
} as const satisfies Record<string, ColorRole>;

export function tintOverlay(color: string, accent: string, profile: OverlayTintProfile = "overlay"): string {
  const source = toOklch(accent);
  if (source.c < overlayTint.achromaticThreshold || parseColor(color).alpha === 0) return color;
  const base = toOklch(color);
  const strength = profile === "quiet" ? overlayTint.quietScale : 1;
  const chroma = Math.min(source.c * overlayTint.accentMix, overlayTint.maximumChroma) * strength;
  const hue = source.h ?? 0;
  const lightness = profile === "surface" ? base.l
    : base.l + (source.l - base.l) * overlayTint.accentMix * strength;
  return toHex({
    mode: "oklch", l: lightness, h: hue,
    c: limitOklchChroma(lightness, chroma, hue), alpha: parseColor(color).alpha
  });
}

export function limitPaintedTintChroma(color: string, reference: string, background: string): string {
  if (parseColor(background).alpha !== 1) throw new Error("Painted tint consistency requires an opaque backdrop.");
  const paintedChroma = (value: string) => {
    const alpha = parseColor(value).alpha ?? 1;
    return Math.max(...[alpha, nativeCssAlpha(alpha)].map((opacity) =>
      toOklch(compositeColors(value, background, opacity)).c));
  };
  const source = toOklch(color);
  const neutral = toHex({ ...source, c: 0 });
  // Keep the backdrop's existing color; only limit the extra tint.
  const maximum = Math.max(paintedChroma(reference), paintedChroma(neutral));
  if (paintedChroma(color) <= maximum) return color;
  let lower = 0;
  let upper = source.c;
  let selected = neutral;
  for (let iteration = 0; iteration < 24; iteration++) {
    const middle = (lower + upper) / 2;
    const candidate = toHex({ ...source, c: middle });
    if (paintedChroma(candidate) <= maximum) {
      lower = middle;
      selected = candidate;
    } else {
      upper = middle;
    }
  }
  return selected;
}

export function readableAccent(accent: string, foreground: string, backgrounds: readonly string[]): string {
  const ratio = (color: string) => Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
  const primary = toOklch(foreground);
  const accentColor = toOklch(accent);
  const source = accentColor.c < overlayTint.achromaticThreshold ? primary : { ...accentColor, l: primary.l };
  const preferred = accentColor.c < overlayTint.achromaticThreshold ? foreground : toHex({
    ...source, c: limitOklchChroma(source.l, source.c, source.h ?? 0)
  });
  if (ratio(preferred) >= activeItemContrastTarget) return preferred.toLowerCase();
  let best: { color: string; distance: number } | undefined;
  let fallback: { color: string; ratio: number } = { color: contrastingForeground(backgrounds[0]!), ratio: 0 };
  // Check encoded colors across the range; multiple backdrops need not have a monotonic contrast curve.
  const consider = (lightness: number) => {
    const color = toHex({
      mode: "oklch", l: lightness, h: source.h ?? 0,
      c: limitOklchChroma(lightness, source.c, source.h ?? 0)
    });
    const contrast = ratio(color);
    if (contrast > fallback.ratio) fallback = { color, ratio: contrast };
    const distance = Math.abs(lightness - source.l);
    if (contrast >= activeItemContrastTarget && (!best || distance < best.distance)) best = { color, distance };
  };
  for (let step = 0; step <= 100; step++) consider(step / 100);
  if (!best) {
    for (let step = 1; step < 1000; step++) if (step % 10 !== 0) consider(step / 1000);
  }
  return best?.color ?? fallback.color;
}

export function withAccentActiveItems(palette: GeneratedPalette, accent: string): GeneratedPalette {
  const primary = palette.colors.foreground;
  if (!primary || parseColor(primary).alpha !== 1) throw new Error("Accent active items require an opaque primary foreground.");
  const primaryColor = toOklch(primary);
  const lightness = toOklch(accent).c < overlayTint.achromaticThreshold ? primaryColor.l
    : clamp(primaryColor.l, activeItemLightness.min, activeItemLightness.max);
  // Pure black and white have no room for accent chroma.
  const readablePrimary = lightness === primaryColor.l ? primary : toHex({ ...primaryColor, l: lightness });
  const colors = { ...palette.colors };
  const cache = new Map<string, string>();
  for (const [id, [backgroundId, canvasId, hoverId]] of Object.entries(activeItemTargets)) {
    if (colors[id] === undefined) continue;
    const canvas = colors[canvasId];
    if (!canvas) throw new Error(`Accent active items are missing their backdrop ${canvasId}.`);
    const fills = [backgroundId, ...(hoverId ? [hoverId] : [])].map((id) => colors[id]);
    const backgrounds = [...new Set(fills.flatMap((fill) => fill === undefined ? [canvas] : [
      compositeColors(fill, canvas), compositeColors(fill, canvas, nativeCssAlpha(parseColor(fill).alpha ?? 1))
    ]))];
    const key = backgrounds.join("/");
    let foreground = cache.get(key);
    if (!foreground) {
      const solidAccent = fills.find((fill, index) => fill !== undefined && parseColor(fill).alpha === 1 &&
        palette.roles[index === 0 ? backgroundId : hoverId!] === "accent");
      const solidForeground = solidAccent ? contrastingForeground(solidAccent) : undefined;
      foreground = solidForeground && backgrounds.every((background) =>
        contrastRatio(solidForeground, background) >= activeItemContrastTarget)
        ? solidForeground : readableAccent(accent, readablePrimary, backgrounds);
      cache.set(key, foreground);
    }
    colors[id] = foreground;
  }
  return { ...palette, colors };
}

export function withStatefulStatusBar(
  reference: ReferenceTheme, palette: GeneratedPalette, debugColor: string
): GeneratedPalette {
  const required = (id: string) => {
    const value = palette.colors[id];
    if (!value) throw new Error(`Stateful status bar is missing ${id}.`);
    return value;
  };
  const accent = required("button.background");
  const hover = required("button.hoverBackground");
  const quiet = required("surface.background");
  const border = required("surface.border");
  const values: Record<keyof typeof statefulStatusColors, string> = {
    "statusBar.background": accent,
    "statusBar.foreground": contrastingForeground(accent),
    "statusBar.inactiveBackground": accent,
    "statusBar.debuggingBackground": debugColor,
    "statusBar.debuggingForeground": contrastingForeground(debugColor),
    "statusBar.debuggingBorder": debugColor,
    "statusBar.noFolderBackground": quiet,
    "statusBar.noFolderForeground": contrastingForeground(quiet),
    "statusBar.noFolderBorder": border,
    "statusBarItem.hoverBackground": hover,
    "statusBarItem.hoverForeground": contrastingForeground(hover),
    "statusBarItem.activeBackground": hover,
    "statusBarItem.remoteBackground": hover,
    "statusBarItem.remoteForeground": contrastingForeground(hover),
    "statusBarItem.remoteHoverBackground": accent,
    "statusBarItem.remoteHoverForeground": contrastingForeground(accent)
  };
  const result = { ...palette, colors: { ...palette.colors }, roles: { ...palette.roles }, coverage: { ...palette.coverage } };
  for (const id of Object.keys(statefulStatusColors) as (keyof typeof statefulStatusColors)[]) {
    if (reference.colors[id]?.value === null) continue;
    if (result.colors[id] === undefined) {
      result.coverage.unscoredGenerated++;
    } else if (result.roles[id] === "preserved") {
      result.coverage.preserved--;
      result.coverage.generated++;
    }
    result.colors[id] = values[id];
    result.roles[id] = statefulStatusColors[id];
  }
  return result;
}
