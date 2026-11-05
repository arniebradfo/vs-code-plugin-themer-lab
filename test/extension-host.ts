import assert from "node:assert/strict";
import * as vscode from "vscode";
import { contrastRatio, toOklab } from "../src/color";
import { ThemerApi } from "../src/extension/api";
import { createThemeDocument } from "../src/extension/export";
import { getDefaultParameters } from "../src/model";
import { legacyPairedPreviewScope, previewScope, previewThemeName } from "../src/extension/preview";
import { lightReference, reference, references } from "../src/shared/reference";
import { editorSamples } from "../src/shared/samples";
import { ThemeDraft, ThemeMode, SyntaxParameters, infoSources, legacyPreviewThemeNames, personalityKeys, previewThemeNames, syntaxAdjustmentParameters, syntaxAutoModes, themeModes } from "../src/shared/types";
import { requireRecord } from "../src/shared/validation";
import { fitSyntaxModel, getSyntaxAnchors, isSyntaxAutomatic, setSyntaxAdjustmentMode } from "../src/syntax";
import { managedThemeColorIds, themeColors } from "../src/theme";

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<ThemerApi>("themer-local.themer-lab");
  assert.ok(extension, "Development extension must be registered.");
  const api = await extension.activate();
  const testing = api.testing;
  assert.ok(testing, "Test helpers must be available only in ExtensionMode.Test.");
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("themer.open"));
  assert.ok(commands.includes("themer.openSample"));
  assert.ok(commands.includes("themer.restorePreview"));
  const configuration = vscode.workspace.getConfiguration("workbench");
  const previousTheme = configuration.inspect("colorTheme")?.workspaceValue;
  const previousColors = configuration.inspect("colorCustomizations")?.workspaceValue;
  const globalTheme = configuration.inspect("colorTheme")?.globalValue;
  const globalColors = configuration.inspect("colorCustomizations")?.globalValue;
  const editorConfiguration = vscode.workspace.getConfiguration("editor");
  const previousTokens = editorConfiguration.inspect("tokenColorCustomizations")?.workspaceValue;
  const previousSemantic = editorConfiguration.inspect("semanticTokenColorCustomizations")?.workspaceValue;
  const globalTokens = editorConfiguration.inspect("tokenColorCustomizations")?.globalValue;
  const globalSemantic = editorConfiguration.inspect("semanticTokenColorCustomizations")?.globalValue;
  const previousBracketColorization = editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue;
  const globalBracketColorization = editorConfiguration.inspect("bracketPairColorization.enabled")?.globalValue;
  const previousGuides = editorConfiguration.inspect("guides.bracketPairs")?.workspaceValue;
  const readSettings = (scope: "globalValue" | "workspaceValue") => ({
    theme: configuration.inspect("colorTheme")?.[scope],
    colors: configuration.inspect("colorCustomizations")?.[scope],
    tokens: editorConfiguration.inspect("tokenColorCustomizations")?.[scope],
    semanticTokens: editorConfiguration.inspect("semanticTokenColorCustomizations")?.[scope],
    brackets: editorConfiguration.inspect("bracketPairColorization.enabled")?.[scope]
  });
  const originalUser = readSettings("globalValue");
  const writeSettings = async (values: ReturnType<typeof readSettings>, target: vscode.ConfigurationTarget) => {
    await configuration.update("colorTheme", values.theme, target);
    await configuration.update("colorCustomizations", values.colors, target);
    await editorConfiguration.update("tokenColorCustomizations", values.tokens, target);
    await editorConfiguration.update("semanticTokenColorCustomizations", values.semanticTokens, target);
    await editorConfiguration.update("bracketPairColorization.enabled", values.brackets, target);
  };
  const assertSaved = (scope: "globalValue" | "workspaceValue", expected: ReturnType<ThemerApi["getState"]>) => {
    const saved = readSettings(scope);
    assert.equal(saved.theme, previewThemeNames[expected.parameters.mode]);
    const colors = requireRecord(requireRecord(saved.colors, "Saved colors")[previewScope], "Saved Themer colors");
    assert.deepEqual(Object.fromEntries(Object.entries(colors).filter(([id]) => managedThemeColorIds.has(id))),
      themeColors(expected.palette, expected.syntax.palette, expected.syntax.brackets), `${scope}: exact managed colors`);
    assert.deepEqual(requireRecord(requireRecord(saved.tokens, "Saved tokens")[previewScope], "Saved Themer tokens").textMateRules,
      expected.syntax.palette.tokenColors);
    assert.deepEqual(requireRecord(saved.semanticTokens, "Saved semantic settings")[previewScope], {
      enabled: expected.syntax.palette.semanticHighlighting, rules: expected.syntax.palette.semanticTokenColors
    });
    assert.equal(saved.brackets, true);
    assert.equal(api.getState().livePreview, false);
    assert.equal(api.getState().recoveryPending, false);
  };
  assert.equal(previousTheme, undefined, "The test must use a clean isolated workspace.");
  assert.equal(previousColors, undefined, "The test must not use normal user/workspace settings.");

  try {
    await vscode.commands.executeCommand("themer.open");
    await waitFor(() => testing.ready(), "the actual webview ready handshake");
    console.log("PASS extension activation, commands, and rendered webview handshake");

    if (process.env.THEMER_EMPTY_WINDOW === "1") {
      assert.equal(vscode.workspace.workspaceFolders, undefined);
      assert.equal(api.getState().workspaceAvailable, false);
      await assert.rejects(testing.startPreview(), /Open a folder or workspace/);
      await assert.rejects(testing.applyTheme("workspace"), /Open a folder or workspace/);
      const beforeWorkspace = readSettings("workspaceValue");
      for (const mode of themeModes) {
        await testing.setMode(mode);
        const draft = api.getState();
        await testing.applyTheme();
        assertSaved("globalValue", draft);
        assert.deepEqual(readSettings("workspaceValue"), beforeWorkspace);
        await waitFor(() => vscode.workspace.getConfiguration("workbench").get("colorTheme") === previewThemeNames[mode],
          `${mode} effective User theme in an empty window`);
        console.log(`PASS ${mode}: default User Apply works in an empty window without preview or workspace writes`);
      }
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      assertSaved("globalValue", api.getState());
      console.log("PASS empty-window User save persists after panel close; workspace actions are rejected");
      return;
    }

    const sampleColumns = new Set<vscode.ViewColumn | undefined>();
    for (const sample of editorSamples) {
      await vscode.commands.executeCommand("themer.openSample", sample.language);
      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, `${sample.label} must open in a real editor.`);
      assert.equal(editor.document.uri.toString(), vscode.Uri.joinPath(extension.extensionUri, "samples", sample.file).toString());
      assert.equal(editor.document.languageId, sample.language, sample.file);
      assert.equal(editor.document.isUntitled, false, sample.file);
      assert.equal(editor.document.isDirty, false, sample.file);
      assert.ok(editor.document.getText().trim().length > 0, sample.file);
      sampleColumns.add(editor.viewColumn);
    }
    assert.equal(sampleColumns.size, 1, "Opening another sample must reuse the sample editor group.");
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.workspaceValue, previousTheme);
    assert.deepEqual(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, previousColors);
    console.log("PASS all 24 on-disk syntax samples open in their native language modes without changing theme settings");

    const initial = api.getState();
    assert.equal(initial.baseline.version, "1.143.0");
    assert.equal(initial.baseline.explicitColorCount, 324);
    assert.equal(initial.livePreview, false);
    assert.equal(initial.model.controlCount, 19);
    assert.equal(initial.model.controlCount, Object.keys(initial.parameters).length);
    assert.equal(initial.parameters.infoSource, "accent");
    for (const key of personalityKeys) assert.equal(initial.parameters[key], false);
    assert.notEqual(initial.palette.colors["editorInfo.foreground"], initial.parameters.accent);
    assert.equal(Object.hasOwn(initial, "variant"), false);
    assert.equal(initial.palette.coverage.total, 324);
    assert.ok(initial.palette.coverage.generated > 0);
    assert.equal(Object.keys(initial.syntax.parameters).length, 15);
    for (const mode of syntaxAutoModes) assert.equal(isSyntaxAutomatic(initial.syntax.parameters, mode), true);
    assert.equal(initial.syntax.parameters.chromaBoost, 0);
    assert.equal(Object.hasOwn(initial.syntax.parameters, "targetChroma"), false);
    assert.equal(Object.hasOwn(initial.syntax.parameters, "chromaEqualization"), false);
    const manualDefaults = fitSyntaxModel(reference).parameters;
    await testing.setSyntaxParameters({ ...manualDefaults, red: "#00ff00" });
    assert.equal(editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue, previousBracketColorization,
      "Draft-only edits must not enable bracket colorization.");
    assert.equal(editorConfiguration.inspect("tokenColorCustomizations")?.workspaceValue, previousTokens);
    assert.equal(editorConfiguration.inspect("semanticTokenColorCustomizations")?.workspaceValue, previousSemantic);
    await testing.resetSyntax();
    const exported = createThemeDocument(reference, initial.palette, "Host Test Theme", initial.syntax.palette, initial.syntax.brackets);
    assert.equal(exported.include, undefined);
    assert.deepEqual(exported.tokenColors, initial.syntax.palette.tokenColors);
    assert.deepEqual(exported.semanticTokenColors, initial.syntax.palette.semanticTokenColors);
    assert.equal(exported.colors["editor.foreground"], initial.syntax.palette.editorForeground);
    assert.equal(exported.colors["editorBracketHighlight.foreground1"], initial.syntax.brackets.colors["editorBracketHighlight.foreground1"]);
    console.log("PASS generated UI/syntax export; draft-only syntax edits do not write settings");

    const darkDraft = {
      ...initial.parameters, accent: "#8060b0", accentActiveItems: true,
      tintNeutralOverlays: true, monochromeBrackets: true, statefulStatusBar: true
    };
    await testing.setParameters(darkDraft);
    const editedDark = api.getState();
    await testing.setMode("light");
    assert.equal(api.getState().parameters.mode, "light");
    assert.equal(api.getState().parameters.background, "#ffffff");
    assert.equal(configuration.inspect("colorTheme")?.workspaceValue, previousTheme);
    const lightDraft = {
      ...api.getState().parameters, accent: "#27934d", mutedContrast: 1.25,
      accentActiveItems: true, tintNeutralOverlays: true, statefulStatusBar: true
    };
    await testing.setParameters(lightDraft);
    await testing.setSyntaxAuto("autoHue", false);
    await testing.setSyntaxParameters({ ...api.getState().syntax.parameters, red: "#bb2266" });
    const editedLight = api.getState();
    await testing.setMode("dark");
    assert.deepEqual(api.getState().parameters, darkDraft);
    assert.deepEqual(api.getState().syntax, editedDark.syntax);
    await testing.setParameters(initial.parameters);
    await testing.setMode("light");
    assert.deepEqual(api.getState().parameters, editedLight.parameters);
    assert.deepEqual(api.getState().syntax, editedLight.syntax);
    await testing.resetSyntax();
    assert.deepEqual(api.getState().parameters, lightDraft);
    assert.equal(api.getState().syntax.parameters.red, "#cf222e");
    await testing.setMode("dark");
    assert.deepEqual(api.getState().parameters, initial.parameters);
    assert.deepEqual(api.getState().syntax, initial.syntax);
    assert.deepEqual(api.getState().drafts.light?.parameters, lightDraft);
    assert.equal(configuration.inspect("colorTheme")?.workspaceValue, previousTheme);
    console.log("PASS separate Dark/Light UI and syntax drafts, Light-only reset, and draft-only mode changes without settings writes");

    await testing.startPreview();
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.workspaceValue, previewThemeName);
    const colors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Preview colors");
    const scoped = requireRecord(colors[previewScope], "Theme-scoped preview colors");
    assert.equal(editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue, true);
    assert.equal(editorConfiguration.inspect("guides.bracketPairs")?.workspaceValue, previousGuides);
    for (const [id, expected] of Object.entries(initial.syntax.brackets.colors)) assert.equal(scoped[id], expected, id);
    assert.equal(scoped["button.background"], initial.palette.colors["button.background"]);
    assert.equal(initial.palette.coverage.unscoredGenerated,
      Object.keys(initial.palette.colors).filter((id) => !Object.hasOwn(reference.colors, id)).length);
    const readSyntax = (key: string) => requireRecord(requireRecord(
      vscode.workspace.getConfiguration("editor").inspect(key)?.workspaceValue, key
    )[previewScope], `${key} preview scope`);
    assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, initial.syntax.palette.tokenColors);
    assert.deepEqual(readSyntax("semanticTokenColorCustomizations"), {
      enabled: initial.syntax.palette.semanticHighlighting,
      rules: initial.syntax.palette.semanticTokenColors
    });
    for (const mode of themeModes) {
      await testing.setMode(mode);
      const saved = api.getState().syntax.parameters;
      await testing.setSyntaxPaletteMode("anchored");
      await testing.setSyntaxParameters({ ...api.getState().syntax.parameters, blue: "#a75287" });
      const anchored = api.getState();
      assert.equal(anchored.syntax.parameters.paletteMode, "anchored");
      assert.equal(anchored.syntax.resolved.colors.blue, "#a75287");
      assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, anchored.syntax.palette.tokenColors);
      assert.deepEqual(readSyntax("semanticTokenColorCustomizations"), {
        enabled: anchored.syntax.palette.semanticHighlighting, rules: anchored.syntax.palette.semanticTokenColors
      });
      const document = createThemeDocument(references[mode], anchored.palette, "Anchored Host Theme",
        anchored.syntax.palette, anchored.syntax.brackets);
      const written = requireRecord(requireRecord(configuration.inspect("colorCustomizations")?.workspaceValue,
        "Anchored workspace colors")[previewScope], "Anchored preview scope");
      for (const [id, color] of Object.entries(anchored.syntax.brackets.colors)) {
        assert.equal(written[id], color);
        assert.equal(document.colors[id], color);
      }
      assert.deepEqual(document.tokenColors, anchored.syntax.palette.tokenColors);
      await testing.setMode(mode === "dark" ? "light" : "dark");
      await testing.setMode(mode);
      assert.deepEqual(api.getState().syntax, anchored.syntax, "Anchored drafts must survive theme-mode switches.");
      await testing.setSyntaxPaletteMode("manual");
      assert.deepEqual(api.getState().syntax.palette, anchored.syntax.palette);
      assert.deepEqual(api.getState().syntax.brackets, anchored.syntax.brackets);
      await testing.setSyntaxParameters(saved);
    }
    await testing.setMode("dark");
    console.log("PASS Dark/Light Anchored drafts, exact Manual capture, real workspace syntax/bracket writes and standalone export parity");
    await testing.setMode("light");
    await testing.setParameters(getDefaultParameters(lightReference));
    await testing.resetSyntax();
    await waitFor(() => vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light, "native Light workbench kind");
    const light = api.getState();
    assert.equal(configuration.inspect("colorTheme")?.workspaceValue, previewThemeNames.light);
    const lightScope = requireRecord(requireRecord(configuration.inspect("colorCustomizations")?.workspaceValue, "Light colors")[previewScope], "Light scope");
    assert.equal(lightScope["editor.background"], "#ffffff");
    assert.equal(lightScope["button.background"], "#0069cc");
    assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, light.syntax.palette.tokenColors);
    const lightExport = createThemeDocument(lightReference, light.palette, "Native Light", light.syntax.palette, light.syntax.brackets);
    assert.equal(lightExport.type, "light");
    assert.equal(lightExport.colors["editor.background"], "#ffffff");
    await testing.setMode("dark");
    await waitFor(() => vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark, "native Dark workbench kind");
    assert.equal(configuration.inspect("colorTheme")?.workspaceValue, previewThemeName);
    assert.deepEqual(api.getState().parameters, initial.parameters);
    const back = requireRecord(requireRecord(configuration.inspect("colorCustomizations")?.workspaceValue, "Restored Dark colors")[previewScope], "Restored Dark scope");
    assert.deepEqual(back, { ...initial.palette.colors, ...initial.syntax.brackets.colors, "editor.foreground": initial.syntax.palette.editorForeground });
    console.log("PASS live Dark/Light switching changes native theme kind, exports Light metadata, removes Light-only colors, and returns to the exact Dark palette");
    for (const infoSource of infoSources) {
      await testing.setParameters({
        ...initial.parameters, infoSource, accent: "#27934d", foreground: "#b0a0c0", info: "#8855ee"
      });
      const current = api.getState();
      const written = requireRecord(requireRecord(
        configuration.inspect("colorCustomizations")?.workspaceValue, "Info source colors"
      )[previewScope], "Info source scope");
      const infoExport = createThemeDocument(reference, current.palette, "Info Sources", current.syntax.palette, current.syntax.brackets);
      for (const [id, role] of Object.entries(current.palette.roles)) {
        if (role !== "info") continue;
        assert.equal(written[id], current.palette.colors[id], `${infoSource}/${id}`);
        assert.equal(infoExport.colors[id], written[id], `${infoSource}/${id}`);
      }
      assert.equal(current.parameters.info, "#8855ee");
      const mark = written["editorInfo.foreground"];
      assert.ok(typeof mark === "string");
      if (infoSource === "custom") assert.equal(mark, "#8855ee");
      else assert.ok(toOklab(mark).l > toOklab(current.parameters[infoSource]).l);
      assert.equal(written.errorForeground, initial.palette.colors.errorForeground);
    }
    await testing.setParameters(initial.parameters);
    console.log("PASS all three Info sources reach live workspace marks/validation colors and standalone export");
    const debugStatusSetting = vscode.workspace.getConfiguration("debug").inspect("enableStatusBarColor")?.workspaceValue;
    for (const key of personalityKeys) {
      await testing.setParameters({ ...initial.parameters, [key]: true });
      const current = api.getState();
      const written = requireRecord(requireRecord(
        configuration.inspect("colorCustomizations")?.workspaceValue, "Personality colors"
      )[previewScope], "Personality scope");
      const document = createThemeDocument(reference, current.palette, "Personality", current.syntax.palette, current.syntax.brackets);
      assert.deepEqual(written, {
        ...current.palette.colors, ...current.syntax.brackets.colors,
        "editor.foreground": current.syntax.palette.editorForeground
      });
      for (const [id, color] of Object.entries(written)) assert.equal(document.colors[id], color, `${key}/${id}`);
      await testing.setParameters(initial.parameters);
      assert.deepEqual(api.getState().palette, initial.palette);
      assert.deepEqual(api.getState().syntax, initial.syntax);
      const restored = requireRecord(requireRecord(
        configuration.inspect("colorCustomizations")?.workspaceValue, "Restored personality colors"
      )[previewScope], "Restored personality scope");
      assert.deepEqual(restored, {
        ...initial.palette.colors, ...initial.syntax.brackets.colors, "editor.foreground": initial.syntax.palette.editorForeground
      }, `${key}: disabling must remove optional status entries, not leave stale colors`);
    }
    assert.equal(vscode.workspace.getConfiguration("debug").inspect("enableStatusBarColor")?.workspaceValue, debugStatusSetting);
    console.log("PASS all four Personality toggles reach live settings/export and disable to the exact baseline without stale state colors");
    for (const mode of syntaxAutoModes) {
      const before = api.getState();
      await testing.setSyntaxAuto(mode, false);
      const manual = api.getState();
      assert.deepEqual(manual.syntax.palette, before.syntax.palette, `${mode} must hand off without a color jump.`);
      assert.deepEqual(manual.syntax.brackets, before.syntax.brackets);
      assert.equal(isSyntaxAutomatic(manual.syntax.parameters, mode), false);
      assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, manual.syntax.palette.tokenColors);
    }
    const frozen = api.getState().syntax;
    await testing.setParameters({ ...initial.parameters, foreground: "#aabbcc", accent: "#a04488", mutedContrast: 0.6 });
    assert.deepEqual(api.getState().syntax, frozen, "With all Auto modes off, changed UI anchors must not affect syntax.");
    for (const mode of syntaxAutoModes) {
      await testing.resetSyntaxGroup(mode);
      for (const other of syntaxAutoModes) assert.equal(isSyntaxAutomatic(api.getState().syntax.parameters, other), false);
    }
    assert.deepEqual(api.getState().syntax.parameters, manualDefaults);
    await testing.resetSyntax();
    for (const mode of syntaxAutoModes) assert.equal(isSyntaxAutomatic(api.getState().syntax.parameters, mode), true);
    const automatic = api.getState();
    assert.notDeepEqual(automatic.syntax.palette.tokenColors, initial.syntax.palette.tokenColors);
    assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, automatic.syntax.palette.tokenColors);
    assert.deepEqual(readSyntax("semanticTokenColorCustomizations").rules, automatic.syntax.palette.semanticTokenColors);
    await testing.setParameters(initial.parameters);
    assert.deepEqual(api.getState().syntax, initial.syntax);
    console.log("PASS automatic UI-linked syntax, exact mode handoffs, frozen manual state, per-group resets, and syntax reset in real workspace settings");
    const priorModeDrafts = new Map<ThemeMode, ThemeDraft>();
    const offModeDrafts = new Map<ThemeMode, SyntaxParameters>();
    for (const mode of themeModes) {
      await testing.setMode(mode);
      const before = api.getState();
      priorModeDrafts.set(mode, {
        parameters: before.parameters, syntaxParameters: before.syntax.parameters
      });
      const fitted = fitSyntaxModel(references[mode]);
      const anchors = getSyntaxAnchors(before.parameters, before.palette);
      let inputs = before.syntax.parameters;
      for (const key of syntaxAdjustmentParameters) {
        inputs = setSyntaxAdjustmentMode(fitted, inputs, anchors, key, "manual");
      }
      inputs = { ...inputs, chromaBoost: 0.6, lightnessShift: -0.2 };
      await testing.setSyntaxParameters(inputs);
      for (const key of syntaxAdjustmentParameters) {
        inputs = setSyntaxAdjustmentMode(fitted, inputs, anchors, key, "off");
        await testing.setSyntaxParameters(inputs);
        const current = api.getState();
        assert.deepEqual(current.syntax.parameters, inputs);
        const tokens = readSyntax("tokenColorCustomizations");
        const semantic = readSyntax("semanticTokenColorCustomizations");
        assert.deepEqual(tokens.textMateRules, current.syntax.palette.tokenColors);
        assert.deepEqual(semantic.rules, current.syntax.palette.semanticTokenColors);
        const document = createThemeDocument(references[mode], current.palette, "Off modes",
          current.syntax.palette, current.syntax.brackets);
        assert.deepEqual(document.tokenColors, current.syntax.palette.tokenColors);
        assert.deepEqual(document.semanticTokenColors, current.syntax.palette.semanticTokenColors);
        assert.equal(document.colors["editor.foreground"], current.syntax.palette.editorForeground);
      }
      offModeDrafts.set(mode, inputs);
    }
    for (const mode of themeModes) {
      await testing.setMode(mode);
      assert.deepEqual(api.getState().syntax.parameters, offModeDrafts.get(mode), "Off survives a mode-draft round trip.");
    }
    for (const [mode, draft] of priorModeDrafts) {
      await testing.setMode(mode);
      await testing.setParameters(draft.parameters);
      await testing.setSyntaxParameters(draft.syntaxParameters);
    }
    await testing.setMode(initial.parameters.mode);
    assert.deepEqual(api.getState().syntax, initial.syntax);
    console.log("PASS explicit Off modes reach Dark/Light live TextMate and semantic settings, export, and independent per-mode drafts");
    await testing.setSyntaxParameters({
      ...manualDefaults, red: "#00ff00", neutral: "#abcdef", comments: "#aa6677",
      chromaBoost: 0.25, lightnessShift: 0.5
    });
    const syntaxEdited = api.getState();
    assert.deepEqual(syntaxEdited.palette, initial.palette, "Syntax edits must not recolor the UI model.");
    assert.notDeepEqual(syntaxEdited.syntax.palette.tokenColors, initial.syntax.palette.tokenColors);
    assert.deepEqual(readSyntax("tokenColorCustomizations").textMateRules, syntaxEdited.syntax.palette.tokenColors);
    assert.deepEqual(readSyntax("semanticTokenColorCustomizations").rules, syntaxEdited.syntax.palette.semanticTokenColors);
    const codeColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Code text colors");
    assert.equal(requireRecord(codeColors[previewScope], "Code text scope")["editor.foreground"], syntaxEdited.syntax.palette.editorForeground);
    await testing.setParameters({ ...initial.parameters, foreground: "#8899aa", accent: "#27934d" });
    assert.deepEqual(api.getState().syntax, syntaxEdited.syntax, "UI edits must not recolor syntax.");
    await testing.resetSyntax();
    assert.deepEqual(api.getState().syntax.parameters, initial.syntax.parameters);
    assert.equal(api.getState().parameters.accent, "#27934d", "Reset syntax must preserve UI inputs.");
    await testing.setParameters(initial.parameters);
    console.log("PASS real theme-scoped syntax updates, independent code text, palette isolation, and syntax-only reset");
    await testing.setParameters({ ...initial.parameters, infoSource: "custom", info: "#8855ee", warning: "#00aeff", error: "#0000ff" });
    const severityState = api.getState();
    const severityColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Severity colors");
    const severityScope = requireRecord(severityColors[previewScope], "Severity scope");
    for (const [id, expected] of [
      ["editorInfo.foreground", "#8855ee"],
      ["notificationsInfoIcon.foreground", "#8855ee"],
      ["editorWarning.foreground", "#00aeff"],
      ["notificationsWarningIcon.foreground", "#00aeff"],
      ["activityWarningBadge.foreground", "#000000"],
      ["editorError.foreground", "#0000ff"],
      ["errorForeground", "#0000ff"],
      ["activityErrorBadge.foreground", "#ffffff"]
    ] as const) {
      assert.equal(severityScope[id], expected, id);
      assert.equal(severityState.palette.colors[id], expected, id);
    }
    assert.notEqual(severityScope["inputValidation.errorBackground"], initial.palette.colors["inputValidation.errorBackground"]);
    assert.equal(severityScope["button.background"], initial.palette.colors["button.background"]);
    assert.equal(severityScope["gitDecoration.addedResourceForeground"], initial.palette.colors["gitDecoration.addedResourceForeground"]);
    await testing.setParameters(initial.parameters);
    console.log("PASS Info/Warning/Error update real workspace severity colors, editor marks, and readable badges independently");
    await testing.setParameters({ ...initial.parameters, added: "#8855ee", deleted: "#00aeff", modified: "#ff9900" });
    const changeState = api.getState();
    const changeColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Change colors");
    const changeScope = requireRecord(changeColors[previewScope], "Change scope");
    for (const [id, expected] of [
      ["gitDecoration.addedResourceForeground", "#8855ee"],
      ["gitDecoration.untrackedResourceForeground", "#8855ee"],
      ["editorGutter.addedBackground", "#8855ee"],
      ["diffEditor.insertedLineBackground", "#8855ee26"],
      ["diffEditor.insertedTextBackground", "#8855ee4d"],
      ["gitDecoration.deletedResourceForeground", "#00aeff"],
      ["diffEditor.removedLineBackground", "#00aeff26"],
      ["diffEditor.removedTextBackground", "#00aeff4d"],
      ["gitDecoration.modifiedResourceForeground", "#ff9900"],
      ["gitDecoration.renamedResourceForeground", "#ff9900"],
      ["minimapGutter.modifiedBackground", "#ff9900"],
      ["mergeEditor.change.background", "#ff990026"]
    ] as const) {
      assert.equal(changeScope[id], expected, id);
      assert.equal(changeState.palette.colors[id], expected, id);
    }
    assert.equal(changeScope["button.background"], initial.palette.colors["button.background"]);
    assert.equal(changeScope.errorForeground, initial.palette.colors.errorForeground);
    assert.equal(changeScope["gitDecoration.conflictingResourceForeground"], initial.palette.colors["gitDecoration.conflictingResourceForeground"]);
    assert.deepEqual(changeState.syntax, initial.syntax);
    await testing.setParameters(initial.parameters);
    console.log("PASS independent Added/Deleted/Modified update real file decorations, transparent diff backgrounds, merge colors, and markers without changing syntax");
    for (const [accent, expected] of [["#00AEFF", "#000000"], ["#0000ff", "#ffffff"]] as const) {
      await testing.setParameters({ ...initial.parameters, accent });
      const accentState = api.getState();
      const written = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Automatic foreground colors");
      const accentScope = requireRecord(written[previewScope], "Automatic foreground scope");
      for (const id of ["button.foreground", "extensionButton.prominentForeground", "badge.foreground",
        "activityBarBadge.foreground", "quickInputList.focusForeground",
        "quickInputList.focusHighlightForeground", "quickInputList.focusIconForeground"]) {
        assert.equal(accentState.palette.colors[id], expected, id);
        assert.equal(accentScope[id], expected, id);
      }
      const background = accentScope["button.background"];
      assert.ok(typeof background === "string");
      assert.ok(contrastRatio(expected, background) >= 4.5);
      assert.equal(accentScope.foreground, initial.palette.colors.foreground);
      assert.equal(accentScope.errorForeground, initial.palette.colors.errorForeground);
    }
    console.log("PASS #00AEFF selects black accent text and a dark accent restores white in real workspace colors");
    await testing.setParameters({ ...initial.parameters, accent: "#27934d" });
    const updated = api.getState();
    assert.notEqual(updated.palette.colors["button.background"], initial.palette.colors["button.background"]);
    assert.equal(updated.palette.colors.errorForeground, initial.palette.colors.errorForeground);
    const updatedColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Updated colors");
    assert.equal(requireRecord(updatedColors[previewScope], "Updated scope")["button.background"], updated.palette.colors["button.background"]);
    console.log("PASS real workspace live-preview start, accent update, and status preservation");

    await testing.setParameters({ ...updated.parameters, surfaceSpread: 3, borderStrength: -1 });
    const shaped = api.getState();
    assert.equal(shaped.model.controlCount, 19);
    const shapedColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Shaped colors");
    const shapedScope = requireRecord(shapedColors[previewScope], "Shaped scope");
    const border = shapedScope["panel.border"];
    const canvas = shapedScope["editor.background"];
    const surface = shapedScope["sideBar.background"];
    assert.ok(typeof border === "string" && typeof canvas === "string" && typeof surface === "string");
    assert.equal(border, shaped.palette.colors["panel.border"]);
    assert.ok(toOklab(border).l < toOklab(canvas).l);
    assert.ok(Math.abs(toOklab(surface).l - toOklab(canvas).l - 0.09) < 0.005);
    assert.equal(shapedScope["button.background"], updated.palette.colors["button.background"]);
    await testing.setParameters({ ...updated.parameters, borderStrength: 0 });
    const zeroColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Zero-border colors");
    const zeroScope = requireRecord(zeroColors[previewScope], "Zero-border scope");
    assert.equal(zeroScope["panel.border"], zeroScope["editor.background"]);
    for (const surfaceSpread of [-1, 0]) {
      await testing.setParameters({ ...updated.parameters, surfaceSpread });
      const current = api.getState();
      const written = requireRecord(requireRecord(
        configuration.inspect("colorCustomizations")?.workspaceValue, "Signed surface colors"
      )[previewScope], "Signed surface scope");
      const surface = written["sideBar.background"];
      const canvas = written["editor.background"];
      assert.ok(typeof surface === "string" && typeof canvas === "string");
      assert.equal(surface, current.palette.colors["sideBar.background"]);
      if (surfaceSpread === 0) assert.equal(surface, canvas);
      else assert.ok(toOklab(surface).l < toOklab(canvas).l);
      assert.equal(written["panel.border"], updated.palette.colors["panel.border"]);
      assert.equal(written["button.background"], updated.palette.colors["button.background"]);
      assert.equal(written["editorInfo.foreground"], updated.palette.colors["editorInfo.foreground"]);
    }
    await testing.setParameters(updated.parameters);
    console.log("PASS real workspace inverted/flat/3x surfaces and independent negative/zero borders");

    await vscode.workspace.getConfiguration("workbench").update(
      "colorCustomizations",
      { ...updatedColors, foreground: "#a0a0a0" },
      vscode.ConfigurationTarget.Workspace
    );
    await testing.restorePreview();
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.workspaceValue, undefined);
    assert.deepEqual(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, { foreground: "#a0a0a0" });
    assert.equal(api.getState().livePreview, false);
    assert.deepEqual(editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue, previousBracketColorization);
    assert.deepEqual(editorConfiguration.inspect("tokenColorCustomizations")?.workspaceValue, previousTokens);
    assert.deepEqual(editorConfiguration.inspect("semanticTokenColorCustomizations")?.workspaceValue, previousSemantic);
    console.log("PASS cancel restores owned settings and preserves unrelated workspace edits");

    await testing.startPreview();
    const conflictColors = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Conflict test colors");
    await vscode.workspace.getConfiguration("workbench").update(
      "colorCustomizations",
      {
        ...conflictColors,
        [previewScope]: { ...requireRecord(conflictColors[previewScope], "Conflict test scope"), "button.background": "#ff0000" }
      },
      vscode.ConfigurationTarget.Workspace
    );
    await assert.rejects(testing.setParameters({ ...updated.parameters, accent: "#8060b0" }), /outside Themer/);
    await testing.restorePreview();
    const afterConflict = requireRecord(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, "Restored conflict colors");
    assert.deepEqual(afterConflict[previewScope], { "button.background": "#ff0000" });
    console.log("PASS real external-edit conflict stops writes and is preserved on cancel");

    for (const key of ["tokenColorCustomizations", "semanticTokenColorCustomizations"]) {
      await testing.startPreview();
      const current = requireRecord(editorConfiguration.inspect(key)?.workspaceValue, key);
      const entry = requireRecord(current[previewScope], `${key} preview scope`);
      const external = key === "tokenColorCustomizations" ? { textMateRules: [] } : { rules: { variable: "#112233" } };
      await editorConfiguration.update(key, {
        ...current, [previewScope]: { ...entry, ...external }
      }, vscode.ConfigurationTarget.Workspace);
      await assert.rejects(testing.setSyntaxParameters({ ...initial.syntax.parameters, blue: "#00ff00" }), /outside Themer/);
      await testing.restorePreview();
      assert.deepEqual(requireRecord(editorConfiguration.inspect(key)?.workspaceValue, key)[previewScope], external);
      await editorConfiguration.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    console.log("PASS external TextMate and semantic edits stop preview writes and survive cancellation");

    await testing.startPreview();
    await editorConfiguration.update("bracketPairColorization.enabled", false, vscode.ConfigurationTarget.Workspace);
    await assert.rejects(testing.setSyntaxParameters({ ...initial.syntax.parameters, blue: "#00ff00" }), /Bracket colorization changed outside/);
    await testing.restorePreview();
    assert.equal(editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue, false);
    await editorConfiguration.update("bracketPairColorization.enabled", previousBracketColorization, vscode.ConfigurationTarget.Workspace);
    console.log("PASS bracket colorization is enabled only in live preview and external edits are preserved on Cancel");

    await testing.startPreview();
    await testing.applyTheme("workspace");
    assert.equal(api.getState().livePreview, false);
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.workspaceValue, previewThemeName);
    assert.equal(editorConfiguration.inspect("bracketPairColorization.enabled")?.workspaceValue, true);
    console.log("PASS explicit keep persists workspace theme and clears the session");

    const beforeClose = vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue;
    const tokensBeforeClose = editorConfiguration.inspect("tokenColorCustomizations")?.workspaceValue;
    const semanticBeforeClose = editorConfiguration.inspect("semanticTokenColorCustomizations")?.workspaceValue;
    await testing.startPreview();
    await testing.setParameters({ ...api.getState().parameters, background: "#20212a" });
    await testing.setSyntaxParameters({ ...api.getState().syntax.parameters, neutral: "#00ff00" });
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await waitFor(() => !api.getState().livePreview, "automatic restoration after closing the panel");
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.workspaceValue, previewThemeName);
    assert.deepEqual(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.workspaceValue, beforeClose);
    assert.deepEqual(editorConfiguration.inspect("tokenColorCustomizations")?.workspaceValue, tokensBeforeClose);
    assert.deepEqual(editorConfiguration.inspect("semanticTokenColorCustomizations")?.workspaceValue, semanticBeforeClose);
    assert.equal(vscode.workspace.getConfiguration("workbench").inspect("colorTheme")?.globalValue, globalTheme);
    assert.deepEqual(vscode.workspace.getConfiguration("workbench").inspect("colorCustomizations")?.globalValue, globalColors);
    assert.deepEqual(editorConfiguration.inspect("tokenColorCustomizations")?.globalValue, globalTokens);
    assert.deepEqual(editorConfiguration.inspect("semanticTokenColorCustomizations")?.globalValue, globalSemantic);
    assert.deepEqual(editorConfiguration.inspect("bracketPairColorization.enabled")?.globalValue, globalBracketColorization);
    assert.equal(editorConfiguration.inspect("guides.bracketPairs")?.workspaceValue, previousGuides);
    console.log("PASS closing the actual panel restores the session; global settings remain untouched");

    const emptyWorkspace = { theme: undefined, colors: undefined, tokens: undefined, semanticTokens: undefined, brackets: undefined };
    await writeSettings(emptyWorkspace, vscode.ConfigurationTarget.Workspace);
    await configuration.update("colorCustomizations", {
      foreground: "#abcdef", "[Other]": { foreground: "#123456" }, [previewScope]: { "unowned.color": "#445566" }
    }, vscode.ConfigurationTarget.Global);
    await editorConfiguration.update("tokenColorCustomizations", { comments: "#778899" }, vscode.ConfigurationTarget.Global);
    await editorConfiguration.update("semanticTokenColorCustomizations", { enabled: false }, vscode.ConfigurationTarget.Global);
    for (const mode of themeModes) {
      await testing.setMode(mode);
      await testing.setParameters({ ...api.getState().parameters, accent: mode === "dark" ? "#27934d" : "#8044aa" });
      const draft = api.getState();
      await testing.applyTheme();
      assertSaved("globalValue", draft);
      assert.deepEqual(readSettings("workspaceValue"), emptyWorkspace);
      await waitFor(() => vscode.workspace.getConfiguration("workbench").get("colorTheme") === previewThemeNames[mode],
        `${mode} effective User theme`);
      const root = requireRecord(readSettings("globalValue").colors, "User colors after Apply");
      assert.equal(root.foreground, "#abcdef");
      assert.deepEqual(root["[Other]"], { foreground: "#123456" });
      assert.equal(requireRecord(root[previewScope], "User Themer scope")["unowned.color"], "#445566");
      await testing.restorePreview();
      assertSaved("globalValue", draft);
    }
    console.log("PASS default Apply directly saves Dark/Light User UI, syntax and brackets, preserves unrelated keys and leaves the workspace untouched");

    const workspaceOverrides = {
      theme: "Dark 2026",
      colors: { foreground: "#a0a0a0", [previewScope]: { "button.background": "#778899" } },
      tokens: { comments: "#aabbcc" },
      semanticTokens: { enabled: false },
      brackets: false
    };
    await writeSettings(workspaceOverrides, vscode.ConfigurationTarget.Workspace);
    await testing.startPreview();
    await testing.setParameters({ ...api.getState().parameters, accent: "#c08030" });
    const promoted = api.getState();
    await testing.applyTheme();
    assertSaved("globalValue", promoted);
    assert.deepEqual(readSettings("workspaceValue"), workspaceOverrides);
    assert.equal(vscode.workspace.getConfiguration("workbench").get("colorTheme"), "Dark 2026");
    assert.match(api.getState().status, /workspace overrides.*precedence/);
    console.log("PASS applying a live preview to User restores all original workspace settings and preserves their precedence");

    const userBeforeWorkspaceSave = readSettings("globalValue");
    await testing.setParameters({ ...api.getState().parameters, accent: "#5577cc" });
    const workspaceDraft = api.getState();
    await testing.applyTheme("workspace");
    assertSaved("workspaceValue", workspaceDraft);
    assert.deepEqual(readSettings("globalValue"), userBeforeWorkspaceSave);
    console.log("PASS explicit Workspace Apply works without preview and leaves every User setting unchanged");

    await testing.startPreview();
    const owned = requireRecord(configuration.inspect("colorCustomizations")?.workspaceValue, "Owned workspace colors");
    await configuration.update("colorCustomizations", {
      ...owned, [previewScope]: { ...requireRecord(owned[previewScope], "Owned scope"), "button.background": "#ff0000" }
    }, vscode.ConfigurationTarget.Workspace);
    await assert.rejects(testing.applyTheme(), /User settings were not saved.*changed externally/);
    assert.deepEqual(readSettings("globalValue"), userBeforeWorkspaceSave);
    assert.equal(api.getState().recoveryPending, false);
    assert.equal(api.getState().livePreview, false);
    await testing.restorePreview();
    assert.equal(requireRecord(requireRecord(configuration.inspect("colorCustomizations")?.workspaceValue,
      "Preserved conflict colors")[previewScope], "Preserved conflict scope")["button.background"], "#ff0000");
    console.log("PASS User Apply restores non-conflicting preview settings, preserves external edits and refuses User writes on conflict");

    const legacy = (mode: ThemeMode): ReturnType<typeof readSettings> => ({
      theme: legacyPreviewThemeNames[mode],
      colors: { foreground: "#aabbcc", "[Other]": { foreground: "#112233" },
        [legacyPairedPreviewScope]: { "editor.background": "#223344", "unowned.color": "#445566" } },
      tokens: { comments: "#778899", [legacyPairedPreviewScope]: { textMateRules: [] } },
      semanticTokens: { enabled: false, [legacyPairedPreviewScope]: { enabled: true, rules: { variable: "#778899" } } },
      brackets: false
    });
    const legacyUser = legacy("dark");
    const legacyWorkspace = legacy("light");
    await writeSettings(legacyUser, vscode.ConfigurationTarget.Global);
    await writeSettings(legacyWorkspace, vscode.ConfigurationTarget.Workspace);
    await testing.setMode("dark");
    await testing.startPreview();
    assert.equal(api.getState().livePreview, true);
    assert.equal(configuration.inspect("colorTheme")?.workspaceValue, previewThemeNames.dark);
    await testing.restorePreview();
    for (const [scope, mode, previous] of [
      ["globalValue", "dark", legacyUser], ["workspaceValue", "light", legacyWorkspace]
    ] as const) {
      const copied = (root: unknown) => ({
        ...requireRecord(root, "Legacy settings"), [previewScope]: requireRecord(root, "Legacy settings")[legacyPairedPreviewScope]
      });
      assert.deepEqual(readSettings(scope), {
        ...previous, theme: previewThemeNames[mode],
        colors: copied(previous.colors), tokens: copied(previous.tokens), semanticTokens: copied(previous.semanticTokens)
      });
      console.log(`PASS ${mode}: legacy ${scope} theme names and all three scopes migrate without changing colors, brackets or original backups`);
    }
    await waitFor(() => vscode.workspace.getConfiguration("workbench").get("colorTheme") === previewThemeNames.light &&
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light, "renamed saved Light theme after preview Cancel");
    assert.equal(api.getState().livePreview, false);
  } finally {
    if (api.getState().livePreview) {
      await testing.restorePreview();
    }
    await writeSettings(originalUser, vscode.ConfigurationTarget.Global);
    if (api.getState().workspaceAvailable) {
      await vscode.workspace.getConfiguration("workbench").update("colorCustomizations", previousColors, vscode.ConfigurationTarget.Workspace);
      await vscode.workspace.getConfiguration("workbench").update("colorTheme", previousTheme, vscode.ConfigurationTarget.Workspace);
      await editorConfiguration.update("tokenColorCustomizations", previousTokens, vscode.ConfigurationTarget.Workspace);
      await editorConfiguration.update("semanticTokenColorCustomizations", previousSemantic, vscode.ConfigurationTarget.Workspace);
      await editorConfiguration.update("bracketPairColorization.enabled", previousBracketColorization, vscode.ConfigurationTarget.Workspace);
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
  console.log("Themer extension-host smoke tests passed.");
}
