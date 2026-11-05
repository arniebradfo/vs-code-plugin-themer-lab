import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { clamp, contrastRatio, deltaE, toOklch } from "../src/color";
import { createThemeDocument } from "../src/extension/export";
import { evaluatePalette, fitModel, generatePalette, getDefaultParameters, modelDefinitions } from "../src/model";
import { lightReference, reference, references } from "../src/shared/reference";
import { syntaxAutoModes, syntaxFamilies, syntaxWheelFamilies, themeModes } from "../src/shared/types";
import { parseParameters, parseThemeMode } from "../src/shared/validation";
import {
  fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxAnchors, isSyntaxAutomatic, resetSyntaxGroup,
  resolveSyntaxParameters, scaleSyntaxAutoLightness, setSyntaxAuto, shiftSyntaxLightness
} from "../src/syntax";
import { generateBracketPalette } from "../src/syntax/brackets";
import { personalityDefaults } from "../src/shared/types";
import { supplementalColors } from "../src/model/rules";
import { personalityFixedRuleCount } from "../src/model/personality";
import { createReport, parseEvaluationArguments } from "../tools/evaluate";

const parameters = getDefaultParameters(lightReference);
const model = fitSyntaxModel(lightReference);
const defaults = getDefaultSyntaxParameters(lightReference);
const anchorsFor = (ui = parameters) => getSyntaxAnchors(ui, generatePalette(lightReference, ui));

test("Light uses its own captured native anchors and honest mode-specific model definition", () => {
  assert.equal(lightReference.theme.id, "Light 2026");
  assert.equal(lightReference.theme.type, "light");
  assert.equal(lightReference.vscode.version, "1.143.1");
  assert.equal(lightReference.sources.length, 4);
  assert.equal(Object.keys(lightReference.colors).length, 340);
  assert.equal(lightReference.tokenColors.length, 113);
  assert.deepEqual(parameters, {
    mode: "light", background: "#ffffff", foreground: "#202020", accent: "#0069cc",
    info: "#0069cc", warning: "#b69500", error: "#ad0707",
    added: "#587c0c", deleted: "#ad0707", modified: "#667309", infoSource: "accent",
    surfaceSpread: 1, mutedContrast: 1, borderStrength: 1, overlayOpacity: 1, ...personalityDefaults
  });
  const fit = fitModel(lightReference);
  assert.equal(fit.controlCount, 19);
  assert.equal(fit.controlCount, Object.keys(parameters).length);
  assert.equal(fit.fixedRuleCount, Object.keys(modelDefinitions.light.families).length +
    Object.keys(modelDefinitions.light.opacities).length + 2 + personalityFixedRuleCount);
  assert.equal(modelDefinitions.light.learnedCoefficientCount, 0);
  assert.equal(modelDefinitions.light.perTokenResidualCount, 0);
  assert.ok(fit.evaluation.withinTolerancePercent >= 85, "At least 85% of generated Light UI colors must fit tolerance 3.");
  assert.equal(evaluatePalette(lightReference, fit.palette).meanError, fit.evaluation.meanError);
});

test("Light changes surfaces, muted text, hover direction and validation transforms rather than reusing Dark constants", () => {
  const palette = generatePalette(lightReference, parameters);
  for (const id of ["editor.background", "foreground", "button.background", "button.hoverBackground",
    "button.secondaryBackground", "sideBar.background", "editorWidget.background", "descriptionForeground",
    "textLink.foreground", "focusBorder", "panel.border", "inputValidation.infoBackground",
    "inputValidation.warningBackground", "inputValidation.errorBackground"]) {
    const source = lightReference.colors[id]?.value;
    const output = palette.colors[id];
    assert.ok(source && output, id);
    assert.ok(deltaE(source, output) <= 3, `${id}: ${source} -> ${output}`);
  }
  assert.ok(toOklch(palette.colors["button.hoverBackground"]!).l < toOklch(parameters.accent).l);
  assert.ok(toOklch(palette.colors["sideBar.background"]!).l < 1);
  assert.equal(palette.colors["button.foreground"], "#ffffff");
  assert.ok(contrastRatio(palette.colors["button.foreground"]!, palette.colors["button.background"]!) >= 4.5);
  assert.notEqual(palette.colors["editorInfo.foreground"], parameters.accent);
  assert.equal(palette.colors.errorForeground, parameters.error);
  assert.equal(palette.coverage.total, 340);
  assert.equal(palette.coverage.unresolved, 0);
  assert.equal(palette.coverage.unscoredGenerated,
    Object.keys(supplementalColors).filter((id) => !Object.hasOwn(lightReference.colors, id)).length);
});

test("Light mode and reference selection are explicit and reject cross-mode recipes", () => {
  for (const mode of themeModes) {
    const ui = getDefaultParameters(references[mode]);
    assert.equal(parseThemeMode(mode), mode);
    assert.deepEqual(parseParameters(ui), ui);
    assert.equal(createReport(3, mode).model.parameters.mode, mode);
  }
  for (const mode of [undefined, null, "", "Light", "hc-light", 1, {}, "__proto__"]) {
    assert.throws(() => parseThemeMode(mode), /Theme mode/);
    assert.throws(() => parseParameters({ ...parameters, mode }), /Theme mode/);
  }
  assert.throws(() => generatePalette(reference, parameters), /reference mode/);
  assert.throws(() => generatePalette(lightReference, getDefaultParameters(reference)), /reference mode/);
  assert.deepEqual(parseEvaluationArguments(["--mode=light", "--tolerance", "2"]), { mode: "light", tolerance: 2 });
  assert.deepEqual(parseEvaluationArguments(["--mode", "dark"]), { mode: "dark", tolerance: 3 });
  for (const args of [["--mode"], ["--mode="], ["--mode=hc-light"], ["--mode=light", "--mode=dark"]]) {
    assert.throws(() => parseEvaluationArguments(args));
  }
});

test("Light reuses independent Info, structural controls, and signed surface semantics", () => {
  const baseline = generatePalette(lightReference, { ...parameters, background: "#d0d0d0" });
  const flat = generatePalette(lightReference, { ...parameters, background: "#d0d0d0", surfaceSpread: 0 });
  const inverted = generatePalette(lightReference, { ...parameters, background: "#d0d0d0", surfaceSpread: -1 });
  const sideBar = "sideBar.background";
  assert.ok(toOklch(baseline.colors[sideBar]!).l < toOklch("#d0d0d0").l);
  assert.equal(flat.colors[sideBar], "#d0d0d0");
  assert.ok(toOklch(inverted.colors[sideBar]!).l > toOklch("#d0d0d0").l);
  for (const id of ["editor.background", "foreground", "panel.border", "button.background", "editorInfo.foreground"]) {
    assert.equal(inverted.colors[id], baseline.colors[id], id);
  }
  const custom = generatePalette(lightReference, { ...parameters, infoSource: "custom", info: "#8855ee" });
  assert.equal(custom.colors["editorInfo.foreground"], "#8855ee");
  const foreground = generatePalette(lightReference, { ...parameters, infoSource: "foreground", foreground: "#405060" });
  assert.notEqual(foreground.colors["editorInfo.foreground"], "#405060");
  assert.equal(foreground.colors["button.background"], parameters.accent);
  const changes = generatePalette(lightReference, { ...parameters, added: "#8855ee", deleted: "#00aeff" });
  assert.equal(lightReference.colors["diffEditor.insertedLineBackground"], undefined);
  assert.equal(lightReference.colors["diffEditor.removedLineBackground"], undefined);
  for (const [id, expected] of [
    ["diffEditor.insertedLineBackground", "#8855ee26"],
    ["diffEditor.removedLineBackground", "#00aeff26"],
    ["diffEditor.insertedTextBackground", "#8855ee26"],
    ["diffEditor.removedTextBackground", "#00aeff26"]
  ] as const) {
    assert.equal(changes.colors[id], expected, id);
    assert.equal(createThemeDocument(lightReference, changes, "Light Diffs").colors[id], expected, id);
  }
});

test("Light interaction fills retain their normal strength across signed surface separation", () => {
  const interactions = [
    "menubar.selectionBackground", "menu.selectionBackground", "list.inactiveSelectionBackground",
    "toolbar.activeBackground", "modernActivityBarItem.activeBackground",
    "modernActivityBarItem.hoverBackground", "modernTab.activeBackground",
    "modernEditorTab.selectedActionBackground"
  ];
  for (const background of ["#ffffff", "#d0d0d0", "#e4e8ef"]) {
    const ui = { ...parameters, background };
    const baseline = generatePalette(lightReference, ui);
    for (const surfaceSpread of [-3, -1, 0, 1, 2, 3]) {
      const palette = generatePalette(lightReference, { ...ui, surfaceSpread });
      for (const id of interactions) {
        assert.ok(baseline.colors[id], id);
        assert.equal(palette.colors[id], baseline.colors[id], `${background}/${surfaceSpread}/${id}`);
      }
      assert.equal(palette.colors["editor.background"], background);
      assert.equal(palette.colors.foreground, baseline.colors.foreground);
      assert.equal(palette.colors["button.background"], baseline.colors["button.background"]);
      if (surfaceSpread !== 1) {
        assert.notEqual(palette.colors["sideBar.background"], baseline.colors["sideBar.background"]);
      }
    }
    assert.ok(deltaE(baseline.colors["menubar.selectionBackground"]!, background) >= 4);
    assert.ok(deltaE(baseline.colors["toolbar.activeBackground"]!, background) >= 7);
  }
});

test("Light has six chromatic native seed families and enough shared lightness range for its inherited styles", () => {
  assert.equal(model.mode, "light");
  assert.deepEqual({
    red: defaults.red, amber: defaults.amber, green: defaults.green, teal: defaults.teal,
    blue: defaults.blue, violet: defaults.violet, neutral: defaults.neutral, comments: defaults.comments
  }, {
    red: "#cf222e", amber: "#795e26", green: "#116329", teal: "#267f99",
    blue: "#0550ae", violet: "#af00db", neutral: "#1f2328", comments: "#6e7781"
  });
  for (const family of syntaxWheelFamilies) assert.ok(toOklch(defaults[family]).c > 0.07, family);
  assert.equal(model.complexity.sharedLightnessLevels, 65);
  assert.equal(model.complexity.maximumHueShift, 15);
  const generated = generateSyntax(model, model.parameters);
  assert.ok(deltaE(generated.editorForeground, lightReference.colors["editor.foreground"]!.value!) <= 3);
  assert.equal(generated.semanticHighlighting, lightReference.semanticHighlighting);
  assert.equal(Object.keys(generated.semanticTokenColors).length, 4);
});

test("Light automatic lightness protects black anchors, stays monotonic and keeps the full manual endpoints", () => {
  let previous = 0;
  for (let step = 0; step <= 100; step++) {
    const scaled = scaleSyntaxAutoLightness(step / 100, "light");
    assert.ok(scaled >= previous && scaled >= 0.4 && scaled <= 0.85);
    previous = scaled;
  }
  assert.equal(scaleSyntaxAutoLightness(0, "light"), 0.4);
  assert.equal(scaleSyntaxAutoLightness(0.5, "light"), 0.5);
  assert.equal(scaleSyntaxAutoLightness(1, "light"), 0.85);
  const ui = { ...parameters, foreground: "#000000" };
  const anchors = anchorsFor(ui);
  const resolved = resolveSyntaxParameters(model, defaults, anchors);
  assert.equal(resolved.lightnessBase?.text, 0.4);
  for (const family of syntaxWheelFamilies) {
    assert.ok(toOklch(resolved.colors[family]).c > 0.03, family);
    assert.ok(contrastRatio(resolved.colors[family], ui.background) >= 4.5, family);
  }
  const brackets = generateBracketPalette(resolved, ui.error, ui.background);
  for (let index = 1; index <= 6; index++) assert.notEqual(brackets.colors[`editorBracketHighlight.foreground${index}`], "#000000");
  for (const lightnessShift of [-1, 1]) {
    const manual = resolveSyntaxParameters(model, { ...model.parameters, lightnessShift });
    for (const family of syntaxFamilies) assert.equal(manual.colors[family], lightnessShift === -1 ? "#000000" : "#ffffff");
  }
});

test("every Light automatic-mode combination hands off exactly and resets to Light fitted seeds", () => {
  const anchors = anchorsFor({ ...parameters, foreground: "#000000", accent: "#27934d", mutedContrast: 0.75 });
  for (let mask = 0; mask < 8; mask++) {
    let inputs = structuredClone(defaults);
    for (const [index, mode] of syntaxAutoModes.entries()) {
      if (mask & (1 << index)) continue;
      const before = generateSyntax(model, inputs, anchors);
      inputs = setSyntaxAuto(model, inputs, anchors, mode, false);
      assert.deepEqual(generateSyntax(model, JSON.parse(JSON.stringify(inputs)), anchors), before, `${mask}/${mode}`);
    }
    for (const mode of syntaxAutoModes) {
      if (isSyntaxAutomatic(inputs, mode)) continue;
      const reset = resetSyntaxGroup(model, inputs, mode);
      assert.equal(isSyntaxAutomatic(reset, mode), false);
      if (mode === "autoHue") for (const family of syntaxFamilies) assert.equal(reset[family], defaults[family]);
    }
  }
});

test("manual brightening uses the fitted Light shade before black RGB quantization", () => {
  const baseline = generateSyntax(model, model.parameters);
  const shifted = generateSyntax(model, { ...model.parameters, lightnessShift: 0.3 });
  const index = model.tokenColors.findIndex((entry, index) =>
    entry.fit && baseline.tokenColors[index]?.settings.foreground === "#000000");
  assert.ok(index >= 0);
  const fit = model.tokenColors[index]?.fit;
  const output = shifted.tokenColors[index]?.settings.foreground;
  assert.ok(fit && output);
  const starting = clamp(toOklch(model.parameters[fit.family]).l + fit.transform.lightness);
  assert.ok(starting > 0 && starting < 0.06, "A fitted shade can round to black without having zero lightness.");
  const expected = shiftSyntaxLightness(starting, 0.3);
  assert.ok(Math.abs(toOklch(output).l - expected) < 0.003);
});

test("Light export and the contributed native base theme have genuine light metadata", async () => {
  const palette = generatePalette(lightReference, parameters);
  const anchors = anchorsFor();
  const syntax = generateSyntax(model, defaults, anchors);
  const brackets = generateBracketPalette(resolveSyntaxParameters(model, defaults, anchors), parameters.error, parameters.background);
  const document = createThemeDocument(lightReference, palette, "Light Export", syntax, brackets);
  assert.equal(document.type, "light");
  assert.equal(document.colors["editor.background"], "#ffffff");
  assert.equal(document.colors["editor.foreground"], syntax.editorForeground);
  assert.deepEqual(document.tokenColors, syntax.tokenColors);
  assert.deepEqual(document.semanticTokenColors, syntax.semanticTokenColors);
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const contribution = manifest.contributes.themes.find((entry: { uiTheme: string }) => entry.uiTheme === "vs");
  assert.equal(contribution.id, "Themer Lab Light");
  const base = JSON.parse(await readFile(path.join(root, "themes", "themer-light-color-theme.json"), "utf8"));
  assert.equal(base.type, "light");
  assert.equal(base.name, contribution.id);
  assert.equal(base.colors["editor.background"], lightReference.colors["editor.background"]?.value);
});
