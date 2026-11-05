import { randomBytes } from "node:crypto";
import path from "node:path";
import * as vscode from "vscode";
import { evaluatePalette, generatePalette, getDefaultParameters } from "../model/index";
import { controls, modelDefinitions } from "../model/rules";
import { reference, references } from "../shared/reference";
import { editorSamples } from "../shared/samples";
import { AppState, ClientMessage, HostMessage, SyntaxParameters, ThemeDraft, ThemeMode, ThemeParameters, ThemeSettingsTarget, previewThemeNames, themeSettingsTargets } from "../shared/types";
import { parseClientMessage, parseParameters, parseSyntaxParameters, parseThemeMode } from "../shared/validation";
import { getSyntaxModel, getDefaultSyntaxParameters, getSyntaxAnchors, resetSyntaxGroup, setSyntaxAuto, setSyntaxPaletteMode } from "../syntax";
import { generateTheme, managedThemeColorIds, themeColors } from "../theme";
import { ThemerApi } from "./api";
import { createThemeDocument } from "./export";
import { PreviewAdapter, PreviewSession, previewConfirmation } from "./preview";
import { SerialQueue } from "./queue";
import { createVscodePreviewAdapter } from "./vscode-adapter";
import { migrateThemeNames } from "./theme-names";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

class ThemerController {
  private readonly queue = new SerialQueue();
  private readonly preview: PreviewSession;
  private readonly userApply: PreviewSession;
  private readonly settingsAdapters: Record<ThemeSettingsTarget, PreviewAdapter>;
  private readonly drafts = new Map<ThemeMode, ThemeDraft>();
  private panel: vscode.WebviewPanel | undefined;
  private revision = 0;
  private parameters: ThemeParameters;
  private syntaxParameters: SyntaxParameters = getDefaultSyntaxParameters(reference);
  private busy = false;
  private ready = false;
  private recoveryPending: boolean;
  private previewFaulted = false;
  private status = "Gallery only. Live preview is off; no theme settings have been changed.";
  private updateTimer: ReturnType<typeof setTimeout> | undefined;

  private get reference() { return references[this.parameters.mode]; }
  private get syntaxFit() { return getSyntaxModel(this.reference); }
  private get workspaceAvailable() {
    return vscode.workspace.workspaceFile !== undefined || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.settingsAdapters = {
      user: createVscodePreviewAdapter(context, "user"),
      workspace: createVscodePreviewAdapter(context)
    };
    this.preview = new PreviewSession(this.settingsAdapters.workspace, managedThemeColorIds);
    this.userApply = new PreviewSession(this.settingsAdapters.user, managedThemeColorIds);
    this.recoveryPending = this.preview.active || this.userApply.active;
    this.parameters = getDefaultParameters(reference);
    if (this.recoveryPending) {
      this.status = "An unfinished theme settings operation needs recovery. Restore or keep it before applying another theme.";
    }
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => this.sendState()));
  }

  async updateThemeNames(): Promise<void> {
    for (const target of themeSettingsTargets) {
      if ((target === "user" ? this.userApply : this.preview).active) continue;
      if (await migrateThemeNames(this.settingsAdapters[target])) {
        this.output.appendLine(`Updated ${target} theme names to Themer Lab Dark/Light. Original legacy scopes were retained.`);
      }
    }
  }

  api(): ThemerApi {
    return {
      getState: () => structuredClone(this.state()),
      ...(this.context.extensionMode === vscode.ExtensionMode.Test ? {
        testing: {
          ready: () => this.ready,
          setMode: (mode) => this.queue.run(async () => {
            const selected = parseThemeMode(mode);
            if (selected === this.parameters.mode) return;
            const draft = this.drafts.get(selected) ?? {
              parameters: getDefaultParameters(references[selected]),
              syntaxParameters: getDefaultSyntaxParameters(references[selected])
            };
            this.setParameters(draft.parameters, draft.syntaxParameters, this.revision + 1);
            await this.flushLiveUpdate();
          }),
          setParameters: (parameters: ThemeParameters) => this.queue.run(async () => {
            this.setParameters(parameters, this.syntaxParameters, this.revision + 1);
            await this.flushLiveUpdate();
          }),
          setSyntaxParameters: (parameters: SyntaxParameters) => this.queue.run(async () => {
            this.setParameters(this.parameters, parameters, this.revision + 1);
            await this.flushLiveUpdate();
          }),
          setSyntaxAuto: (mode, enabled) => this.queue.run(async () => {
            const palette = generatePalette(this.reference, this.parameters);
            const parameters = setSyntaxAuto(this.syntaxFit, this.syntaxParameters, getSyntaxAnchors(this.parameters, palette), mode, enabled);
            this.setParameters(this.parameters, parameters, this.revision + 1);
            await this.flushLiveUpdate();
          }),
          setSyntaxPaletteMode: (mode) => this.queue.run(async () => {
            const palette = generatePalette(this.reference, this.parameters);
            const parameters = setSyntaxPaletteMode(this.syntaxFit, this.syntaxParameters,
              getSyntaxAnchors(this.parameters, palette), mode);
            this.setParameters(this.parameters, parameters, this.revision + 1);
            await this.flushLiveUpdate();
          }),
          resetSyntaxGroup: (mode) => this.queue.run(async () => {
            this.setParameters(this.parameters, resetSyntaxGroup(this.syntaxFit, this.syntaxParameters, mode), this.revision + 1);
            await this.flushLiveUpdate();
          }),
          resetSyntax: () => this.queue.run(async () => {
            await this.handleMessage({ type: "resetSyntax" });
            await this.flushLiveUpdate();
          }),
          startPreview: () => this.queue.run(() => this.startPreview(true)),
          restorePreview: () => this.queue.run(() => this.restorePreview()),
          applyTheme: (target = "user") => this.queue.run(() => this.applyTheme(target))
        }
      } : {})
    };
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "themer.editor",
      "Themer Lab",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")]
      }
    );
    this.panel = panel;
    this.ready = false;
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"));
    const stylesheet = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css"));
    const nonce = randomBytes(24).toString("hex");
    panel.webview.html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeAttribute(panel.webview.cspSource)}; script-src 'nonce-${nonce}'; img-src ${escapeAttribute(panel.webview.cspSource)} data:;">
<title>Themer Lab: Live Theme Builder</title>
<link rel="stylesheet" href="${escapeAttribute(stylesheet.toString())}">
</head>
<body><div id="app"></div><script nonce="${nonce}" src="${escapeAttribute(script.toString())}"></script></body>
</html>`;
    panel.webview.onDidReceiveMessage((message: unknown) => {
      this.dispatch(() => this.handleMessage(parseClientMessage(message)));
    }, undefined, this.context.subscriptions);
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
      this.clearUpdateTimer();
      this.dispatch(async () => {
        if ((this.preview.active || this.userApply.active) && !this.recoveryPending) {
          await this.restorePreview();
        }
      });
    }, undefined, this.context.subscriptions);
  }

  async openSample(language?: unknown): Promise<void> {
    let sample: (typeof editorSamples)[number] | undefined;
    if (language === undefined) {
      const selection = await vscode.window.showQuickPick(
        editorSamples.map((entry) => ({
          label: entry.label,
          description: entry.file,
          detail: entry.detail,
          sample: entry
        })),
        {
          title: "Themer Lab syntax samples",
          placeHolder: "Choose a language to open in the real editor",
          matchOnDescription: true,
          matchOnDetail: true
        }
      );
      sample = selection?.sample;
    } else {
      sample = editorSamples.find((entry) => entry.language === language);
      if (!sample) {
        throw new Error("Unsupported sample language.");
      }
    }
    if (!sample) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(this.context.extensionUri, "samples", sample.file)
    );
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.window.activeTextEditor?.viewColumn ??
        (this.panel ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active),
      preview: false
    });
  }

  async offerRecovery(notifyIfEmpty = false): Promise<void> {
    if (!this.recoveryPending && !this.previewFaulted && !notifyIfEmpty) {
      return;
    }
    if (!this.preview.active && !this.userApply.active) {
      if (notifyIfEmpty) void vscode.window.showInformationMessage("Themer Lab has no unfinished theme settings operation to review.");
      return;
    }
    for (const [session, label, keepLabel] of [
      [this.userApply, "User-settings save", "Keep User settings"],
      [this.preview, "workspace theme preview", "Keep workspace theme"]
    ] as const) {
      const operation = session.recoveryToken;
      if (operation === undefined) continue;
      const choice = await vscode.window.showWarningMessage(
        `Themer Lab found an unfinished ${label}. Nothing will be overwritten without your choice.`,
        "Restore previous settings",
        ...(session.canKeep ? [keepLabel] : [])
      );
      if (choice === "Restore previous settings") {
        await this.queue.run(() => this.restorePreview(session, operation));
      } else if (choice === keepLabel) {
        await this.queue.run(async () => {
          await session.keep(operation);
          this.previewFaulted = this.preview.active && this.previewFaulted;
          this.recoveryPending = this.preview.active || this.userApply.active;
          await this.updateThemeNames();
          this.status = `${keepLabel === "Keep User settings" ? "User settings" : "Workspace theme"} kept. Recovery state cleared for that target.`;
          this.sendState();
        });
      } else {
        return;
      }
    }
  }

  async restoreCommand(): Promise<void> {
    await this.queue.run(async () => {
      if (!this.preview.active && !this.userApply.active) {
        void vscode.window.showInformationMessage("Themer Lab has no unfinished theme settings operation to restore.");
        return;
      }
      await this.restorePreview();
    });
  }

  async shutdown(): Promise<void> {
    this.clearUpdateTimer();
    await this.queue.run(async () => {
      if ((this.preview.active || this.userApply.active) && !this.recoveryPending) {
        await this.restorePreview();
      }
    });
  }

  report(error: unknown): void {
    const message = errorMessage(error);
    this.status = message;
    this.output.appendLine(`[${new Date().toISOString()}] ${error instanceof Error ? error.stack ?? message : message}`);
    void vscode.window.showErrorMessage(`Themer Lab: ${message}`);
    this.post({ type: "error", message });
    this.sendState();
  }

  private state(): AppState {
    const { palette, syntax } = generateTheme(this.reference, this.parameters, this.syntaxParameters, this.syntaxFit);
    return {
      revision: this.revision,
      drafts: {
        ...Object.fromEntries(this.drafts),
        [this.parameters.mode]: { parameters: structuredClone(this.parameters), syntaxParameters: structuredClone(this.syntaxParameters) }
      },
      baseline: {
        name: this.reference.theme.name,
        version: this.reference.vscode.version,
        explicitColorCount: Object.keys(this.reference.colors).length,
        limitation: "UI fidelity covers explicit inherited colors, not registered defaults. Missing supported classic/Modern counterparts are unscored. Syntax has a separate 24-sample native test. Brackets use Colors 1-6 or Neutral 7. Optional stateful status colors are intentional changes, not baseline reconstruction."
      },
      parameters: { ...this.parameters },
      syntax,
      palette,
      evaluation: evaluatePalette(this.reference, palette),
      model: {
        controlCount: controls.length,
        fixedRuleCount: modelDefinitions[this.parameters.mode].fixedRuleCount,
        exceptionCount: palette.coverage.preserved
      },
      livePreview: this.preview.active,
      workspaceAvailable: this.workspaceAvailable,
      recoveryPending: this.recoveryPending || this.previewFaulted,
      busy: this.busy,
      status: this.status
    };
  }

  private async handleMessage(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.ready = true;
        this.sendState();
        break;
      case "parameters":
        if (message.revision > this.revision) {
          this.setParameters(message.parameters, message.syntaxParameters, message.revision);
          this.scheduleLiveUpdate();
        }
        this.sendState();
        break;
      case "reset":
        this.setParameters(getDefaultParameters(this.reference), getDefaultSyntaxParameters(this.reference), this.revision);
        this.status = "Current theme mode reset to its fitted baseline. All syntax Auto modes are on; the other mode's draft is unchanged.";
        this.scheduleLiveUpdate();
        this.sendState();
        break;
      case "resetSyntax":
        this.setParameters(this.parameters, getDefaultSyntaxParameters(this.reference), this.revision);
        this.status = "Syntax defaults restored with all Auto modes on, following the current UI anchors. UI controls are unchanged.";
        this.scheduleLiveUpdate();
        this.sendState();
        break;
      case "export":
        await this.withBusy(() => this.exportTheme());
        break;
      case "livePreview":
        await this.withBusy(() => message.enabled ? this.startPreview(false) : this.restorePreview());
        break;
      case "apply":
        await this.withBusy(() => this.applyTheme("user"));
        break;
      case "applyWorkspace":
        await this.withBusy(() => this.applyTheme("workspace"));
        break;
      case "cancel":
        await this.withBusy(() => this.restorePreview());
        break;
      case "openSample":
        await this.openSample(message.language);
        this.sendState();
        break;
    }
  }

  private setParameters(parameters: ThemeParameters, syntaxParameters: SyntaxParameters, revision: number): void {
    const parsed = parseParameters(parameters);
    const syntax = parseSyntaxParameters(syntaxParameters);
    generateTheme(references[parsed.mode], parsed, syntax, getSyntaxModel(references[parsed.mode]));
    this.drafts.set(this.parameters.mode, {
      parameters: structuredClone(this.parameters), syntaxParameters: structuredClone(this.syntaxParameters)
    });
    this.parameters = parsed;
    this.syntaxParameters = syntax;
    this.drafts.set(parsed.mode, { parameters: structuredClone(parsed), syntaxParameters: structuredClone(syntax) });
    this.revision = revision;
    if (!this.preview.active && !this.userApply.active) {
      this.status = "Gallery updated. Live preview is off; no theme settings were changed.";
    }
  }

  private async startPreview(testOnly: boolean): Promise<void> {
    if (this.recoveryPending || this.userApply.active) {
      throw new Error("Restore or keep the unfinished theme settings operation before starting live preview.");
    }
    if (this.preview.active) {
      throw new Error("Restore or keep the existing preview before starting another.");
    }
    if (!this.workspaceAvailable) {
      throw new Error("Open a folder or workspace before enabling live preview. Apply to User settings, the gallery and theme export work without one.");
    }
    if (testOnly && this.context.extensionMode !== vscode.ExtensionMode.Test) {
      throw new Error("Unconfirmed preview is available only to the isolated extension test host.");
    }
    await this.updateThemeNames();
    if (!testOnly) {
      const choice = await vscode.window.showWarningMessage(
        previewConfirmation,
        { modal: true },
        "Start workspace preview"
      );
      if (choice !== "Start workspace preview" || !this.panel) {
        this.status = "Live preview was not started. No settings were changed.";
        return;
      }
    }
    const { palette, syntax } = generateTheme(this.reference, this.parameters, this.syntaxParameters, this.syntaxFit);
    try {
      await this.preview.start(themeColors(palette, syntax.palette, syntax.brackets), syntax.palette, this.parameters.mode);
    } catch (error) {
      this.previewFaulted = this.preview.active;
      throw error;
    }
    this.previewFaulted = false;
    this.recoveryPending = false;
    this.status = `Live preview is active on ${previewThemeNames[this.parameters.mode]}; bracket colorization is enabled. Cancel restores; Apply saves to User settings; Apply workspace keeps workspace settings.`;
    this.sendState();
  }

  private scheduleLiveUpdate(): void {
    this.clearUpdateTimer();
    if (!this.preview.active || this.previewFaulted || this.recoveryPending) {
      return;
    }
    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;
      this.dispatch(() => this.flushLiveUpdate());
    }, 120);
  }

  private async flushLiveUpdate(): Promise<void> {
    this.clearUpdateTimer();
    if (!this.preview.active || this.previewFaulted || this.recoveryPending) {
      return;
    }
    try {
      const { palette, syntax } = generateTheme(this.reference, this.parameters, this.syntaxParameters, this.syntaxFit);
      await this.preview.update(themeColors(palette, syntax.palette, syntax.brackets), syntax.palette, this.parameters.mode);
      this.status = "Live workspace theme updated. Cancel restores; Apply saves to User settings; Apply workspace keeps workspace settings.";
      this.sendState();
    } catch (error) {
      this.previewFaulted = true;
      throw error;
    }
  }

  private async restorePreview(selected?: PreviewSession, operation?: symbol): Promise<void> {
    if (operation !== undefined && operation !== selected?.recoveryToken) {
      throw new Error("That recovery operation is no longer active. No settings were changed; review the current operation instead.");
    }
    this.clearUpdateTimer();
    if (!this.preview.active && !this.userApply.active) {
      this.status = "No unfinished theme settings operation is active. Settings were not changed.";
      this.sendState();
      return;
    }
    const conflicts: string[] = [];
    try {
      for (const session of selected ? [selected] : [this.userApply, this.preview]) {
        if (session.active) conflicts.push(...(await session.restore(operation)).conflicts);
      }
      await this.updateThemeNames();
    } catch (error) {
      this.recoveryPending = this.preview.active || this.userApply.active;
      this.previewFaulted = this.preview.active;
      throw error;
    }
    this.previewFaulted = this.preview.active && this.previewFaulted;
    this.recoveryPending = this.preview.active || this.userApply.active;
    if (conflicts.length > 0) {
      this.status = `Theme settings restored except for externally edited values, which were preserved: ${conflicts.join(", ")}.`;
      this.output.appendLine(this.status);
      void vscode.window.showWarningMessage(`Themer Lab: ${this.status}`);
    } else {
      this.status = this.recoveryPending
        ? "Selected theme settings restored. Another unfinished operation still needs recovery."
        : "Previous theme settings restored. Live preview is off.";
    }
    this.sendState();
  }

  private async applyTheme(target: ThemeSettingsTarget): Promise<void> {
    this.clearUpdateTimer();
    if (!themeSettingsTargets.includes(target)) throw new Error("Apply target must be user or workspace.");
    if (this.recoveryPending || this.previewFaulted || this.userApply.active) {
      throw new Error("Restore or keep the unfinished theme settings operation before applying another theme.");
    }
    if (target === "workspace" && !this.workspaceAvailable) {
      throw new Error("Open a folder or workspace before choosing Apply workspace. Apply saves to User settings without a workspace.");
    }
    try {
      await this.updateThemeNames();
      if (target === "workspace" && this.preview.active) await this.flushLiveUpdate();
      const { palette, syntax } = generateTheme(this.reference, this.parameters, this.syntaxParameters, this.syntaxFit);
      const colors = themeColors(palette, syntax.palette, syntax.brackets);
      if (target === "workspace") {
        if (this.preview.active) await this.preview.keep();
        else await this.preview.apply(colors, syntax.palette, this.parameters.mode);
      } else {
        if (this.preview.active) {
          const restored = await this.preview.restore();
          await this.updateThemeNames();
          if (restored.conflicts.length > 0) {
            throw new Error(`User settings were not saved because workspace preview values changed externally: ${restored.conflicts.join(", ")}. Those edits were preserved.`);
          }
        }
        await this.userApply.apply(colors, syntax.palette, this.parameters.mode);
      }
    } catch (error) {
      this.recoveryPending = this.preview.active || this.userApply.active;
      this.previewFaulted = this.preview.active;
      throw error;
    }
    this.previewFaulted = false;
    this.recoveryPending = false;
    this.status = target === "user"
      ? "Theme saved to User settings for this VS Code profile. Temporary workspace preview settings were restored. Existing workspace overrides, if any, still take precedence. Live preview is off."
      : "Theme saved to Workspace settings. User settings were not changed. Live preview is off.";
    if (target === "user") {
      const workbench = vscode.workspace.getConfiguration("workbench");
      const editor = vscode.workspace.getConfiguration("editor");
      if ([
        workbench.inspect("colorTheme")?.workspaceValue,
        workbench.inspect("colorCustomizations")?.workspaceValue,
        editor.inspect("tokenColorCustomizations")?.workspaceValue,
        editor.inspect("semanticTokenColorCustomizations")?.workspaceValue,
        editor.inspect("bracketPairColorization.enabled")?.workspaceValue
      ].some((value) => value !== undefined)) {
        void vscode.window.showWarningMessage("Themer Lab saved the theme to User settings. Existing workspace settings were preserved and may override its theme, colors, syntax or bracket colorization in this window. Use Apply workspace to save this theme to the workspace instead.");
      }
    }
    this.sendState();
  }

  private async exportTheme(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const target = await vscode.window.showSaveDialog({
      title: "Export a standalone VS Code color theme",
      defaultUri: folder ? vscode.Uri.joinPath(folder, "themer-lab-color-theme.json") : undefined,
      filters: { "VS Code Color Theme": ["json"] },
      saveLabel: "Export theme"
    });
    if (!target) {
      this.status = "Export canceled. No file was written.";
      return;
    }
    const name = path.posix.basename(target.path).replace(/(?:-color-theme)?\.json$/i, "") || "Themer Lab Theme";
    const { palette, syntax } = generateTheme(this.reference, this.parameters, this.syntaxParameters, this.syntaxFit);
    const document = createThemeDocument(
      this.reference,
      palette,
      name,
      syntax.palette,
      syntax.brackets
    );
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`));
    this.status = `Theme exported to ${target.fsPath}, including UI, syntax, and bracket colors. Editor behavior settings are not part of a theme file.`;
    void vscode.window.showInformationMessage("Themer Lab theme exported. To distribute it, register the JSON in a theme extension's contributes.themes.");
  }

  private async withBusy(operation: () => Promise<void>): Promise<void> {
    this.busy = true;
    this.sendState();
    try {
      await operation();
    } finally {
      this.busy = false;
      this.sendState();
    }
  }

  private clearUpdateTimer(): void {
    if (this.updateTimer !== undefined) {
      clearTimeout(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  private dispatch(operation: () => Promise<void> | void): void {
    void this.queue.run(operation).catch((error: unknown) => this.report(error));
  }

  private sendState(): void {
    if (this.panel && this.ready) {
      this.post({ type: "state", state: this.state() });
    }
  }

  private post(message: HostMessage): void {
    const panel = this.panel;
    if (panel) {
      void Promise.resolve(panel.webview.postMessage(message)).catch((error: unknown) => {
        this.output.appendLine(`Could not send webview message: ${errorMessage(error)}`);
        void vscode.window.showErrorMessage(`Themer Lab could not update its panel: ${errorMessage(error)}`);
      });
    }
  }
}

let controller: ThemerController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<ThemerApi> {
  const output = vscode.window.createOutputChannel("Themer Lab");
  context.subscriptions.push(output);
  try {
    const instance = new ThemerController(context, output);
    controller = instance;
    context.subscriptions.push(
      vscode.commands.registerCommand("themer.open", () => instance.open()),
      vscode.commands.registerCommand("themer.openSample", (language?: unknown) =>
        instance.openSample(language).catch((error: unknown) => instance.report(error))),
      vscode.commands.registerCommand("themer.restorePreview", () =>
        instance.restoreCommand().catch((error: unknown) => instance.report(error))),
      vscode.commands.registerCommand("themer.reviewRecovery", () =>
        instance.offerRecovery(true).catch((error: unknown) => instance.report(error)))
    );
    await instance.updateThemeNames().catch((error: unknown) => instance.report(error));
    void instance.offerRecovery().catch((error: unknown) => instance.report(error));
    return instance.api();
  } catch (error) {
    output.appendLine(error instanceof Error ? error.stack ?? error.message : String(error));
    void vscode.window.showErrorMessage(`Themer Lab activation failed: ${errorMessage(error)}`);
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  await controller?.shutdown();
  controller = undefined;
}
