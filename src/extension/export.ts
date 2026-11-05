import { GeneratedBrackets, GeneratedPalette, GeneratedSyntax, ReferenceTheme, SemanticTokenStyle, TokenColorRule } from "../shared/types";
import { isThemeColor, parseSemanticColors, parseTokenRules } from "../shared/validation";
import { parseBracketColors } from "../syntax/brackets";
import { withSyntaxSelectionContrast } from "../model/selection";
import { themeColors } from "../theme";

export interface ThemeDocument extends Record<string, unknown> {
  colors: Record<string, string | null>;
  tokenColors: TokenColorRule[];
  semanticHighlighting: boolean;
  semanticTokenColors: Record<string, string | SemanticTokenStyle>;
}

export function createThemeDocument(
  reference: ReferenceTheme,
  palette: GeneratedPalette,
  name: string,
  syntax?: GeneratedSyntax,
  brackets?: GeneratedBrackets
): ThemeDocument {
  if (name.trim().length === 0) {
    throw new Error("The exported theme must have a name.");
  }
  for (const [id, color] of Object.entries(palette.colors)) {
    if (!isThemeColor(color)) {
      throw new Error(`Cannot export invalid color ${id}.`);
    }
  }
  if (syntax && (!/^#[0-9a-f]{6}$/i.test(syntax.editorForeground) || typeof syntax.semanticHighlighting !== "boolean")) {
    throw new Error("Cannot export invalid syntax foreground or semantic highlighting mode.");
  }
  const colors = {
    ...Object.fromEntries(Object.entries(reference.colors).map(([id, entry]) => [id, entry.value])),
    ...themeColors(syntax ? withSyntaxSelectionContrast(palette, syntax) : palette, syntax,
      brackets ? { ...brackets, colors: parseBracketColors(brackets.colors) } : undefined)
  };
  return {
    $schema: "vscode://schemas/color-theme",
    name: name.trim(),
    type: reference.theme.type,
    colors: Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b, "en"))),
    tokenColors: syntax ? parseTokenRules(syntax.tokenColors, "Export syntax rules") : reference.tokenColors,
    semanticHighlighting: syntax?.semanticHighlighting ?? reference.semanticHighlighting,
    semanticTokenColors: syntax ? parseSemanticColors(syntax.semanticTokenColors) : reference.semanticTokenColors
  };
}
