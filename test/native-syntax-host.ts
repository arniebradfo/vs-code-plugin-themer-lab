import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { ThemerApi } from "../src/extension/api";
import { contrastRatio, limitOklchChroma, parseColor, toHex, toOklch } from "../src/color";
import { validateTolerance } from "../src/model/evaluation";
import { modelDefinitions } from "../src/model/rules";
import { references } from "../src/shared/reference";
import { editorSamples } from "../src/shared/samples";
import { parseThemeMode, requireRecord, requireString } from "../src/shared/validation";
import {
  evaluateSyntaxRules, fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, SyntaxParameters, syntaxFamilies,
  isSyntaxAutomatic, renderResolvedSyntaxColor, resolveSyntaxParameters,
  setSyntaxSeed, syntaxFamilyLabels, syntaxFamilySourceColors, syntaxNumericParameterLimits, syntaxVocabularyFor
} from "../src/syntax";
import { SyntaxFamily, syntaxAutoModes, syntaxPaletteModes, syntaxWheelFamilies } from "../src/shared/types";
import { bracketColorIds, unexpectedBracketId } from "../src/syntax/brackets";
import { compareNativeForegrounds, summarizeNativePairs } from "../src/syntax/evaluation";
import { expandTabs, NativeLine, NativeRenderer } from "./support/native-renderer";

const themeMode = parseThemeMode(process.env.THEMER_THEME_MODE ?? "dark");
const reference = references[themeMode];
const reportSuffix = themeMode === "light" ? "-light" : "";

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function semanticCoverage(document: vscode.TextDocument) {
  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
    "vscode.provideDocumentSemanticTokensLegend", document.uri
  );
  if (!legend) {
    assert.ok(!["typescript", "typescriptreact", "javascript", "html"].includes(document.languageId),
      `${document.languageId} must have its built-in semantic provider.`);
    return { available: false, tokenCount: 0, tokenTypes: [] as string[] };
  }
  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
    "vscode.provideDocumentSemanticTokens", document.uri
  );
  assert.ok(tokens, `The ${document.languageId} semantic provider did not return tokens.`);
  assert.equal(tokens.data.length % 5, 0);
  const types = new Set<string>();
  for (let index = 3; index < tokens.data.length; index += 5) {
    const type = legend.tokenTypes[tokens.data[index] ?? -1];
    assert.ok(type, "Every semantic token type must have a legend entry.");
    types.add(type);
  }
  return { available: true, tokenCount: tokens.data.length / 5, tokenTypes: [...types].sort() };
}

function colorCounts(lines: NativeLine[]) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const run of line.runs) {
      const count = line.text.slice(run.start, run.end).replace(/\s/g, "").length;
      if (count > 0) counts.set(run.color, (counts.get(run.color) ?? 0) + count);
    }
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right, "en")));
}

async function verifySource(): Promise<{ version: string; commit: string }> {
  const product = requireRecord(JSON.parse(await readFile(path.join(vscode.env.appRoot, "product.json"), "utf8")), "VS Code product");
  assert.equal(product.version, vscode.version, "The native runtime must match its installed application metadata.");
  const commit = requireString(product.commit, "Native VS Code commit");
  for (const source of reference.sources) {
    const content = await readFile(path.join(vscode.env.appRoot, ...source.path.split("/")));
    assert.equal(hash(content), source.sha256, `Installed native theme source changed: ${source.path}`);
  }
  return { version: vscode.version, commit };
}

async function applySyntax(api: ThemerApi, parameters?: SyntaxParameters): Promise<void> {
  const testing = api.testing;
  assert.ok(testing, "The native integration test requires ExtensionMode.Test.");
  if (parameters) {
    await testing.setSyntaxParameters(parameters);
    if (!api.getState().livePreview) await testing.startPreview();
  } else if (api.getState().livePreview) {
    await testing.restorePreview();
  }
}

async function captureSample(
  renderer: NativeRenderer,
  workspace: vscode.WorkspaceFolder,
  sample: (typeof editorSamples)[number],
  semantic: boolean
) {
  const document: vscode.TextDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri, "samples", sample.file));
  assert.equal(document.languageId, sample.language, sample.file);
  const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
  const provider = semantic ? await semanticCoverage(document) : null;
  const expected = Array.from({ length: document.lineCount }, (_, index) => expandTabs(document.lineAt(index).text));
  const lines = await renderer.snapshot(expected);
  const colors = colorCounts(lines);
  assert.ok(Object.keys(colors).length > 1, `${sample.file} must have actual native highlighting.`);
  return {
    file: sample.file,
    language: sample.language,
    sha256: hash(await readFile(document.uri.fsPath)),
    mode: semantic ? "semantic-enabled" : "grammar-only",
    lineCount: document.lineCount,
    semanticProvider: provider,
    colors,
    lines
  };
}

function cssColorHex(value: string): string {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(value);
  assert.ok(match, `Unexpected native CSS background ${value}.`);
  const channels = match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
  const alpha = Math.round(Number(match[4] ?? 1) * 255);
  return `#${channels}${alpha === 255 ? "" : alpha.toString(16).padStart(2, "0")}`;
}

async function testNativeChangeColors(plugin: ThemerApi, renderer: NativeRenderer, workspace: vscode.WorkspaceFolder): Promise<void> {
  const testing = plugin.testing;
  assert.ok(testing);
  const before = vscode.Uri.joinPath(workspace.uri, "diff-preview-before.ts");
  const after = vscode.Uri.joinPath(workspace.uri, "diff-preview-after.ts");
  await vscode.workspace.fs.writeFile(before, new TextEncoder().encode('export const title = "old name";\nexport const removed = true;\n'));
  await vscode.workspace.fs.writeFile(after, new TextEncoder().encode('export const title = "new name";\nexport const inserted = false;\n'));
  await vscode.commands.executeCommand("vscode.diff", before, after, "Themer native change-color test", { preview: false });
  const original = await renderer.diffBackgrounds();
  await testing.startPreview();
  const opacity = modelDefinitions[themeMode].opacities;
  const lineAlpha = Math.round(opacity.overlay * 255).toString(16).padStart(2, "0");
  const wordAlpha = Math.round(opacity.highlight * 255).toString(16).padStart(2, "0");
  for (const [added, deleted] of [["#8855ee", "#00aeff"], ["#ffbb00", "#bb00ff"]] as const) {
    await testing.setParameters({ ...plugin.getState().parameters, added, deleted, modified: "#ff9900" });
    const colors = await renderer.diffBackgrounds();
    for (const [key, expected] of [
      ["addedLine", `${added}${lineAlpha}`], ["addedText", `${added}${wordAlpha}`],
      ["deletedLine", `${deleted}${lineAlpha}`], ["deletedText", `${deleted}${wordAlpha}`]
    ] as const) {
      assert.ok(colors[key].some((value) => cssColorHex(value) === expected),
        `${key} must use generated ${expected}; actual backgrounds: ${colors[key].join(", ")}`);
    }
  }
  await testing.restorePreview();
  assert.deepEqual(await renderer.diffBackgrounds(), original, "Cancel must restore the original native diff backgrounds.");
  console.log("PASS actual diff line/word backgrounds update from Added/Deleted and restore exactly on Cancel.");
}

async function testNativeBrackets(plugin: ThemerApi, renderer: NativeRenderer, workspace: vscode.WorkspaceFolder) {
  const testing = plugin.testing;
  assert.ok(testing);
  await testing.resetSyntax();
  await testing.setSyntaxParameters(fitSyntaxModel(reference).parameters);
  const configuration = vscode.workspace.getConfiguration("editor");
  const previous = {
    brackets: configuration.inspect("bracketPairColorization.enabled")?.workspaceValue,
    guides: configuration.inspect("guides.bracketPairs")?.workspaceValue,
    horizontal: configuration.inspect("guides.bracketPairsHorizontal")?.workspaceValue,
    active: configuration.inspect("guides.highlightActiveBracketPair")?.workspaceValue
  };
  const lines = ["const bracketSample = ("];
  for (let depth = 2; depth <= 8; depth++) lines.push(`${"  ".repeat(depth - 1)}(`);
  lines.push(`${"  ".repeat(8)}true`);
  for (let depth = 8; depth >= 2; depth--) lines.push(`${"  ".repeat(depth - 1)})`);
  lines.push(");", "]", "");
  const uri = vscode.Uri.joinPath(workspace.uri, "bracket-preview.ts");
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(lines.join("\n")));
  const document = await vscode.workspace.openTextDocument(uri);
  const capture = async () => {
    const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One, preview: false });
    editor.selection = new vscode.Selection(8, 16, 8, 16);
    editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
    return renderer.snapshot(lines, true);
  };
  const foreground = (snapshot: NativeLine[], line: number, character: "(" | ")" | "]") => {
    const row = snapshot[line];
    assert.ok(row);
    const column = row.text.indexOf(character);
    assert.ok(column >= 0);
    const color = row.runs.find((run) => run.start <= column && run.end > column)?.color;
    assert.ok(color, `Native bracket ${character} on line ${line + 1} must have a foreground.`);
    return color;
  };
  const originalParameters = plugin.getState().parameters;
  const originalSyntax = plugin.getState().syntax.parameters;
  try {
    await configuration.update("bracketPairColorization.enabled", true, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.bracketPairs", true, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.bracketPairsHorizontal", true, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.highlightActiveBracketPair", true, vscode.ConfigurationTarget.Workspace);
    const native = await capture();
    const nativeGuides = await renderer.bracketGuides();
    const baseline = {
      nestedForegrounds: Array.from({ length: 8 }, (_, index) => foreground(native, index, "(")),
      unexpected: foreground(native, 17, "]"),
      guideBorders: nativeGuides
    };
    await configuration.update("bracketPairColorization.enabled", false, vscode.ConfigurationTarget.Workspace);
    const disabled = await capture();
    await testing.startPreview();
    const initialPalette = plugin.getState().syntax.brackets;
    assert.equal(vscode.workspace.getConfiguration("editor", uri).get("bracketPairColorization.enabled"), true,
      "Live preview must enable bracket colorization for the native document.");
    assert.equal(vscode.workspace.getConfiguration("editor", uri).get("guides.bracketPairs"), true, "Preview must not change guide visibility.");
    const validate = async () => {
      const snapshot = await capture();
      const palette = plugin.getState().syntax.brackets;
      for (let index = 0; index < 8; index++) {
        assert.equal(foreground(snapshot, index, "("), palette.colors[`editorBracketHighlight.foreground${index % 6 + 1}`],
          "Native bracket levels must cycle through the six existing seeds.");
        const closeLine = index === 0 ? 16 : 16 - index;
        assert.equal(foreground(snapshot, closeLine, ")"), foreground(snapshot, index, "("), "Matching brackets must have identical colors.");
      }
      const errorColor = foreground(snapshot, 17, "]");
      assert.equal(errorColor, palette.colors[unexpectedBracketId]);
      const canvas = plugin.getState().palette.colors["editor.background"];
      assert.ok(canvas);
      assert.ok(contrastRatio(errorColor, canvas) >= 4.5);
      const guides = (await renderer.bracketGuides()).map(cssColorHex);
      for (let slot = 1; slot <= 6; slot++) {
        assert.ok(guides.includes(palette.colors[`editorBracketPairGuide.background${slot}`] ?? ""),
          `The native editor must draw inactive guide color ${slot}; actual ${guides.join(", ")}`);
      }
      assert.ok(Array.from({ length: 6 }, (_, index) => palette.colors[`editorBracketPairGuide.activeBackground${index + 1}`])
        .some((color) => color !== undefined && guides.includes(color)), "An active guide must use a stronger derived color.");
      return { foregrounds: Array.from({ length: 8 }, (_, index) => foreground(snapshot, index, "(")), error: errorColor, guides };
    };
    const generated = await validate();
    for (const family of syntaxWheelFamilies) {
      await testing.setSyntaxParameters({ ...originalSyntax, [family]: "#ff0000" });
      await validate();
    }
    let previousChroma = generated.foregrounds.map(() => 0);
    for (const chromaBoost of [-1, -0.5, 0, 0.5, 1]) {
      await testing.setSyntaxParameters({ ...originalSyntax, chromaBoost });
      const current = await validate();
      previousChroma = current.foregrounds.map((value, index) => {
        const original = generated.foregrounds[index];
        const preceding = previousChroma[index];
        assert.ok(original && preceding !== undefined);
        const color = toOklch(value);
        const base = toOklch(original);
        assert.ok(Math.abs(color.l - base.l) < 0.003, "Native bracket boost must preserve lightness.");
        assert.ok(color.c >= preceding - 0.003, "Native bracket chroma must rise monotonically.");
        const maximum = limitOklchChroma(base.l, 1, base.h ?? 0);
        const expected = chromaBoost <= 0 ? base.c * (1 + chromaBoost) : base.c + (maximum - base.c) * chromaBoost;
        assert.ok(Math.abs(color.c - expected) < 0.003, "Native brackets must use their own chroma headroom.");
        if (chromaBoost === -1) assert.ok(color.c < 1e-6);
        if (color.c > 0.02 && base.c > 0.02) {
          const distance = Math.abs((((color.h ?? 0) - (base.h ?? 0) + 540) % 360) - 180);
          assert.ok(distance < 2, "Native bracket boost must preserve hue.");
        }
        return color.c;
      });
      assert.equal(current.error, generated.error, "Code chroma boost must not mute unexpected brackets.");
    }
    await testing.setSyntaxParameters({
      ...originalSyntax, chromaBoost: 0.5,
      lightnessShift: -0.2
    });
    await validate();
    await testing.resetSyntax();
    const automatic = await validate();
    await testing.setParameters({ ...originalParameters, foreground: "#ffffff" });
    const whiteForeground = await validate();
    for (const value of whiteForeground.foregrounds) {
      const color = toOklch(value);
      assert.ok(Math.abs(color.l - 0.85) < 0.003, "Native white-foreground brackets must use the scaled Auto Lightness.");
      assert.ok(color.c > 0.03, "Native brackets must retain visible chroma instead of washing out to white.");
    }
    await testing.setSyntaxAuto("autoLightness", false);
    assert.deepEqual(await validate(), whiteForeground, "Capturing capped lightness must preserve native bracket and guide paint.");
    await testing.setSyntaxAuto("autoLightness", true);
    if (themeMode === "light") {
      await testing.setParameters({ ...originalParameters, foreground: "#000000" });
      const blackForeground = await validate();
      for (const value of blackForeground.foregrounds) {
        assert.ok(Math.abs(toOklch(value).l - 0.4) < 0.003, "Light brackets must use the soft lower-lightness limit.");
        assert.ok(toOklch(value).c > 0.03, "Black UI text must not collapse Light brackets to black.");
      }
      await testing.setSyntaxAuto("autoLightness", false);
      assert.deepEqual(await validate(), blackForeground, "Capturing the Light floor must preserve bracket/guide paint.");
      await testing.setSyntaxAuto("autoLightness", true);
    }
    await testing.setParameters(originalParameters);
    for (const mode of syntaxAutoModes) {
      const before = await validate();
      await testing.setSyntaxAuto(mode, false);
      assert.deepEqual(await validate(), before, `${mode} must preserve native bracket and guide paint during handoff.`);
    }
    assert.ok(automatic.foregrounds.some((color, index) => color !== generated.foregrounds[index]),
      "Automatic brackets must use the coordinated palette, not the manual baseline.");
    for (const mode of syntaxAutoModes) {
      await testing.resetSyntaxGroup(mode);
      assert.equal(isSyntaxAutomatic(plugin.getState().syntax.parameters, mode), false);
      await validate();
    }
    await testing.setSyntaxPaletteMode("anchored");
    await testing.setSyntaxParameters(setSyntaxSeed(plugin.getState().syntax.parameters, "blue", "#a75287"));
    const anchored = await validate();
    assert.equal(anchored.foregrounds[0], "#a75287", "The first native bracket slot must follow the editable Color 1 anchor.");
    await testing.setSyntaxPaletteMode("manual");
    assert.deepEqual(await validate(), anchored, "Anchored-to-Manual must preserve actual bracket and guide paint.");
    for (const error of ["#64758f", "#808080"]) {
      await testing.setParameters({ ...originalParameters, error });
      await validate();
    }
    assert.equal(plugin.getState().syntax.brackets.usesRedFallback, true);
    await testing.restorePreview();
    assert.equal(vscode.workspace.getConfiguration("editor", uri).get("bracketPairColorization.enabled"), false);
    assert.deepEqual(await capture(), disabled, "Cancel must restore exact disabled-bracket foregrounds.");
    await configuration.update("bracketPairColorization.enabled", true, vscode.ConfigurationTarget.Workspace);
    assert.deepEqual(await capture(), native, "After Cancel, enabling brackets again must reveal the exact native palette.");
    assert.deepEqual(await renderer.bracketGuides(), nativeGuides);
    console.log("PASS native brackets cycle six seeds, boost uses per-color headroom, guides follow, errors stay vivid, and Cancel restores colors and enabled state.");
    return {
      sourceOfTruth: "Actual native editor foregrounds and painted guide colors",
      native: baseline, generated, generatedColorCount: bracketColorIds.length,
      generatedColorsSha256: hash(JSON.stringify(initialPalette.colors)),
      chromaBoost: true,
      automaticModes: true,
      anchoredPalette: true,
      whiteForegroundChroma: true,
      lightModeBlackForegroundChroma: themeMode === "light" ? true : null,
      passes: true
    };
  } finally {
    if (plugin.getState().livePreview) await testing.restorePreview();
    await testing.setParameters(originalParameters);
    await testing.setSyntaxParameters(originalSyntax);
    await configuration.update("bracketPairColorization.enabled", previous.brackets, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.bracketPairs", previous.guides, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.bracketPairsHorizontal", previous.horizontal, vscode.ConfigurationTarget.Workspace);
    await configuration.update("guides.highlightActiveBracketPair", previous.active, vscode.ConfigurationTarget.Workspace);
  }
}

async function testNativeAutomaticSyntax(plugin: ThemerApi, renderer: NativeRenderer, workspace: vscode.WorkspaceFolder) {
  const testing = plugin.testing;
  assert.ok(testing);
  const originalUi = plugin.getState().parameters;
  const originalSyntax = plugin.getState().syntax.parameters;
  const capture = () => captureSample(renderer, workspace, editorSamples[0], true);
  const checkAutomatic = async () => {
    const sample = await capture();
    const state = plugin.getState();
    const base = state.syntax.resolved.lightnessBase;
    assert.ok(base);
    const palette = state.syntax.palette;
    const colors = new Set([
      palette.editorForeground,
      ...palette.tokenColors.flatMap((rule) => rule.settings.foreground ? [rule.settings.foreground] : []),
      ...Object.values(palette.semanticTokenColors).flatMap((style) =>
        typeof style === "string" ? [style] : style.foreground ? [style.foreground] : [])
    ]);
    for (const line of sample.lines) {
      for (const run of line.runs) {
        if (!line.text.slice(run.start, run.end).trim()) continue;
        assert.ok(colors.has(run.color), `Native automatic foreground ${run.color} must be generated by the actual palette.`);
        const target = line.text.trimStart().startsWith("//") ? base.comments : base.text;
        assert.ok(Math.abs(toOklch(run.color).l - target) < 0.003,
          "Automatic native syntax must use UI foreground/muted lightness.");
      }
    }
    assert.ok(Math.abs(state.syntax.resolved.chromaBoost) <= 0.25);
    return sample;
  };
  try {
    await testing.resetSyntax();
    if (!plugin.getState().livePreview) await testing.startPreview();
    for (const mode of syntaxAutoModes) assert.equal(isSyntaxAutomatic(plugin.getState().syntax.parameters, mode), true);
    const initial = await checkAutomatic();
    assert.equal(vscode.window.activeColorTheme.kind, themeMode === "light" ? vscode.ColorThemeKind.Light : vscode.ColorThemeKind.Dark,
      "The contributed preview must select the correct native workbench theme kind.");
    const generatedSha256 = hash(JSON.stringify(plugin.getState().syntax.palette));
    let minimumWhiteWheelChroma = 1;
    let whiteColoredForegroundCount = 0;
    for (const mutedContrast of [1, 2]) {
      await testing.setParameters({ ...originalUi, foreground: "#ffffff", mutedContrast });
      const white = await checkAutomatic();
      const state = plugin.getState();
      assert.equal(state.palette.colors.foreground, "#ffffff", "UI foreground must remain white.");
      assert.equal(state.syntax.resolved.lightnessBase?.text, 0.85);
      assert.ok(state.syntax.resolved.lightnessBase && state.syntax.resolved.lightnessBase.comments <= 0.85);
      const wheelChroma = syntaxWheelFamilies.map((family) => toOklch(state.syntax.resolved.colors[family]).c);
      minimumWhiteWheelChroma = Math.min(minimumWhiteWheelChroma, ...wheelChroma);
      assert.ok(wheelChroma.every((chroma) => chroma > 0.03), "Every automatic wheel seed must keep visible chroma.");
      const colored = new Set(white.lines.flatMap((line) => line.runs
        .filter((run) => line.text.slice(run.start, run.end).trim() && toOklch(run.color).c > 0.03)
        .map((run) => run.color)));
      assert.ok(colored.size >= 4, "White UI foreground must retain multiple actual syntax colors.");
      whiteColoredForegroundCount = Math.max(whiteColoredForegroundCount, colored.size);
      await testing.setSyntaxAuto("autoLightness", false);
      assert.deepEqual((await capture()).lines, white.lines, "Scaled lightness must hand off exact native colors.");
      await testing.setSyntaxAuto("autoLightness", true);
    }
    let lightnessFloor: {
      blackTarget: number;
      minimumBlackWheelChroma: number;
      blackColoredForegroundCount: number;
    } | null = null;
    if (themeMode === "light") {
      await testing.setParameters({ ...originalUi, foreground: "#000000" });
      const black = await checkAutomatic();
      const state = plugin.getState();
      assert.equal(state.palette.colors.foreground, "#000000");
      assert.equal(state.syntax.resolved.lightnessBase?.text, 0.4);
      const minimumBlackWheelChroma = Math.min(...syntaxWheelFamilies.map((family) => toOklch(state.syntax.resolved.colors[family]).c));
      assert.ok(minimumBlackWheelChroma > 0.03);
      const blackColoredForegroundCount = new Set(black.lines.flatMap((line) => line.runs
        .filter((run) => line.text.slice(run.start, run.end).trim() && toOklch(run.color).c > 0.03)
        .map((run) => run.color))).size;
      assert.ok(blackColoredForegroundCount >= 4);
      await testing.setSyntaxAuto("autoLightness", false);
      assert.deepEqual((await capture()).lines, black.lines, "The Light lower limit must hand off exact native colors.");
      await testing.setSyntaxAuto("autoLightness", true);
      lightnessFloor = { blackTarget: 0.4, minimumBlackWheelChroma, blackColoredForegroundCount };
    }
    for (const accent of ["#20a080", "#ffffff", "#00ffff"]) {
      await testing.setParameters({ ...originalUi, accent });
      await checkAutomatic();
      if (accent === "#ffffff") assert.equal(plugin.getState().syntax.resolved.hueRotation, 0);
    }
    await testing.setParameters({ ...originalUi, foreground: "#b4c1cf", mutedContrast: 0.55, accent: "#22a08f" });
    await checkAutomatic();
    for (const mode of syntaxAutoModes) {
      const before = await capture();
      await testing.setSyntaxAuto(mode, false);
      const manual = await capture();
      assert.deepEqual(manual.lines, before.lines, `${mode} must hand off exact native foregrounds without a visible jump.`);
      assert.equal(isSyntaxAutomatic(plugin.getState().syntax.parameters, mode), false);
    }
    const frozen = await capture();
    await testing.setParameters({ ...originalUi, foreground: "#d0b1c1", mutedContrast: 1.5, accent: "#a04499" });
    assert.deepEqual((await capture()).lines, frozen.lines, "Manual syntax must stop following UI anchors.");
    for (const mode of syntaxAutoModes) {
      await testing.resetSyntaxGroup(mode);
      const parameters = plugin.getState().syntax.parameters;
      for (const other of syntaxAutoModes) assert.equal(isSyntaxAutomatic(parameters, other), false, "Manual reset must never re-enable Auto.");
      if (mode === "autoLightness") {
        assert.equal(parameters.lightnessShift, 0);
        assert.equal(parameters.lightnessBase, null);
      } else if (mode === "autoChroma") {
        assert.equal(parameters.chromaBoost, 0);
      } else {
        const fitted = fitSyntaxModel(reference).parameters;
        for (const family of syntaxFamilies) assert.equal(parameters[family], fitted[family]);
        assert.deepEqual(parameters.seedSnapshots, {});
      }
      await capture();
    }
    await testing.resetSyntax();
    await checkAutomatic();
    await testing.setParameters(originalUi);
    assert.deepEqual((await checkAutomatic()).lines, initial.lines, "Overall syntax reset must restore current automatic defaults.");
    console.log("PASS scaled automatic lightness preserves color with white UI text, bounded accent chroma, accent hue/gray fallback, exact native handoffs, frozen manual palette, and manual-only resets.");
    await testing.setSyntaxPaletteMode("anchored");
    assert.equal(plugin.getState().syntax.parameters.blue, plugin.getState().syntax.resolved.colors.blue);
    const primaryColors = ["#a75287", "#2b7d69"];
    let previous = await capture();
    for (const color of primaryColors) {
      await testing.setSyntaxParameters(setSyntaxSeed(plugin.getState().syntax.parameters, "blue", color));
      const current = await capture();
      const state = plugin.getState();
      assert.equal(state.syntax.resolved.colors.blue, color);
      const generated = new Set([
        state.syntax.palette.editorForeground,
        ...state.syntax.palette.tokenColors.flatMap((rule) => rule.settings.foreground ? [rule.settings.foreground] : []),
        ...Object.values(state.syntax.palette.semanticTokenColors).flatMap((style) =>
          typeof style === "string" ? [style] : style.foreground ? [style.foreground] : [])
      ]);
      for (const line of current.lines) {
        for (const run of line.runs) {
          if (line.text.slice(run.start, run.end).trim()) assert.ok(generated.has(run.color), `Unmodeled anchored native color ${run.color}.`);
        }
      }
      assert.equal(compareNativeForegrounds(previous.lines, current.lines, 0).passes, false,
        "Editing Color 1 must recolor actual code, not just the generated swatch.");
      previous = current;
    }
    await testing.setParameters({ ...originalUi, accent: "#ff00ff" });
    assert.deepEqual((await capture()).lines, previous.lines, "Anchored syntax must not follow Interaction accent.");
    await testing.setParameters({ ...originalUi, foreground: "#a8b7c9", mutedContrast: 0.55 });
    const linked = await capture();
    const linkedState = plugin.getState();
    assert.equal(linkedState.syntax.resolved.sourceColors.neutral, linkedState.parameters.foreground);
    assert.equal(linkedState.syntax.resolved.sourceColors.comments, linkedState.palette.colors.descriptionForeground);
    assert.equal(compareNativeForegrounds(previous.lines, linked.lines, 0).passes, false,
      "Neutral and Comments must still follow UI text in the actual editor.");
    assert.equal(linkedState.syntax.resolved.colors.blue, primaryColors.at(-1));
    await testing.setSyntaxPaletteMode("manual");
    assert.deepEqual((await capture()).lines, linked.lines, "Anchored-to-Manual must capture exact native code colors.");
    await testing.setParameters(originalUi);
    await testing.resetSyntax();
    assert.deepEqual((await checkAutomatic()).lines, initial.lines);
    console.log("PASS Anchored Color 1 recolors actual code, stays independent of Interaction accent, links Neutral/Comments to UI text, and hands off exactly to Manual.");
    return {
      passes: true, generatedSha256, automaticModes: syntaxAutoModes, exactHandoffs: true, manualResets: true,
      paletteModes: syntaxPaletteModes,
      anchoredPalette: {
        passes: true, primaryColors, nativeColorChanges: primaryColors.length,
        uiAccentIndependent: true, neutralAndCommentsLinked: true, exactManualHandoff: true
      },
      themeMode, nativeThemeKind: themeMode, lightnessFloor,
      lightnessRolloff: { whiteTarget: 0.85, minimumWhiteWheelChroma, whiteColoredForegroundCount }
    };
  } finally {
    if (plugin.getState().livePreview) await testing.restorePreview();
    await testing.setParameters(originalUi);
    await testing.setSyntaxParameters(originalSyntax);
  }
}

type NativeSample = Awaited<ReturnType<typeof captureSample>>;
type Comparison = ReturnType<typeof compareNativeForegrounds>;
type BracketChecks = Awaited<ReturnType<typeof testNativeBrackets>>;

function reportMarkdown(
  tolerance: number,
  model: ReturnType<typeof fitSyntaxModel>,
  modes: { mode: string; summary: ReturnType<typeof summarizeNativePairs>; samples: (Omit<NativeSample, "lines" | "colors"> & { comparison: Comparison })[] }[],
  negativeControl: Comparison,
  runtime: { version: string; commit: string },
  bracketChecks: BracketChecks
): string {
  const number = (value: number) => value.toFixed(3);
  const rules = evaluateSyntaxRules(model, model.parameters, tolerance);
  const lines = [
    "# Native syntax color evaluation",
    "",
    `Reference: **${reference.theme.name}** (${reference.theme.id}), VS Code **${reference.vscode.version}**, commit \`${reference.vscode.commit}\`.`,
    `Native execution: VS Code **${runtime.version}**, commit \`${runtime.commit}\`. All bundled reference theme files are verified byte-identical by SHA-256; a changed theme source fails even when the application version is unchanged.`,
    "",
    "The source of truth is computed foreground RGB from the actual VS Code editor, not a second implementation of TextMate or a comparison of theme rule names.",
    "",
    "## Method",
    "",
    `- Tolerance: **${tolerance}** in Euclidean OKLab distance x 100, the same metric as the UI experiment. Every non-whitespace character must meet it; there is no percentile escape hatch.`,
    "- The baseline is captured first with no theme customizations. Generated rules are then applied only in the temporary workspace and captured again.",
    "- Generated colors are applied through the plugin's real PreviewSession, including its theme-scoped TextMate and semantic settings, not through a test-only unscoped substitute.",
    "- All 24 complete sample files are checked in grammar-only and semantic-enabled modes. Missing lines, mismatched source text, missing colors, or changing provider coverage fail the test.",
    "- Each seed must recolor actual characters in a corpus sample that uses its native family. Manual controls must produce the exact encoded generated RGB for each shade. Transform algebra is separately unit-tested before RGB quantization, which can hide nonzero fitted lightness inside black.",
    "- Whitespace is excluded from statistics. Source tabs are expanded to four-column stops; reported columns are visual columns. The metric measures CSS foreground colors, not antialiased screen pixels.",
    "- Third-party extensions are disabled. Built-in semantic providers are required for TypeScript, TSX, JavaScript, and HTML. Other samples test their native grammars, not unavailable semantic providers.",
    "- Language-scoped bracket colorization overrides isolate the original syntax foreground tests while the plugin still enables workspace bracket colorization. A separate bracket-enabled native sample verifies all six slots, guides, error colors and setting restoration.",
    "- Inline color swatches, inlay hints, unused/deprecated fading, validation decorations, and sticky scroll are disabled to isolate syntax foregrounds.",
    "- All four installed theme source hashes must match the pinned capture. The actual application version/commit is recorded separately, so a patch release with identical theme files is not mislabeled as the original runtime. Each sample has a SHA-256 hash.",
    "- A negative control changes Color 3 to green; it must fail an exact-match check independently of the requested reconstruction tolerance.",
    "- An additional integration check opens a real diff editor, changes Added/Deleted twice, reads line/word background CSS, and verifies exact restoration. These background checks are separate from the syntax foreground fidelity score.",
    "",
    "## Independent inputs and complexity",
    "",
    "Six numbered color seeds, Color 7 for neutral text, and a dedicated Comments seed come from explicit native scopes, not UI inputs. Color 1 is the originally blue, accent-linked family; the remaining wheel is rotated without regrouping scopes. Error/deletion scopes follow Color 3, additions Color 5, warnings Color 4. Comment scopes are separated from neutral text regardless of native hue.",
    "Fitting chooses discrete lightness/chroma variations and hue offsets bounded to +/-15 degrees; neutrals and comments have no hue offset. Generation never reads the original target RGB. All groups use the same reported vocabulary, with no learned numeric coefficients or per-token numeric corrections.",
    "Manual controls are signed Chroma boost and Lightness shift. Negative chroma scales toward zero; positive chroma uses each shade's own headroom. Lightness shifts each shade toward black or white. Zero preserves the fitted manual baseline; Color 7 follows chroma reductions only, and true grays stay gray.",
    "The palette selector offers Auto, Anchored and Manual. Auto retains the three original automatic behaviors: Lightness follows Primary foreground, Comments uses generated muted text, Chroma uses an accent-derived boost within +/-25%, and Color 1 aligns to accent hue while rotating the wheel. Gray accents keep the original orientation. Anchored uses a single chosen Color 1 for wheel hue, chroma and brightness; Neutral/Comments keep UI text links. Native tests edit this anchor twice, verify independence from Interaction accent and UI text links, and capture exact Anchored-to-Manual colors. Group resets remain manual. Automatic and anchored output is separate from pinned-palette reconstruction.",
    `Auto Lightness rolls off to a maximum of 0.85 at white.${themeMode === "light" ? " Light mode also eases dark anchors toward a minimum of 0.4 at black, keeping code and brackets colorful on white." : " Anchor lightness up to 0.8 is unchanged."} UI endpoints and the full manual shift range are unchanged. Native colors must retain chroma above 0.03 at the protected endpoints, and disabling Auto must capture them exactly.`,
    "",
    "| Input | Default |",
    "| --- | --- |",
    ...syntaxFamilies.map((family) => `| ${syntaxFamilyLabels[family]} | \`${model.parameters[family]}\` |`),
    "",
    `Fitted manual defaults: chroma boost ${model.parameters.chromaBoost}, lightness shift ${model.parameters.lightnessShift}. Both sliders range from -1 to 1, with 0 preserving the fitted palette. The actual extension starts with all three Auto modes on.`,
    "",
    `Vocabulary: ${model.complexity.sharedLightnessLevels} lightness levels, ${model.complexity.sharedChromaLevels} chroma levels, ${model.complexity.sharedHueLevels} hue offsets; ${model.complexity.colorAssignments} distinct role/color assignments and ${model.complexity.scopeAssignments} foreground assignments.`,
    "",
    "## Actual rendered sample results",
    "",
    "| Mode | Files | Characters | Native colors | Mean error | p95 | Maximum | Within tolerance |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...modes.map(({ mode, summary, samples }) =>
      `| ${mode} | ${samples.length} | ${summary.count} | ${summary.referenceColorCount} | ${number(summary.meanError)} | ${number(summary.p95Error)} | ${number(summary.maxError)} | ${number(summary.withinTolerancePercent)}% |`),
    "",
    "## Native bracket palette checks (separate from syntax fidelity)",
    "",
    "A bracket-enabled sample with eight nested pairs and an unexpected closing bracket captures actual native colors before preview. Its defaults are recorded here because they are registered fallbacks, absent from the pinned theme JSON.",
    "Themer deliberately uses Colors 1-6 instead of fitting the native rainbow order. These checks require exact generated output in the real editor, not a claim that the new bracket palette reconstructs the default rainbow.",
    "",
    "| Nesting depth | Native foreground | Themer foreground |",
    "| ---: | --- | --- |",
    ...bracketChecks.native.nestedForegrounds.map((color, index) =>
      `| ${index + 1} | \`${color}\` | \`${bracketChecks.generated.foregrounds[index]}\` |`),
    "",
    `Native unexpected bracket: \`${bracketChecks.native.unexpected}\`; generated vivid Error hue: \`${bracketChecks.generated.error}\`. Native alpha is retained rather than treated as an opaque source.`,
    `Generated guide paint colors: ${bracketChecks.generated.guides.map((color) => `\`${color}\``).join(", ")}.`,
    "",
    "- All six seeds, signed chroma/lightness controls, automatic modes and exact handoffs, muted Error hues, and achromatic red fallback are checked in the actual bracket renderer. Measured bracket chroma must be monotonic and follow each color's own headroom, preserving hue/lightness within 8-bit RGB rounding tolerance.",
    "- Opening/closing pairs match and the six-slot sequence repeats. Inactive guides use 25% opacity; the active guide uses 65%. Their colors follow the same seeds.",
    "- Cancel restores the exact native rainbow and guides, and restores an initially disabled bracket-colorization setting. Guide visibility is not changed by the plugin.",
    "- Unexpected-bracket colors maximize available chroma up to 0.3 while meeting 4.5:1 against the editor background, independently of ordinary syntax adjustments. Mid-gray backgrounds can require a lower-chroma near-black/white color to meet that contrast.",
    "- These 19 generated bracket/guide colors are separate from the UI and syntax fidelity totals. No missing native source values are invented.",
    "",
    "## Per-file results",
    "",
    "| Sample | Mode | Characters | Semantic tokens | Mean error | Maximum | Within tolerance |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...modes.flatMap(({ samples }) => samples.map((sample) =>
      `| [${sample.file}](../samples/${sample.file}) | ${sample.mode} | ${sample.comparison.count} | ${sample.semanticProvider === null ? "off" : sample.semanticProvider.available ? sample.semanticProvider.tokenCount : "no provider"} | ${number(sample.comparison.meanError)} | ${number(sample.comparison.maxError)} | ${number(sample.comparison.withinTolerancePercent)}% |`)),
    "",
    "## Largest observed errors",
    "",
    "| Sample | Mode | Line:column | Native | Generated | Error | Characters with this pair |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
    ...modes.flatMap(({ samples }) => samples.flatMap((sample) =>
      sample.comparison.pairs.map((pair) => ({ ...pair, file: sample.file, mode: sample.mode }))
    )).sort((left, right) => right.deltaE - left.deltaE).slice(0, 12).map((pair) =>
      `| ${pair.file} | ${pair.mode} | ${pair.line}:${pair.column} | \`${pair.reference}\` | \`${pair.generated}\` | ${number(pair.deltaE)} | ${pair.count} |`),
    "",
    "## Rule-level diagnostics, separate from rendered acceptance",
    "",
    `All ${rules.count} foreground assignments, including inherited or overridden rules: mean ${number(rules.meanError)}, max ${number(rules.maxError)}, ${number(rules.withinTolerancePercent)}% within tolerance.`,
    "These figures are not the rendered-code score. Unused and overridden rules cannot be counted as successful sample coverage, and sample success does not prove coverage of every possible token.",
    "",
    `Negative control: ${negativeControl.passes ? "FAILED TO DETECT" : "detected"} the Color 1 edit; maximum error ${number(negativeControl.maxError)}.`,
    "",
    "## Limits and next step",
    "",
    "- The generator is wired to three independent Auto toggles, eight conditional seed pickers, two conditional sliders, reversible theme-scoped live preview, and theme export. Reset buttons appear only when their corresponding Auto mode is off and leave it off. The illustration uses generated representative scopes rather than a second tokenizer.",
    "- This is one pinned dark theme and these sample files, not arbitrary themes, all token kinds, all languages, or an accessibility certification.",
    "- Font styles, selector ordering, and semantic style fields are retained; this color test does not measure typography or backgrounds.",
    "- Very dark/bright or low-chroma edits can clip in sRGB. Review changed palettes visually; representative contrast checks do not cover every generated variant.",
    ""
  ];
  return lines.join("\n");
}

export async function run(): Promise<void> {
  assert.equal(process.env.THEMER_SYNTAX_ISOLATED, "1", "Native syntax capture requires the isolated test launcher.");
  const reportRoot = process.env.THEMER_SYNTAX_REPORT_ROOT;
  assert.ok(reportRoot, "The isolated launcher must provide a report directory.");
  const runtime = await verifySource();
  const source = { vscode: reference.vscode, theme: reference.theme, sources: reference.sources, runtime, themeSourcesVerified: true };
  const extension = vscode.extensions.getExtension<ThemerApi>("themer-local.themer-lab");
  assert.ok(extension, "The development extension must be registered.");
  const plugin = await extension.activate();
  assert.ok(plugin.testing);
  await plugin.testing.setMode(themeMode);
  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspace, "The isolated sample workspace is required.");
  const bracketIsolationKey = editorSamples.map((sample) => `[${sample.language}]`).join("");
  await vscode.workspace.getConfiguration().update(bracketIsolationKey, {
    "editor.bracketPairColorization.enabled": false
  }, vscode.ConfigurationTarget.Workspace);
  const renderer = await NativeRenderer.connect(Number(process.env.THEMER_SYNTAX_DEBUG_PORT));
  if (process.env.THEMER_SYNTAX_BRACKETS_ONLY === "1") {
    try {
      await vscode.workspace.getConfiguration().update(bracketIsolationKey, undefined, vscode.ConfigurationTarget.Workspace);
      await testNativeBrackets(plugin, renderer, workspace);
    } finally {
      renderer.close();
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    }
    return;
  }
  const tolerance = validateTolerance(Number(process.env.THEMER_SYNTAX_TOLERANCE));
  const captureOnly = process.env.THEMER_SYNTAX_CAPTURE_ONLY === "1";
  const model = fitSyntaxModel(reference);
  const generated = generateSyntax(model, model.parameters);
  const baseline: NativeSample[] = [];
  const generatedSamples = new Map<string, NativeSample>();
  const colorWitnesses: Partial<Record<SyntaxFamily, { file: string; changedCharacters: number }>> = {};
  const modes = [];
  let negativeControl: Comparison | undefined;
  try {
    if (!captureOnly) {
      await applySyntax(plugin);
      await vscode.workspace.getConfiguration("editor").update("semanticHighlighting.enabled", false, vscode.ConfigurationTarget.Workspace);
      const original = await captureSample(renderer, workspace, editorSamples[0], false);
      await applySyntax(plugin, { ...model.parameters, red: "#00ff00" });
      const changed = await captureSample(renderer, workspace, editorSamples[0], false);
      negativeControl = compareNativeForegrounds(original.lines, changed.lines, 0);
      assert.equal(negativeControl.passes, false, "The native test must detect an intentionally changed syntax input.");
      console.log(`PASS negative control: changing Color 1 is detected (max ${negativeControl.maxError.toFixed(3)}).`);
    }
    for (const semantic of [false, true]) {
      await applySyntax(plugin);
      await vscode.workspace.getConfiguration("editor").update("semanticHighlighting.enabled", semantic, vscode.ConfigurationTarget.Workspace);
      const originals: NativeSample[] = [];
      for (const sample of editorSamples) {
        const original = await captureSample(renderer, workspace, sample, semantic);
        originals.push(original);
        baseline.push(original);
        console.log(`CAPTURE ${sample.file} (${original.mode}): ${Object.keys(original.colors).length} colors`);
      }
      if (!captureOnly) {
        await applySyntax(plugin, model.parameters);
        const samples = [];
        for (const [index, sample] of editorSamples.entries()) {
          const current = await captureSample(renderer, workspace, sample, semantic);
          if (semantic) generatedSamples.set(sample.file, current);
          const original = originals[index];
          assert.ok(original && original.file === current.file);
          assert.equal(current.sha256, original.sha256, "Sample content must not change between native and generated capture.");
          assert.deepEqual(current.semanticProvider, original.semanticProvider, "Semantic provider coverage must not change.");
          const comparison = compareNativeForegrounds(original.lines, current.lines, tolerance);
          const { lines, colors, ...metadata } = original;
          samples.push({ ...metadata, comparison });
          console.log(`COMPARE ${sample.file} (${original.mode}): max ${comparison.maxError.toFixed(3)}, ${comparison.withinTolerancePercent.toFixed(2)}% within ${tolerance}`);
        }
        modes.push({
          mode: semantic ? "semantic-enabled" : "grammar-only",
          summary: summarizeNativePairs(samples.flatMap((sample) => sample.comparison.pairs), tolerance),
          samples
        });
      }
    }
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(reportRoot, `syntax-native-baseline${reportSuffix}.json`), `${JSON.stringify({
      schemaVersion: 2,
      source,
      method: "Actual computed foreground colors from the isolated native editor; whitespace is excluded from counts.",
      samples: baseline.map(({ lines, ...metadata }) => metadata)
    }, null, 2)}\n`);
    if (captureOnly) {
      console.log("PASS native syntax baseline capture for all 24 samples in both highlighting modes.");
      return;
    }
    assert.ok(negativeControl);
    await vscode.workspace.getConfiguration("editor").update("semanticHighlighting.enabled", true, vscode.ConfigurationTarget.Workspace);
    await applySyntax(plugin, model.parameters);
    const defaultPreview = await captureSample(renderer, workspace, editorSamples[0], true);
    for (const family of syntaxFamilies) {
      await applySyntax(plugin, { ...model.parameters, [family]: "#00ff00" });
      const sources = new Set(syntaxFamilySourceColors(model, family).map((color) => toHex(parseColor(color))));
      const candidates = family === "neutral" || family === "comments" ? [editorSamples[0]] : editorSamples.filter((sample) =>
        baseline.some((capture) => capture.mode === "semantic-enabled" && capture.file === sample.file &&
          Object.keys(capture.colors).some((color) => sources.has(color))));
      let edited: NativeSample | undefined;
      for (const sample of candidates) {
        const original = sample.file === defaultPreview.file ? defaultPreview : generatedSamples.get(sample.file);
        assert.ok(original);
        const current = await captureSample(renderer, workspace, sample, true);
        const comparison = compareNativeForegrounds(original.lines, current.lines, 0);
        if (!comparison.passes) {
          edited = current;
          colorWitnesses[family] = {
            file: sample.file,
            changedCharacters: comparison.pairs.filter((pair) => pair.reference !== pair.generated)
              .reduce((sum, pair) => sum + pair.count, 0)
          };
          break;
        }
      }
      assert.ok(edited, `${family} must visibly recolor at least one native sample that uses its family.`);
      const originalComment = defaultPreview.lines[0];
      const editedComment = edited.lines[0];
      assert.ok(originalComment && editedComment);
      if (family === "neutral") {
        assert.equal(compareNativeForegrounds([originalComment], [editedComment], 0).passes, true,
          "Color 7 must not recolor the native comment line.");
      } else if (family === "comments") {
        assert.equal(compareNativeForegrounds([originalComment], [editedComment], 0).passes, false,
          "The Comments seed must visibly recolor the native comment line.");
        const codeLines = defaultPreview.lines.map((line, index) => ({ line, index }))
          .filter(({ line }) => !line.text.trimStart().startsWith("//"));
        assert.equal(compareNativeForegrounds(
          codeLines.map(({ line }) => line),
          codeLines.map(({ index }) => {
            const line = edited.lines[index];
            assert.ok(line);
            return line;
          }), 0
        ).passes, true,
          "The Comments seed must not recolor code in this sample.");
      }
    }
    const globals: SyntaxParameters[] = [
      { ...model.parameters, chromaBoost: -1 },
      { ...model.parameters, chromaBoost: -0.5 },
      { ...model.parameters, chromaBoost: 0.5 },
      { ...model.parameters, chromaBoost: 1 },
      { ...model.parameters, lightnessShift: -0.3 },
      { ...model.parameters, lightnessShift: 0.3 }
    ];
    const resolvedBase = resolveSyntaxParameters(model, model.parameters);
    const colorFits = [
      model.editorForeground,
      ...model.tokenColors.flatMap(({ fit }) => fit ? [fit] : []),
      ...model.semanticTokenColors.flatMap(({ fit }) => fit ? [fit] : [])
    ];
    let previous = defaultPreview;
    for (const parameters of globals) {
      await applySyntax(plugin, parameters);
      const edited = await captureSample(renderer, workspace, editorSamples[0], true);
      assert.equal(compareNativeForegrounds(previous.lines, edited.lines, 0).passes, false,
        "Each global control must visibly change the actual editor.");
      const resolved = resolveSyntaxParameters(model, parameters);
      const expectedColors = new Map<string, Set<string>>();
      for (const fit of colorFits) {
        const source = renderResolvedSyntaxColor(resolvedBase, fit.family, fit.transform);
        const colors = expectedColors.get(source) ?? new Set<string>();
        colors.add(renderResolvedSyntaxColor(resolved, fit.family, fit.transform));
        expectedColors.set(source, colors);
      }
      const comparison = compareNativeForegrounds(defaultPreview.lines, edited.lines, 0);
      for (const pair of comparison.pairs) {
        // Several fitted shades can share one rounded RGB, especially black.
        assert.ok(expectedColors.get(pair.reference)?.has(pair.generated),
          `${pair.reference} -> ${pair.generated}: native manual controls must use the exact generated RGB for that fitted shade.`);
      }
      if (parameters.lightnessShift === 0) {
        assert.ok(comparison.pairs.every((pair) =>
          Math.abs(toOklch(pair.reference).l - toOklch(pair.generated).l) < 0.003
        ), "Chroma boost must preserve actual rendered lightness.");
        for (const pair of comparison.pairs) {
          const base = toOklch(pair.reference);
          const color = toOklch(pair.generated);
          if (parameters.chromaBoost < 0) {
            assert.ok(Math.abs(color.c - base.c * (1 + parameters.chromaBoost)) < 0.003,
              "Negative boost must reduce actual chroma proportionally.");
          } else {
            assert.ok(color.c >= base.c - 0.003, "Positive boost must not desaturate actual code colors.");
          }
          if (parameters.chromaBoost === -1) assert.ok(color.c < 1e-6, "The native lower endpoint must be grayscale.");
          if (color.c > 0.02 && base.c > 0.02) {
            const distance = Math.abs((((color.h ?? 0) - (base.h ?? 0) + 540) % 360) - 180);
            assert.ok(distance < 2, "Native chroma boost must preserve hue.");
          }
        }
        if (parameters.chromaBoost > 0) {
          assert.ok(comparison.pairs.some((pair) => toOklch(pair.generated).c > toOklch(pair.reference).c + 0.03),
            "Positive boost must visibly increase actual code chroma.");
        }
        if (previous.mode === edited.mode && previous !== defaultPreview) {
          const previousComparison = compareNativeForegrounds(previous.lines, edited.lines, 0);
          assert.ok(previousComparison.pairs.every((pair) => toOklch(pair.generated).c >= toOklch(pair.reference).c - 0.003),
            "Actual code chroma must rise monotonically across the boost sweep.");
        }
      }
      previous = edited;
    }
    const neutralParameters = { ...model.parameters, neutral: "#996680" };
    await applySyntax(plugin, neutralParameters);
    const tintedNeutral = await captureSample(renderer, workspace, editorSamples[0], true);
    const neutralForeground = generateSyntax(model, neutralParameters).editorForeground;
    for (const chromaBoost of [1, -0.5, -1]) {
      await applySyntax(plugin, { ...neutralParameters, chromaBoost });
      const edited = await captureSample(renderer, workspace, editorSamples[0], true);
      const pairs = compareNativeForegrounds(tintedNeutral.lines, edited.lines, 0).pairs
        .filter((pair) => pair.reference === neutralForeground);
      assert.ok(pairs.length > 0, "The native neutral boost test must cover actual code foreground characters.");
      for (const pair of pairs) {
        if (chromaBoost > 0) {
          assert.equal(pair.generated, pair.reference, "Positive boost must not fade or boost native neutral text.");
        } else {
          assert.ok(Math.abs(toOklch(pair.generated).c - toOklch(pair.reference).c * (1 + chromaBoost)) < 0.003,
            "The native neutral tint must follow negative chroma boost.");
          assert.ok(toOklch(pair.generated).c < toOklch(pair.reference).c);
          assert.ok(Math.abs(toOklch(pair.generated).l - toOklch(pair.reference).l) < 0.003);
        }
      }
      await applySyntax(plugin, {
        ...model.parameters, ...Object.fromEntries(syntaxFamilies.map((family) => [family, "#808080"])), chromaBoost: 1
      });
      const grayPreview = await captureSample(renderer, workspace, editorSamples[0], true);
      assert.ok(grayPreview.lines.every((line) => line.runs.every((run) => toOklch(run.color).c < 1e-6)),
        "Positive boost must not invent hues for actual gray syntax.");
    }
    await applySyntax(plugin);
    const restored = await captureSample(renderer, workspace, editorSamples[0], true);
    const native = baseline.find((sample) => sample.file === restored.file && sample.mode === restored.mode);
    assert.ok(native);
    assert.equal(compareNativeForegrounds(native.lines, restored.lines, 0).passes, true,
      "Cancel must restore the exact native syntax foregrounds.");
    console.log("PASS eight manual seeds and two global controls affect native code; chroma is monotonic, lightness shifts preserve hierarchy, grays stay gray, neutral never gains chroma, and Cancel restores exact colors.");
    const automaticChecks = await testNativeAutomaticSyntax(plugin, renderer, workspace);
    await vscode.workspace.getConfiguration().update(bracketIsolationKey, undefined, vscode.ConfigurationTarget.Workspace);
    const bracketChecks = await testNativeBrackets(plugin, renderer, workspace);
    await testNativeChangeColors(plugin, renderer, workspace);
    const passes = modes.length === 2 && modes.every((mode) =>
      mode.samples.length === editorSamples.length && mode.summary.passes
    );
    const report = {
      schemaVersion: 8,
      source,
      method: {
        sourceOfTruth: "Actual computed opaque foreground RGB in the native VS Code editor, captured before any generated customization.",
        metric: "Euclidean OKLab distance x 100, per non-whitespace character; not antialiased pixel color.",
        acceptance: "Every scored character in every sample and both modes must have deltaE <= tolerance.",
        thirdPartyExtensions: "disabled",
        generatedApplication: "The plugin's real PreviewSession, using theme-scoped workspace UI, TextMate, and semantic customizations.",
        columns: "1-based visual columns with four-column tab stops"
      },
      tolerance,
      model: {
        parameters: model.parameters,
        complexity: model.complexity,
        vocabulary: syntaxVocabularyFor(themeMode),
        generatedSha256: hash(JSON.stringify(generated)),
        assignments: model
      },
      sourceRuleFidelity: evaluateSyntaxRules(model, model.parameters, tolerance),
      bracketChecks,
      automaticChecks,
      modes,
      negativeControl: { input: "red", color: "#00ff00", comparison: negativeControl, detected: !negativeControl.passes },
      interactionChecks: {
        colorInputs: syntaxFamilies,
        colorWitnesses,
        globalInputs: Object.keys(syntaxNumericParameterLimits),
        commentNeutralIsolation: true,
        neutralChromaReductionOnly: true,
        independentAdjustments: true,
        chromaBoost: true,
        perColorGamut: true,
        automaticModes: syntaxAutoModes,
        paletteModes: syntaxPaletteModes,
        anchoredPalette: true,
        automaticHandoffs: true,
        manualResets: true,
        exactRestore: true,
        nativeDiffColors: true
      },
      passes
    };
    await writeFile(path.join(reportRoot, `syntax-evaluation${reportSuffix}.json`), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(reportRoot, `syntax-evaluation${reportSuffix}.md`), reportMarkdown(tolerance, model, modes, negativeControl, runtime, bracketChecks));
    assert.ok(passes, `Generated syntax exceeds native tolerance ${tolerance}. See reports/syntax-evaluation${reportSuffix}.md for actual sample errors.`);
    console.log(`PASS generated syntax matches all 24 native samples in both modes within ${tolerance}; the negative control is detected.`);
  } finally {
    if (plugin.getState().livePreview) await applySyntax(plugin);
    renderer.close();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
}
