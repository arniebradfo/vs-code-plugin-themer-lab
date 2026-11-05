import assert from "node:assert/strict";
import * as vscode from "vscode";
import { compositeColors, contrastRatio, deltaE, nativeCssAlpha, parseColor, toOklch } from "../src/color";
import { ThemerApi } from "../src/extension/api";
import { createThemeDocument } from "../src/extension/export";
import { getDefaultParameters } from "../src/model";
import { inactiveSelectionId } from "../src/model/selection";
import { activeItemTargets, statefulStatusColors, tintOverlay } from "../src/model/personality";
import { opacityFor, supplementalModernColors } from "../src/model/rules";
import { references } from "../src/shared/reference";
import { editorSamples } from "../src/shared/samples";
import { requireRecord } from "../src/shared/validation";
import { infoSources, previewThemeNames, syntaxAdjustmentModes, syntaxFamilies, syntaxPaletteModes, themeModes } from "../src/shared/types";
import { previewScope } from "../src/extension/preview";
import { fitSyntaxModel, renderResolvedSyntaxColor } from "../src/syntax";
import { managedThemeColorIds, themeColors } from "../src/theme";
import { NativeRenderer } from "./support/native-renderer";

function hex(value: string): string {
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) {
    return value.length === 9 && value.slice(-2).toLowerCase() === "ff"
      ? value.slice(0, 7).toLowerCase() : value.toLowerCase();
  }
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
  assert.ok(match, `Expected a native RGB color, received ${value}.`);
  const rgb = match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
  const alpha = Math.round(Number(match[4] ?? 1) * 255);
  return `#${rgb}${alpha === 255 ? "" : alpha.toString(16).padStart(2, "0")}`;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function run(): Promise<void> {
  assert.equal(process.env.THEMER_SYNTAX_ISOLATED, "1");
  const extension = vscode.extensions.getExtension<ThemerApi>("themer-local.themer-lab");
  assert.ok(extension);
  const api = await extension.activate();
  const testing = api.testing;
  assert.ok(testing);
  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspace);
  const uri = vscode.Uri.joinPath(workspace.uri, "selection-preview.txt");
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(
    "Inactive selection should retain readable text.\n" +
    Array.from({ length: 120 }, (_, index) => `Native scrollbar paint sample line ${index + 1}.\n`).join("")
  ));
  const document = await vscode.workspace.openTextDocument(uri);
  const bracketUri = vscode.Uri.joinPath(workspace.uri, "personality-preview.ts");
  const bracketSource = "const nested = ((((((true))))));";
  await vscode.workspace.fs.writeFile(bracketUri, new TextEncoder().encode(`${bracketSource}\n`));
  const bracketDocument = await vscode.workspace.openTextDocument(bracketUri);
  const stickyUri = vscode.Uri.joinPath(workspace.uri, "sticky-preview.ts");
  await vscode.workspace.fs.writeFile(stickyUri, new TextEncoder().encode([
    "export function stickyPreview(accent: string): string {",
    ...Array.from({ length: 80 }, (_, index) => `  const shade${index} = accent;`),
    "  return accent;",
    "}",
    ""
  ].join("\n")));
  const stickyDocument = await vscode.workspace.openTextDocument(stickyUri);
  const suggestionUri = vscode.Uri.joinPath(workspace.uri, "inline-suggestion-preview.txt");
  await vscode.workspace.fs.writeFile(suggestionUri, new TextEncoder().encode("/skill\n"));
  const suggestionDocument = await vscode.workspace.openTextDocument(suggestionUri);
  const markdownUri = vscode.Uri.joinPath(workspace.uri, "inline-code-preview.md");
  await vscode.workspace.fs.writeFile(markdownUri, new TextEncoder().encode("Inline `accentInlineCode` preview.\n"));
  const textSelector: vscode.DocumentSelector = {
    language: "plaintext", scheme: "file", pattern: new vscode.RelativePattern(workspace, "inline-suggestion-preview.txt")
  };
  const completions = vscode.languages.registerCompletionItemProvider(textSelector, {
    provideCompletionItems: () => {
      const item = new vscode.CompletionItem("/skill-theme", vscode.CompletionItemKind.Text);
      item.range = new vscode.Range(0, 0, 0, 6);
      return [item];
    }
  });
  const debugUri = vscode.Uri.joinPath(workspace.uri, "personality-debug.js");
  await vscode.workspace.fs.writeFile(debugUri, new TextEncoder().encode("setTimeout(() => {}, 30000);\n"));
  const workbench = vscode.workspace.getConfiguration("workbench");
  const previousModern = workbench.inspect("experimental.modernUI")?.globalValue;
  const previousDecorationColors = workbench.inspect("editor.decorations.colors")?.workspaceValue;
  const previousDecorationBadges = workbench.inspect("editor.decorations.badges")?.workspaceValue;
  const editorConfiguration = vscode.workspace.getConfiguration("editor");
  const previousScrollbar = editorConfiguration.inspect("scrollbar.vertical")?.workspaceValue;
  const previousSticky = editorConfiguration.inspect("stickyScroll.enabled")?.workspaceValue;
  const previousStickyModel = editorConfiguration.inspect("stickyScroll.defaultModel")?.workspaceValue;
  const problems = vscode.workspace.getConfiguration("problems");
  const previousProblemDecorations = problems.inspect("decorations.enabled")?.workspaceValue;
  const debug = vscode.workspace.getConfiguration("debug");
  const previousDebugColor = debug.inspect("enableStatusBarColor")?.workspaceValue;
  const readThemeSettings = (scope: "globalValue" | "workspaceValue") => ({
    theme: workbench.inspect("colorTheme")?.[scope],
    colors: workbench.inspect("colorCustomizations")?.[scope],
    tokens: editorConfiguration.inspect("tokenColorCustomizations")?.[scope],
    semanticTokens: editorConfiguration.inspect("semanticTokenColorCustomizations")?.[scope],
    brackets: editorConfiguration.inspect("bracketPairColorization.enabled")?.[scope]
  });
  const originalUserTheme = readThemeSettings("globalValue");
  const originalWorkspaceTheme = readThemeSettings("workspaceValue");
  const restoreThemeSettings = async (value: ReturnType<typeof readThemeSettings>, target: vscode.ConfigurationTarget) => {
    await workbench.update("colorTheme", value.theme, target);
    await workbench.update("colorCustomizations", value.colors, target);
    await editorConfiguration.update("tokenColorCustomizations", value.tokens, target);
    await editorConfiguration.update("semanticTokenColorCustomizations", value.semanticTokens, target);
    await editorConfiguration.update("bracketPairColorization.enabled", value.brackets, target);
  };
  let debugSession: vscode.DebugSession | undefined;
  const renderer = await NativeRenderer.connect(Number(process.env.THEMER_SYNTAX_DEBUG_PORT));
  const focusInput = vscode.window.createInputBox();
  const decorationEvents = new vscode.EventEmitter<vscode.Uri>();
  let resourceDecoration: vscode.FileDecoration | undefined;
  const resourceDecorations = vscode.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: decorationEvents.event,
    provideFileDecoration: (resource) => resource.toString() === uri.toString() ? resourceDecoration : undefined
  });
  const diagnostics = vscode.languages.createDiagnosticCollection("themer-personality-native");
  focusInput.title = "Themer isolated inactive-selection test";
  focusInput.ignoreFocusOut = true;
  const selectAndBlur = async () => {
    await renderer.focusWindow();
    const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    editor.selection = new vscode.Selection(0, 0, 0, 18);
    focusInput.show();
    try {
      const result = await renderer.uiColors([], false);
      assert.equal(result.editorFocused, false, "The native Quick Input must take focus away from the selected editor.");
      return result;
    } finally {
      focusInput.hide();
    }
  };
  try {
    await workbench.update("editor.decorations.colors", true, vscode.ConfigurationTarget.Workspace);
    await workbench.update("editor.decorations.badges", true, vscode.ConfigurationTarget.Workspace);
    await problems.update("decorations.enabled", true, vscode.ConfigurationTarget.Workspace);
    await editorConfiguration.update("scrollbar.vertical", "visible", vscode.ConfigurationTarget.Workspace);
    const original = await selectAndBlur();
    for (const mode of themeModes) {
      const reference = references[mode];
      await testing.setMode(mode);
      await testing.setParameters(getDefaultParameters(reference));
      await testing.resetSyntax();
      await testing.startPreview();
      const check = async (label: string) => {
        const frame = await selectAndBlur();
        const state = api.getState();
        assert.equal(vscode.window.activeColorTheme.kind,
          mode === "dark" ? vscode.ColorThemeKind.Dark : vscode.ColorThemeKind.Light);
        for (const [status, button] of [
          ["statusBarItem.prominentBackground", "button.background"],
          ["statusBarItem.prominentForeground", "button.foreground"],
          ["statusBarItem.prominentHoverBackground", "button.hoverBackground"],
          ["statusBarItem.prominentHoverForeground", "button.foreground"]
        ] as const) {
          assert.equal(hex(frame.colors[status] ?? ""), state.palette.colors[button], `${mode}/${status}`);
        }
        assert.equal(hex(frame.colors["chat.linesAddedForeground"] ?? ""), state.parameters.added.toLowerCase());
        assert.equal(hex(frame.colors["chat.linesRemovedForeground"] ?? ""), state.parameters.deleted.toLowerCase());
        const overlay = state.palette.colors[inactiveSelectionId];
        assert.ok(overlay);
        const nativeAlpha = Number((Math.round((parseColor(overlay).alpha ?? 1) * 1000) / 1000).toFixed(2));
        const nativeOverlay = `${overlay.slice(0, 7)}${nativeAlpha === 1 ? "" : Math.round(nativeAlpha * 255).toString(16).padStart(2, "0")}`;
        const canvas = hex(frame.colors["editor.background"] ?? "");
        assert.equal(hex(frame.colors[inactiveSelectionId] ?? ""), nativeOverlay);
        assert.ok(frame.selectionPaint.map(hex).includes(nativeOverlay),
          `Native inactive selection paint must use ${nativeOverlay}; saw ${frame.selectionPaint.join(", ")}.`);
        const background = compositeColors(overlay, canvas, nativeAlpha);
        const foreground = hex(frame.colors["editor.foreground"] ?? "");
        assert.equal(foreground, state.syntax.palette.editorForeground);
        for (const text of [state.parameters.foreground, foreground]) {
          assert.ok(contrastRatio(text, background) >= Math.min(4.5, contrastRatio(text, canvas)));
        }
        const exported = createThemeDocument(reference, state.palette, "Native UI", state.syntax.palette, state.syntax.brackets);
        assert.equal(exported.colors[inactiveSelectionId], overlay);
        assert.equal(hex(frame.colors["editor.selectionHighlightBackground"] ?? ""),
          state.palette.colors["editor.selectionHighlightBackground"], "The separate occurrence highlight is unchanged.");
        console.log(`PASS ${mode}/${label}: native status/chat colors and inactive paint ${overlay}; code contrast ${contrastRatio(foreground, background).toFixed(3)}.`);
      };
      await check("defaults");
      await testing.setParameters({
        ...getDefaultParameters(reference), foreground: mode === "dark" ? "#999999" : "#666666",
        accent: mode === "dark" ? "#ffffff" : "#000000", overlayOpacity: 2,
        added: "#8855ee", deleted: "#00aeff"
      });
      await check("extreme accent");
      await testing.setParameters({
        ...api.getState().parameters, foreground: mode === "dark" ? "#ffffff" : "#000000"
      });
      await testing.setSyntaxParameters({
        ...fitSyntaxModel(reference).parameters, neutral: mode === "dark" ? "#999999" : "#666666"
      });
      await check("independent manual code foreground");
      await testing.resetSyntax();
      await editorConfiguration.update("stickyScroll.enabled", true, vscode.ConfigurationTarget.Workspace);
      await editorConfiguration.update("stickyScroll.defaultModel", "indentationModel", vscode.ConfigurationTarget.Workspace);
      for (const surfaceSpread of [-3, 0, 3]) {
        const background = mode === "dark" ? "#26374a" : "#d5dde8";
        await testing.setParameters({ ...getDefaultParameters(reference), background, surfaceSpread });
        const stickyEditor = await vscode.window.showTextDocument(stickyDocument, { viewColumn: vscode.ViewColumn.One, preview: false });
        stickyEditor.revealRange(new vscode.Range(35, 0, 35, 0), vscode.TextEditorRevealType.AtTop);
        const sticky = await renderer.stickyScrollPaint();
        assert.equal(hex(sticky.background), background, `${mode}/${surfaceSpread}: actual sticky content must follow the canvas.`);
        assert.equal(hex(sticky.gutterBackground), background, `${mode}/${surfaceSpread}: actual sticky gutter must follow the canvas.`);
      }
      await editorConfiguration.update("stickyScroll.enabled", previousSticky, vscode.ConfigurationTarget.Workspace);
      await editorConfiguration.update("stickyScroll.defaultModel", previousStickyModel, vscode.ConfigurationTarget.Workspace);
      console.log(`PASS ${mode}: actual sticky-scroll content and gutter follow a nonblack custom canvas at negative, zero and positive surface separation.`);
      await testing.setParameters({
        ...getDefaultParameters(reference), accent: mode === "dark" ? "#00aeff" : "#0069cc",
        accentActiveItems: true, tintNeutralOverlays: true, monochromeBrackets: true, statefulStatusBar: true
      });
      const ids = [...new Set([
        ...Object.keys(supplementalModernColors), ...Object.keys(activeItemTargets), ...Object.keys(statefulStatusColors),
        "list.hoverBackground", "list.activeSelectionBackground", "menu.selectionBackground", "sideBar.background",
        "list.inactiveSelectionBackground", "terminal.inactiveSelectionBackground", "activityBar.activeBackground",
        "activityBar.background",
        "scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground",
        "minimapSlider.background", "minimapSlider.hoverBackground", "minimapSlider.activeBackground",
        "editorWhitespace.foreground", ...Object.keys(api.getState().syntax.brackets.colors)
      ])];
      for (const modern of [false, true]) {
        await workbench.update("experimental.modernUI", modern, vscode.ConfigurationTarget.Global);
        assert.equal(vscode.workspace.getConfiguration("workbench").get("experimental.modernUI"), modern,
          "The isolated profile must use the requested native layout.");
        await vscode.commands.executeCommand("workbench.view.explorer");
        await vscode.commands.executeCommand("revealInExplorer", uri);
        const native = await selectAndBlur();
        assert.equal(native.editorFocused, false);
        const frame = await renderer.uiColors(ids);
        const state = api.getState();
        for (const id of ids) {
          const generated = state.palette.colors[id] ?? state.syntax.brackets.colors[id];
          assert.ok(generated, id);
          const alpha = Number((Math.round((parseColor(generated).alpha ?? 1) * 1000) / 1000).toFixed(2));
          const encoded = `${generated.slice(0, 7)}${alpha === 1 ? "" : Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
          assert.equal(hex(frame.colors[id] ?? ""), encoded, `${mode}/${modern ? "modern" : "classic"}/${id}`);
        }
        const paint = await renderer.personalityPaint();
        assert.equal(paint.workbenchClasses.split(" ").includes("modern-ui"), modern,
          `The native workbench must actually enable/disable Modern UI; saw ${paint.workbenchClasses}.`);
        const tabIds = modern ? ["modernEditorTab.activeForeground", "modernTab.activeForeground"]
          : ["tab.activeForeground", "tab.unfocusedActiveForeground"];
        assert.ok(tabIds.some((id) => state.palette.colors[id] === hex(paint.tabForeground)),
          `Native active tab must use its ${modern ? "Modern" : "classic"} accent foreground; saw ${paint.tabForeground}.`);
        assert.equal(hex(paint.statusBackground), state.palette.colors["statusBar.background"]);
        assert.equal(hex(paint.statusForeground), state.palette.colors["statusBar.foreground"]);
        assert.ok(Math.abs(toOklch(hex(paint.tabForeground)).l - toOklch(state.parameters.foreground).l) < 0.003,
          "Actual active text should retain Primary foreground lightness, not button-accent lightness.");
        console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: native personality variables, active-tab accent and normal status-bar paint.`);
        if (mode === "light") {
          const interactionIds = [
            "menubar.selectionBackground", "menu.selectionBackground", "list.inactiveSelectionBackground",
            "toolbar.activeBackground", "modernActivityBarItem.activeBackground"
          ];
          for (const surfaceSpread of [-3, 0, 3]) {
            await testing.setParameters({ ...state.parameters, surfaceSpread, tintNeutralOverlays: false });
            await selectAndBlur();
            const actual = await renderer.uiColors(interactionIds);
            const selected = await renderer.interactionPaint();
            for (const id of interactionIds) {
              const generated = api.getState().palette.colors[id];
              assert.ok(generated, id);
              const native = compositeColors(generated, "#ffffff", nativeCssAlpha(parseColor(generated).alpha ?? 1));
              const painted = compositeColors(hex(actual.colors[id] ?? ""), "#ffffff");
              assert.ok(deltaE(native, painted) < 0.05, `${modern}/${surfaceSpread}/${id}`);
            }
            assert.equal(hex(selected.inactiveListBackground), hex(actual.colors["list.inactiveSelectionBackground"] ?? ""));
          }
          await testing.setParameters(state.parameters);
          console.log(`PASS light/${modern ? "modern" : "classic"}: actual selection/active fills retain normal strength at surface separation -3, 0 and 3.`);
        }
        const normalTabForeground = hex(paint.tabForeground);
        await testing.setParameters({ ...state.parameters, tintNeutralOverlays: false });
        const untinted = await renderer.uiColors(ids);
        await testing.setParameters(state.parameters);
        const tinted = await renderer.uiColors(ids);
        for (const id of ["list.hoverBackground", "list.activeSelectionBackground", "menu.selectionBackground", "editorWhitespace.foreground"]) {
          assert.notEqual(hex(tinted.colors[id] ?? ""), hex(untinted.colors[id] ?? ""),
            `Tint must visibly reach actual native ${id}, not only neutral surface backgrounds.`);
        }
        const canvas = hex(tinted.colors["sideBar.background"] ?? "");
        const before = hex(untinted.colors["list.hoverBackground"] ?? "");
        const after = hex(tinted.colors["list.hoverBackground"] ?? "");
        const paintedDifference = deltaE(compositeColors(before, canvas), compositeColors(after, canvas));
        assert.ok(paintedDifference >= 1, "Require a measurable native-composited hover tint in both themes.");
        console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: native hover tint painted deltaE ${paintedDifference.toFixed(3)}; selections and faint text share the opacity pipeline.`);
        const inactivePaint = await renderer.interactionPaint();
        assert.equal(inactivePaint.listFocused, false, "The Explorer list must really be unfocused.");
        assert.equal(hex(inactivePaint.inactiveListBackground), hex(tinted.colors["list.inactiveSelectionBackground"] ?? ""));
        assert.notEqual(hex(tinted.colors["list.inactiveSelectionBackground"] ?? ""),
          hex(untinted.colors["list.inactiveSelectionBackground"] ?? ""));
        const activeFill = hex(tinted.colors["list.activeSelectionBackground"] ?? "");
        const activeChroma = toOklch(compositeColors(activeFill, canvas)).c;
        const inactiveChroma = toOklch(compositeColors(hex(inactivePaint.inactiveListBackground), canvas)).c;
        assert.ok(inactiveChroma <= activeChroma * 1.25 + 0.001,
          `Actual inactive-selection chroma ${inactiveChroma} must stay close to active-selection chroma ${activeChroma}.`);
        assert.ok(inactiveChroma >= activeChroma * 0.5,
          "The inactive selection must retain its accent tint, not be replaced with gray.");
        // The pinned native theme rule can outrank Modern CSS and keep the classic fill.
        const activityIds = modern ? ["modernActivityBarItem.activeBackground", "activityBar.activeBackground"]
          : ["activityBar.activeBackground"];
        const activityId = activityIds.find((id) =>
          inactivePaint.activityBackgrounds.map(hex).includes(hex(tinted.colors[id] ?? "")));
        assert.ok(activityId,
          `Actual ${modern ? "Modern activity pill" : "classic active-item-indicator"} must use a generated tinted fill; saw ${inactivePaint.activityBackgrounds.join(", ")}.`);
        assert.notEqual(hex(tinted.colors[activityId] ?? ""), hex(untinted.colors[activityId] ?? ""),
          "Whichever native rule wins, the actual indicator fill must change when tint is enabled.");
        const activityBackdrop = hex(tinted.colors[activityId.startsWith("modern")
          ? "modernActivityBar.background" : "activityBar.background"] ?? "");
        const activityChroma = toOklch(compositeColors(hex(tinted.colors[activityId] ?? ""), activityBackdrop)).c;
        const referenceChroma = toOklch(compositeColors(activeFill, activityBackdrop)).c;
        assert.ok(activityChroma <= referenceChroma * 1.25 + 0.001,
          "The actual opaque activity fill must not be much more saturated than the shared active-selection tint.");
        const thumb = hex(inactivePaint.scrollbarBackground);
        assert.ok(["scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground"]
          .some((id) => hex(tinted.colors[id] ?? "") === thumb), "The actual scrollbar thumb must use its quiet tint.");
        const strongThumb = tintOverlay(hex(untinted.colors["scrollbarSlider.background"] ?? ""), state.parameters.accent);
        assert.ok(toOklch(thumb).c <= toOklch(strongThumb).c * 0.5 + 0.002,
          "Actual quiet scrollbar chroma must be at most half the previous strong tint.");
        console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: native active/inactive chroma ${activeChroma.toFixed(4)}/${inactiveChroma.toFixed(4)}; activity indicator (${activityId}) has a matching tint; scrollbar stays quiet.`);
        for (const overlayOpacity of [0.5, 2]) {
          await testing.setParameters({ ...state.parameters, overlayOpacity });
          await selectAndBlur();
          const varied = await renderer.uiColors(ids);
          const variedPaint = await renderer.interactionPaint();
          for (const id of [
            "scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground",
            "minimapSlider.background", "minimapSlider.hoverBackground", "minimapSlider.activeBackground"
          ]) assert.equal(hex(varied.colors[id] ?? ""), hex(tinted.colors[id] ?? ""),
            `${mode}/${overlayOpacity}/${id}: Overlay opacity must not obscure native content beneath thumbs.`);
          assert.equal(hex(variedPaint.scrollbarBackground), thumb,
            "Actual scrollbar paint, not just its registered theme variables, must keep its opacity.");
          const variedActive = hex(varied.colors["list.activeSelectionBackground"] ?? "");
          const expectedAlpha = Math.round(nativeCssAlpha(
            Math.round(opacityFor(mode, "hover") * overlayOpacity * 255) / 255
          ) * 255);
          assert.equal(Math.round((parseColor(variedActive).alpha ?? 1) * 255), expectedAlpha,
            "The reference must track the user's overlay setting rather than suppressing active selection strength.");
          const active = toOklch(compositeColors(variedActive, canvas)).c;
          const inactive = toOklch(compositeColors(hex(variedPaint.inactiveListBackground), canvas)).c;
          assert.ok(inactive <= active * 1.25 + 0.001,
            `${mode}/${overlayOpacity}: actual inactive tint must stay near active tint after changing opacity.`);
        }
        await testing.setParameters(state.parameters);
        console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: active/inactive tint consistency also holds at Overlay opacity 0.5 and 2.`);
        try {
          await testing.setParameters({ ...state.parameters, accent: "#ffff00" });
          const bright = api.getState();
          assert.equal(bright.palette.colors["button.foreground"], "#000000");
          await renderer.focusWindow();
          const editor = await vscode.window.showTextDocument(suggestionDocument, { preview: false });
          editor.selection = new vscode.Selection(0, 6, 0, 6);
          await vscode.commands.executeCommand("editor.action.triggerSuggest");
          const suggestion = await renderer.textPaint("suggestion");
          assert.ok(suggestion.kind === "suggestion");
          assert.equal(hex(suggestion.foreground), bright.palette.colors["editorSuggestWidget.selectedForeground"]);
          assert.equal(hex(suggestion.iconForeground), bright.palette.colors["editorSuggestWidget.selectedIconForeground"]);
          assert.equal(hex(suggestion.highlightForeground), bright.palette.colors["editorSuggestWidget.focusHighlightForeground"]);
          assert.notEqual(hex(suggestion.foreground), bright.palette.colors["button.foreground"]);
          const backdrop = compositeColors(hex(suggestion.background), bright.palette.colors["editorSuggestWidget.background"]!);
          assert.ok(contrastRatio(hex(suggestion.foreground), backdrop) >= 4.5);
          await vscode.commands.executeCommand("hideSuggestWidget");
          await vscode.commands.executeCommand("markdown.showPreviewToSide", markdownUri);
          const inline = await renderer.textPaint("inlineCode");
          assert.equal(hex(inline.foreground), bright.palette.colors["textPreformat.foreground"]);
          assert.equal(hex(inline.background), bright.palette.colors["textPreformat.background"]);
          assert.ok(contrastRatio(hex(inline.foreground), hex(inline.background)) >= 4.5);
          const exported = createThemeDocument(reference, bright.palette, "Native text colors", bright.syntax.palette, bright.syntax.brackets);
          for (const id of [
            "editorSuggestWidget.selectedForeground", "editorSuggestWidget.selectedIconForeground",
            "editorSuggestWidget.focusHighlightForeground", "textPreformat.foreground", "textPreformat.background"
          ]) assert.equal(exported.colors[id], bright.palette.colors[id], id);
          console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: native slash-style suggestions, icons/matches and rendered Markdown inline code stay readable with black primary-button text; export matches.`);
        } finally {
          await vscode.commands.executeCommand("hideSuggestWidget");
          await testing.setParameters(state.parameters);
          await selectAndBlur();
        }
        for (const [label, color, badge] of [
          ["new", "gitDecoration.addedResourceForeground", "A"],
          ["modified", "gitDecoration.modifiedResourceForeground", "M"]
        ]) {
          resourceDecoration = new vscode.FileDecoration(badge, `Themer native ${label} state`, new vscode.ThemeColor(color!));
          decorationEvents.fire(uri);
          const expected = state.palette.colors[color!];
          assert.ok(expected);
          const decorated = await renderer.personalityPaint((value) => hex(value.tabForeground) === expected);
          assert.equal(hex(decorated.tabForeground), expected, "Native resource colors must override the ordinary active accent.");
        }
        resourceDecoration = undefined;
        decorationEvents.fire(uri);
        await renderer.personalityPaint((value) => hex(value.tabForeground) === normalTabForeground);
        for (const [severity, color] of [
          [vscode.DiagnosticSeverity.Error, "list.errorForeground"],
          [vscode.DiagnosticSeverity.Warning, "list.warningForeground"]
        ] as const) {
          diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), "Themer native problem-state check", severity)]);
          const expected = state.palette.colors[color];
          assert.ok(expected);
          const decorated = await renderer.personalityPaint((value) => hex(value.tabForeground) === expected);
          assert.equal(hex(decorated.tabForeground), expected, "Real problem diagnostics must override the ordinary active accent.");
          diagnostics.delete(uri);
          await renderer.personalityPaint((value) => hex(value.tabForeground) === normalTabForeground);
        }
        const cleanTab = await renderer.personalityPaint();
        const dirtyEdit = new vscode.WorkspaceEdit();
        dirtyEdit.insert(uri, new vscode.Position(1, 0), "Unsaved native indicator check.\n");
        assert.equal(await vscode.workspace.applyEdit(dirtyEdit), true);
        const dirtyTab = await renderer.personalityPaint((value) => value.tabDirty);
        assert.equal(hex(dirtyTab.tabForeground), normalTabForeground);
        assert.notEqual(dirtyTab.tabCloseIcon, cleanTab.tabCloseIcon, "The real unsaved indicator must remain visible.");
        assert.equal(await document.save(), true);
        await renderer.personalityPaint((value) => !value.tabDirty);
        console.log(`PASS ${mode}/${modern ? "modern" : "classic"}: new/modified and real error/warning states override accent text; native unsaved indicator remains intact.`);
      }
      await vscode.window.showTextDocument(bracketDocument, { viewColumn: vscode.ViewColumn.One, preview: false });
      const lines = await renderer.snapshot([bracketSource, ""]);
      assert.equal(lines.length, 2);
      const neutral = renderResolvedSyntaxColor(api.getState().syntax.resolved, "neutral");
      let brackets = 0;
      for (let index = 0; index < bracketSource.length; index++) {
        if (!"()".includes(bracketSource[index]!)) continue;
        const run = lines[0]!.runs.find((run) => run.start <= index && run.end > index);
        assert.equal(run?.color, neutral, `Native monochrome bracket ${index} must use resolved Neutral 7.`);
        brackets++;
      }
      assert.equal(brackets, 12, "All six real nesting levels must render their opening and closing brackets.");
      const semicolon = bracketSource.lastIndexOf(";");
      assert.equal(lines[0]!.runs.find((run) => run.start <= semicolon && run.end > semicolon)?.color,
        api.getState().syntax.palette.editorForeground, "Uncolored TypeScript punctuation must use the generated editor foreground, not inline-code accent.");
      console.log(`PASS ${mode}: all 12 native brackets use resolved Neutral 7.`);
      console.log(`PASS ${mode}: actual TypeScript punctuation uses the generated neutral editor foreground.`);
      await debug.update("enableStatusBarColor", true, vscode.ConfigurationTarget.Workspace);
      const started = await vscode.debug.startDebugging(workspace, {
        type: "node", request: "launch", name: `Themer ${mode} native status test`,
        program: debugUri.fsPath, runtimeExecutable: "node", stopOnEntry: true, console: "internalConsole"
      });
      assert.equal(started, true, "The built-in Node debugger must start in the isolated profile.");
      await waitFor(() => vscode.debug.activeDebugSession !== undefined, "owned native debug session");
      debugSession = vscode.debug.activeDebugSession;
      assert.ok(debugSession);
      const debugPaint = await renderer.personalityPaint();
      assert.equal(hex(debugPaint.statusBackground), api.getState().palette.colors["statusBar.debuggingBackground"]);
      assert.equal(hex(debugPaint.statusForeground), api.getState().palette.colors["statusBar.debuggingForeground"]);
      await debug.update("enableStatusBarColor", false, vscode.ConfigurationTarget.Workspace);
      const disabledDebugPaint = await renderer.personalityPaint();
      assert.equal(hex(disabledDebugPaint.statusBackground), api.getState().palette.colors["statusBar.background"],
        "Disabling native debug coloring must preserve VS Code's normal status state.");
      await vscode.debug.stopDebugging(debugSession);
      debugSession = undefined;
      await waitFor(() => vscode.debug.activeDebugSession === undefined, "owned debug session cleanup");
      console.log(`PASS ${mode}: real native debugger switches to Color 2; debug.enableStatusBarColor is respected.`);
      await workbench.update("experimental.modernUI", previousModern, vscode.ConfigurationTarget.Global);
      await debug.update("enableStatusBarColor", previousDebugColor, vscode.ConfigurationTarget.Workspace);
      await testing.restorePreview();
      assert.deepEqual(await selectAndBlur(), original, "Cancel must restore original native variables and selection paint.");
      console.log(`PASS ${mode}: Cancel restores exact native variables and inactive selection paint.`);
    }
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await vscode.commands.executeCommand("themer.open");
    await vscode.commands.executeCommand("workbench.action.joinAllGroups");
    for (const mode of themeModes) {
      for (const width of [320, 400, 540, 800, 1200]) {
        const icons = await renderer.webviewIcons(width, mode);
        assert.equal(icons.viewportWidth, width);
        assert.equal(api.getState().parameters.mode, mode, "Native webview radio changes must reach the real host.");
        assert.deepEqual(icons.iconNames, [
          "chevron-down", "chevron-right", "code", "ellipsis", "git-branch", "info",
          "layout", "loading", "terminal", "window"
        ]);
        assert.deepEqual(icons.errors, [], `${mode}/${width}: ${icons.errors.join("; ")}`);
        assert.equal(hex(icons.controls.codeForeground), api.getState().syntax.palette.editorForeground,
          "The block-code preview must use Color 7/editor foreground rather than inline Markdown accent.");
        assert.equal(hex(icons.controls.inlineCodeForeground), api.getState().palette.colors["textPreformat.foreground"]);
        if (width >= 540) assert.equal(icons.controls.anchorColumns, 3, "Three 130px color controls should fit well below the former 700px threshold.");
      }
      console.log(`PASS ${mode}: actual Themer product icons, accessibility, artwork bounds and navigation layout at five exact widths from 320 to 1200 px.`);
    }
    for (const mode of themeModes) {
      await renderer.webviewIcons(800, mode);
      await renderer.webviewControl({ id: "workspace-menu-button", event: "click" });
      await renderer.webviewControl({ id: "reset-button", event: "click" });
      const defaults = getDefaultParameters(references[mode]);
      await waitFor(() => !api.getState().parameters.accentActiveItems && api.getState().parameters.foreground === defaults.foreground,
        `${mode} active-item regression baseline`);
      await testing.startPreview();
      for (const modern of [false, true]) {
        await workbench.update("experimental.modernUI", modern, vscode.ConfigurationTarget.Global);
        for (const foreground of [defaults.foreground, mode === "dark" ? "#ffffff" : "#000000"]) {
          await renderer.webviewControl({ id: "foreground-picker", event: "input", value: foreground });
          await renderer.webviewControl({ id: "foreground-picker", event: "change" });
          await waitFor(() => api.getState().parameters.foreground === foreground, `${mode} actual foreground input`);
          const before = await renderer.webviewIcons(800, mode);
          assert.equal(before.controls.accentActiveItems, false);
          await renderer.webviewControl({ id: "personality-accentActiveItems", event: "click" });
          await waitFor(() => api.getState().parameters.accentActiveItems, `${mode} actual accent switch on`);
          const on = await renderer.webviewIcons(800, mode);
          const state = api.getState();
          assert.equal(on.controls.accentActiveItems, true);
          assert.equal(hex(on.controls.activeTabForeground), state.palette.colors["tab.activeForeground"]);
          assert.ok(deltaE(hex(before.controls.activeTabForeground), hex(on.controls.activeTabForeground)) >= 5,
            `${mode}/${modern}/${foreground}: the real switch must visibly change gallery active text.`);
          assert.ok(toOklch(hex(on.controls.activeTabForeground)).c > 0.03);
          const paint = await renderer.personalityPaint();
          const tabIds = modern ? ["modernEditorTab.activeForeground", "modernTab.activeForeground"]
            : ["tab.activeForeground", "tab.unfocusedActiveForeground"];
          assert.ok(tabIds.some((id) => state.palette.colors[id] === hex(paint.tabForeground)));
          await renderer.webviewControl({ id: "personality-accentActiveItems", event: "click" });
          await waitFor(() => !api.getState().parameters.accentActiveItems, `${mode} actual accent switch off`);
          const off = await renderer.webviewIcons(800, mode);
          assert.equal(off.controls.activeTabForeground, before.controls.activeTabForeground);
          assert.deepEqual(off.errors, []);
        }
      }
      await workbench.update("experimental.modernUI", previousModern, vscode.ConfigurationTarget.Global);
      await testing.restorePreview();
      await renderer.webviewControl({ id: "workspace-menu-button", event: "click" });
      await renderer.webviewControl({ id: "reset-button", event: "click" });
      await waitFor(() => api.getState().parameters.foreground === defaults.foreground, `${mode} restore normal primary foreground`);
      console.log(`PASS ${mode}: the actual Accent active items switch changes gallery and native classic/Modern text at default and endpoint foregrounds; switching off restores the original color.`);
    }
    for (const mode of themeModes) {
      await renderer.webviewIcons(800, mode);
      const remembered = api.getState().parameters.info;
      for (const source of infoSources) {
        await renderer.webviewControl({ id: `info-source-${source}`, event: "click" });
        await waitFor(() => api.getState().parameters.infoSource === source, `${mode} Info ${source}`);
        const frame = await renderer.webviewIcons(800, mode);
        assert.equal(frame.controls.infoSource, source);
        assert.equal(frame.controls.infoColor, api.getState().palette.colors["editorInfo.foreground"]);
        assert.equal(frame.controls.infoHex, frame.controls.infoColor);
        assert.equal(api.getState().parameters.info, remembered);
        assert.deepEqual(frame.errors, []);
      }
      await renderer.webviewControl({ id: "info-source-accent", event: "click" });
      await renderer.webviewControl({ id: "info-picker", event: "input", value: "#8855ee" });
      await renderer.webviewControl({ id: "info-picker", event: "change" });
      await waitFor(() => api.getState().parameters.infoSource === "custom" && api.getState().parameters.info === "#8855ee",
        `${mode} Info editing selects Custom`);
      for (const source of ["foreground", "custom", "accent"] as const) {
        await renderer.webviewControl({ id: `info-source-${source}`, event: "click" });
        await waitFor(() => api.getState().parameters.infoSource === source, `${mode} remembered Info ${source}`);
        const frame = await renderer.webviewIcons(800, mode);
        assert.equal(frame.controls.infoColor, api.getState().palette.colors["editorInfo.foreground"]);
        assert.equal(frame.controls.infoHex, frame.controls.infoColor);
        assert.equal(api.getState().parameters.info, "#8855ee");
      }
      await renderer.webviewControl({ id: "info-hex", event: "input", value: "#" });
      await waitFor(() => api.getState().parameters.infoSource === "custom", `${mode} partial Info editing selects Custom`);
      const invalid = await renderer.webviewIcons(800, mode);
      assert.equal(invalid.controls.infoHex, "#");
      assert.equal(invalid.controls.applyDisabled, true);
      assert.equal(invalid.controls.workspaceApplyDisabled, true);
      await renderer.webviewControl({ id: "info-source-foreground", event: "click" });
      await waitFor(() => api.getState().parameters.infoSource === "foreground", `${mode} Info source clears invalid input`);
      const recovered = await renderer.webviewIcons(800, mode);
      assert.equal(recovered.controls.infoHex, api.getState().palette.colors["editorInfo.foreground"]);
      await renderer.webviewControl({ id: "info-hex", event: "input", value: "#5588bb" });
      await renderer.webviewControl({ id: "info-hex", event: "change" });
      await waitFor(() => api.getState().parameters.infoSource === "custom" && api.getState().parameters.info === "#5588bb",
        `${mode} valid Info hex editing selects Custom`);
      console.log(`PASS ${mode}: always-editable Info color aligns with severity inputs, source radios update the displayed value, edits select Custom and invalid edits recover.`);
      for (const width of [320, 400, 540, 800, 1200]) {
        await renderer.webviewIcons(width, mode);
        for (const { key, parameter, slider } of [
          { key: "autoChroma", parameter: "chromaMode", slider: "chromaBoost" },
          { key: "autoLightness", parameter: "lightnessMode", slider: "lightnessShift" }
        ] as const) {
          for (const adjustment of ["manual", "off", "auto"] as const satisfies readonly (typeof syntaxAdjustmentModes)[number][]) {
            await renderer.webviewControl({ id: `syntax-${key}-${adjustment}`, event: "click" });
            await waitFor(() => api.getState().syntax.parameters[parameter] === adjustment, `${mode}/${width}/${key}/${adjustment}`);
            if (adjustment === "manual") {
              await renderer.webviewControl({ id: `syntax-${slider}`, event: "input", value: "0.2" });
              await renderer.webviewControl({ id: `syntax-${slider}`, event: "change" });
              await waitFor(() => api.getState().syntax.parameters[slider] === 0.2, `${mode}/${width}/${slider} compact slider`);
            }
            const frame = await renderer.webviewIcons(width, mode);
            assert.deepEqual(frame.errors, [], `${mode}/${width}/${key}/${adjustment}: ${frame.errors.join("; ")}`);
          }
        }
        for (const paletteMode of syntaxPaletteModes) {
          await renderer.webviewControl({ id: `syntax-palette-mode-${paletteMode}`, event: "click" });
          await waitFor(() => api.getState().syntax.parameters.paletteMode === paletteMode, `${mode} syntax ${paletteMode}`);
          const frame = await renderer.webviewIcons(width, mode);
          assert.equal(frame.controls.paletteMode, paletteMode);
          assert.deepEqual(frame.controls.visibleSeeds, paletteMode === "auto" ? [] : paletteMode === "anchored" ? ["blue"] : [...syntaxFamilies]);
          assert.equal(frame.controls.resetVisible, paletteMode === "manual");
          assert.deepEqual(frame.errors, [], `${mode}/${width}/${paletteMode}: ${frame.errors.join("; ")}`);
          if (paletteMode === "anchored") {
            await renderer.webviewControl({ id: "syntax-blue-picker", event: "input", value: "#a75287" });
            await renderer.webviewControl({ id: "syntax-blue-picker", event: "change" });
            await waitFor(() => api.getState().syntax.resolved.colors.blue === "#a75287", `${mode} anchored picker reaches host`);
          } else if (paletteMode === "manual") {
            await renderer.webviewControl({ id: "reset-syntax-palette", event: "click" });
            const originalBlue = fitSyntaxModel(references[mode]).parameters.blue;
            await waitFor(() => api.getState().syntax.parameters.blue === originalBlue, `${mode} manual palette reset`);
            assert.equal(api.getState().syntax.parameters.paletteMode, "manual");
          }
        }
      }
      console.log(`PASS ${mode}: real Auto/Anchored/Manual radios, editable anchor and Manual-only adjacent reset reach the host, with complete grids and no clipping at five exact widths.`);
      console.log(`PASS ${mode}: switch-first Personality, one-line syntax selectors, two-line Manual adjustments and right-aligned Anchor controls remain accessible at five exact widths.`);
    }
    for (const mode of themeModes) {
      await renderer.webviewIcons(800, mode);
      const workspaceBefore = readThemeSettings("workspaceValue");
      const userBefore = readThemeSettings("globalValue");
      const sample = editorSamples.find((sample) => sample.language === "typescript");
      assert.ok(sample);
      const sampleUri = vscode.Uri.joinPath(extension.extensionUri, "samples", sample.file).toString();
      await renderer.webviewControl({ id: "sample-typescript-button", event: "click" });
      await waitFor(() => vscode.window.visibleTextEditors.some((editor) => editor.document.uri.toString() === sampleUri),
        `${mode} real sample button opens TypeScript`);
      const opened = await renderer.webviewIcons(800, mode);
      assert.doesNotMatch(opened.controls.statusText, /Opening a real/);
      await renderer.webviewControl({ id: "all-samples-button", event: "click" });
      const choosing = await renderer.webviewIcons(800, mode);
      assert.match(choosing.controls.statusText, /Opening the syntax sample picker/);
      await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
      const canceled = await renderer.webviewIcons(800, mode);
      assert.doesNotMatch(canceled.controls.statusText, /Opening the syntax sample picker/);
      assert.equal(canceled.controls.evaluationHidden, true);
      assert.equal(canceled.controls.evaluationRows, 0);
      assert.equal(api.getState().livePreview, false);
      assert.deepEqual(readThemeSettings("workspaceValue"), workspaceBefore);
      assert.deepEqual(readThemeSettings("globalValue"), userBefore);
      console.log(`PASS ${mode}: sample-button success and picker cancellation clear command notices without settings writes; hidden evaluation lists stay unrendered.`);
    }
    for (const mode of themeModes) {
      const controls = await renderer.webviewIcons(800, mode);
      assert.equal(controls.controls.applyDisabled, false);
      assert.equal(controls.controls.workspaceApplyDisabled, false);
      const workspaceBefore = readThemeSettings("workspaceValue");
      const draft = api.getState();
      assert.equal(draft.livePreview, false);
      await renderer.webviewControl({ id: "apply-button", event: "click" });
      await waitFor(() => workbench.inspect("colorTheme")?.globalValue === previewThemeNames[mode] &&
        !api.getState().busy && api.getState().status.startsWith("Theme saved to User"), `${mode} real User Apply`);
      assert.deepEqual(readThemeSettings("workspaceValue"), workspaceBefore);
      const user = readThemeSettings("globalValue");
      const userColors = requireRecord(requireRecord(user.colors, "Applied User colors")[previewScope], "Applied User scope");
      assert.deepEqual(Object.fromEntries(Object.entries(userColors).filter(([id]) => managedThemeColorIds.has(id))),
        themeColors(draft.palette, draft.syntax.palette, draft.syntax.brackets));
      assert.deepEqual(requireRecord(requireRecord(user.tokens, "Applied User tokens")[previewScope], "Applied User token scope").textMateRules,
        draft.syntax.palette.tokenColors);
      await renderer.webviewControl({ id: "workspace-menu-button", event: "click" });
      await renderer.webviewControl({ id: "apply-workspace-button", event: "click" });
      await waitFor(() => workbench.inspect("colorTheme")?.workspaceValue === previewThemeNames[mode] &&
        !api.getState().busy && api.getState().status.startsWith("Theme saved to Workspace"), `${mode} real Workspace Apply`);
      assert.deepEqual(readThemeSettings("globalValue"), user);
      assert.equal(api.getState().livePreview, false);
      console.log(`PASS ${mode}: actual Apply button saves to User settings; overflow Apply workspace saves only to Workspace settings with preview off.`);
    }
  } finally {
    completions.dispose();
    diagnostics.dispose();
    resourceDecorations.dispose();
    decorationEvents.dispose();
    focusInput.dispose();
    if (debugSession) await vscode.debug.stopDebugging(debugSession);
    if (api.getState().livePreview) await testing.restorePreview();
    await restoreThemeSettings(originalUserTheme, vscode.ConfigurationTarget.Global);
    await restoreThemeSettings(originalWorkspaceTheme, vscode.ConfigurationTarget.Workspace);
    await workbench.update("experimental.modernUI", previousModern, vscode.ConfigurationTarget.Global);
    await workbench.update("editor.decorations.colors", previousDecorationColors, vscode.ConfigurationTarget.Workspace);
    await workbench.update("editor.decorations.badges", previousDecorationBadges, vscode.ConfigurationTarget.Workspace);
    await problems.update("decorations.enabled", previousProblemDecorations, vscode.ConfigurationTarget.Workspace);
    await editorConfiguration.update("scrollbar.vertical", previousScrollbar, vscode.ConfigurationTarget.Workspace);
    await editorConfiguration.update("stickyScroll.enabled", previousSticky, vscode.ConfigurationTarget.Workspace);
    await editorConfiguration.update("stickyScroll.defaultModel", previousStickyModel, vscode.ConfigurationTarget.Workspace);
    await debug.update("enableStatusBarColor", previousDebugColor, vscode.ConfigurationTarget.Workspace);
    renderer.close();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
}
