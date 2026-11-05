import { generatePalette } from "./model";
import { statefulStatusColors, withStatefulStatusBar } from "./model/personality";
import { supplementalColors } from "./model/rules";
import { withSyntaxSelectionContrast } from "./model/selection";
import { references } from "./shared/reference";
import type { AppState, GeneratedBrackets, GeneratedPalette, GeneratedSyntax, ReferenceTheme, SyntaxParameters, ThemeParameters } from "./shared/types";
import { evaluateSyntaxContrast, generateResolvedSyntax, getSyntaxAnchors, renderResolvedSyntaxColor, resolveSyntaxParameters } from "./syntax";
import type { SyntaxModel } from "./syntax";
import { bracketColorIds, generateBracketPalette } from "./syntax/brackets";

export const managedThemeColorIds: ReadonlySet<string> = new Set([
  ...Object.values(references).flatMap((reference) => Object.keys(reference.colors)),
  ...Object.keys(supplementalColors),
  ...Object.keys(statefulStatusColors),
  ...bracketColorIds,
  "editor.foreground"
]);

export function themeColors(palette: GeneratedPalette, syntax?: GeneratedSyntax, brackets?: GeneratedBrackets): Record<string, string> {
  return {
    ...palette.colors,
    ...(brackets?.colors),
    ...(syntax ? { "editor.foreground": syntax.editorForeground } : {})
  };
}

export function generateTheme(
  reference: ReferenceTheme, parameters: ThemeParameters, syntaxParameters: SyntaxParameters, model: SyntaxModel
): Pick<AppState, "palette" | "syntax"> {
  if (model.mode !== reference.theme.type) throw new Error("The syntax model must match the selected reference mode.");
  let palette = generatePalette(reference, parameters);
  const anchors = getSyntaxAnchors(parameters, palette);
  const resolved = resolveSyntaxParameters(model, syntaxParameters, anchors);
  const syntax = generateResolvedSyntax(model, resolved);
  palette = withSyntaxSelectionContrast(palette, syntax);
  if (parameters.statefulStatusBar) {
    palette = withStatefulStatusBar(reference, palette, renderResolvedSyntaxColor(resolved, "violet"));
  }
  const background = palette.colors["editor.background"];
  if (!background) throw new Error("The generated editor background is missing.");
  return {
    palette,
    syntax: {
      parameters: { ...syntaxParameters }, resolved, palette: syntax,
      brackets: generateBracketPalette(resolved, parameters.error, background, parameters.monochromeBrackets),
      contrast: evaluateSyntaxContrast(syntax, background)
    }
  };
}
