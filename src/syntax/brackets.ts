import { contrastRatio, limitOklchChroma, parseColor, toHex, toOklch } from "../color";
import { syntaxWheelFamilies } from "../shared/types";
import type { GeneratedBrackets, ResolvedSyntax } from "../shared/types";
import { requireRecord } from "../shared/validation";
import { renderResolvedSyntaxColor } from "./index";

export const unexpectedBracketId = "editorBracketHighlight.unexpectedBracket.foreground";
export const bracketColorIds = [
  ...syntaxWheelFamilies.flatMap((_, index) => [
    `editorBracketHighlight.foreground${index + 1}`,
    `editorBracketPairGuide.background${index + 1}`,
    `editorBracketPairGuide.activeBackground${index + 1}`
  ]),
  unexpectedBracketId
];

export function parseBracketColors(value: unknown): Record<string, string> {
  const input = requireRecord(value, "Bracket colors");
  if (Object.keys(input).length !== bracketColorIds.length || Object.keys(input).some((id) => !bracketColorIds.includes(id))) {
    throw new Error("Bracket colors must contain exactly the six nesting/guide slots and unexpected-bracket color.");
  }
  return Object.fromEntries(bracketColorIds.map((id) => {
    const color = input[id];
    if (typeof color !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color) ||
      (id.startsWith("editorBracketHighlight.") && parseColor(color).alpha !== 1)) {
      throw new Error(`Bracket color ${id} must be a valid hex color; bracket foregrounds must be opaque.`);
    }
    return [id, color.toLowerCase()];
  }));
}

function vividError(error: string, background: string) {
  const color = toOklch(error);
  const usesRedFallback = color.c < 0.01;
  const hue = usesRedFallback ? toOklch("#ff0000").h ?? 0 : color.h ?? 0;
  let best: { foreground: string; ratio: number; chroma: number } | undefined;
  // Maximize displayable chroma while meeting text contrast after RGB quantization.
  for (let step = 0; step <= 100; step++) {
    const lightness = step / 100;
    const foreground = toHex({
      mode: "oklch", l: lightness, h: hue,
      c: limitOklchChroma(lightness, 0.3, hue)
    });
    const ratio = contrastRatio(foreground, background);
    const chroma = toOklch(foreground).c;
    if (ratio >= 4.5 && (!best || chroma > best.chroma)) best = { foreground, ratio, chroma };
  }
  if (!best) throw new Error("No readable unexpected-bracket color could be generated.");
  return { ...best, usesRedFallback };
}

export function generateBracketPalette(
  resolved: ResolvedSyntax,
  error: string,
  background: string,
  monochrome = false
): GeneratedBrackets {
  if (typeof monochrome !== "boolean") throw new Error("Monochrome brackets must be a boolean.");
  if (!/^#[0-9a-f]{6}$/i.test(error) || !/^#[0-9a-f]{6}$/i.test(background)) {
    throw new Error("Bracket error and editor background must be opaque six-digit hex colors.");
  }
  const colors: Record<string, string> = {};
  syntaxWheelFamilies.forEach((family, index) => {
    const foreground = renderResolvedSyntaxColor(resolved, monochrome ? "neutral" : family);
    colors[`editorBracketHighlight.foreground${index + 1}`] = foreground;
    colors[`editorBracketPairGuide.background${index + 1}`] = `${foreground}40`;
    colors[`editorBracketPairGuide.activeBackground${index + 1}`] = `${foreground}a6`;
  });
  const unexpected = vividError(error, background);
  colors[unexpectedBracketId] = unexpected.foreground;
  return {
    colors: parseBracketColors(colors),
    usesRedFallback: unexpected.usesRedFallback,
    contrast: {
      label: "Unexpected bracket (boosted Error hue)",
      foreground: unexpected.foreground, background,
      ratio: unexpected.ratio, target: 4.5, passes: unexpected.ratio >= 4.5
    }
  };
}
