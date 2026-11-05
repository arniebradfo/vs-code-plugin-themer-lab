import * as vscode from "vscode";
import { requireRecord } from "../shared/validation";
import type { ThemeSettingsTarget } from "../shared/types";
import { PreviewAdapter, PreviewJournal, previewJournalKey, userApplyJournalKey } from "./preview";

export function createVscodePreviewAdapter(context: vscode.ExtensionContext, target: ThemeSettingsTarget = "workspace"): PreviewAdapter {
  const configurationTarget = target === "user" ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
  const valueKey = target === "user" ? "globalValue" : "workspaceValue";
  const storage = target === "user" ? context.globalState : context.workspaceState;
  const journalKey = target === "user" ? userApplyJournalKey : previewJournalKey;
  return {
    target,
    read() {
      const configuration = vscode.workspace.getConfiguration("workbench");
      const colors: unknown = configuration.inspect("colorCustomizations")?.[valueKey];
      const theme: unknown = configuration.inspect("colorTheme")?.[valueKey];
      const editor = vscode.workspace.getConfiguration("editor");
      const tokens: unknown = editor.inspect("tokenColorCustomizations")?.[valueKey];
      const semanticTokens: unknown = editor.inspect("semanticTokenColorCustomizations")?.[valueKey];
      const bracketColorization: unknown = editor.inspect("bracketPairColorization.enabled")?.[valueKey];
      if (theme !== undefined && typeof theme !== "string") {
        throw new Error(`The ${target} color theme setting must be a string.`);
      }
      if (bracketColorization !== undefined && typeof bracketColorization !== "boolean") {
        throw new Error(`${target} bracket pair colorization must be a boolean.`);
      }
      return {
        colors: colors === undefined ? undefined : requireRecord(colors, `${target} color customizations`),
        theme,
        ...(tokens === undefined ? {} : { tokens: requireRecord(tokens, `${target} TextMate customizations`) }),
        ...(semanticTokens === undefined ? {} : { semanticTokens: requireRecord(semanticTokens, `${target} semantic customizations`) }),
        ...(bracketColorization === undefined ? {} : { bracketColorization })
      };
    },
    async writeColors(value) {
      await vscode.workspace.getConfiguration("workbench").update("colorCustomizations", value, configurationTarget);
    },
    async writeTheme(value) {
      await vscode.workspace.getConfiguration("workbench").update("colorTheme", value, configurationTarget);
    },
    async writeTokens(value) {
      await vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", value, configurationTarget);
    },
    async writeSemanticTokens(value) {
      await vscode.workspace.getConfiguration("editor").update("semanticTokenColorCustomizations", value, configurationTarget);
    },
    async writeBracketColorization(value) {
      await vscode.workspace.getConfiguration("editor").update("bracketPairColorization.enabled", value, configurationTarget);
    },
    loadJournal() {
      return storage.get<unknown>(journalKey);
    },
    async saveJournal(value: PreviewJournal | undefined) {
      await storage.update(journalKey, value);
    }
  };
}
