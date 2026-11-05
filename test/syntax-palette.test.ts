import assert from "node:assert/strict";
import { test } from "node:test";
import { toOklch } from "../src/color";
import { createThemeDocument } from "../src/extension/export";
import { generatePalette, getDefaultParameters } from "../src/model";
import { references } from "../src/shared/reference";
import { syntaxAdjustmentModes, syntaxFamilies, syntaxPaletteModes, syntaxWheelFamilies, themeModes } from "../src/shared/types";
import { parseSyntaxParameters } from "../src/shared/validation";
import {
  fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxAnchors, resetSyntaxGroup,
  resolveSyntaxParameters, setSyntaxAdjustmentMode, setSyntaxPaletteMode, setSyntaxSeed, syntaxFamilyLabels
} from "../src/syntax";
import { generateTheme } from "../src/theme";

const models = { dark: fitSyntaxModel(references.dark), light: fitSyntaxModel(references.light) };
const hueDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);

test("Color 1 starts the rotated wheel and every family retains its native identity", () => {
  assert.deepEqual(syntaxWheelFamilies, ["blue", "violet", "red", "amber", "green", "teal"]);
  syntaxWheelFamilies.forEach((family, index) => assert.equal(syntaxFamilyLabels[family], `Color ${index + 1}`));
  assert.equal(syntaxFamilyLabels.neutral, "Color 7 - Neutral");
  assert.deepEqual(syntaxPaletteModes, ["auto", "anchored", "manual"]);
});

for (const mode of themeModes) {
  const reference = references[mode];
  const model = models[mode];
  const ui = getDefaultParameters(reference);
  const anchors = getSyntaxAnchors(ui, generatePalette(reference, ui));
  const defaults = getDefaultSyntaxParameters(reference);
  const anchored = setSyntaxPaletteMode(model, defaults, anchors, "anchored");
  const render = (parameters = anchored, context = anchors) => ({
    resolved: resolveSyntaxParameters(model, parameters, context).colors,
    syntax: generateSyntax(model, parameters, context)
  });

  test(`${mode}: Anchored starts at the visible Color 1 and honors the full picked color`, () => {
    assert.equal(anchored.blue, render(defaults).resolved.blue);
    assert.equal(anchored.paletteMode, "anchored");
    assert.equal(anchored.lightnessShift, 0);
    assert.equal(anchored.chromaBoost, 0);
    assert.equal(anchored.lightnessBase, null);
    for (const color of ["#17a291", "#aa3377", "#294876", "#b9cbe2", "#808080", "#000000", "#ffffff"]) {
      const parameters = setSyntaxSeed(anchored, "blue", color);
      assert.equal(render(parameters).resolved.blue, color, "Auto adjustments must not override the chosen anchor.");
      const roundTrip = parseSyntaxParameters(JSON.parse(JSON.stringify(parameters)));
      assert.deepEqual(roundTrip, parameters);
      assert.deepEqual(render(roundTrip), render(parameters));
    }
  });

  test(`${mode}: the anchor controls wheel hue, chroma and relative seed lightness`, () => {
    const base = toOklch(model.parameters.blue);
    const low = setSyntaxSeed(anchored, "blue", "#26534d");
    const high = setSyntaxSeed(anchored, "blue", "#91dbce");
    const original = render(anchored);
    for (const parameters of [low, high]) {
      const resolved = resolveSyntaxParameters(model, parameters, anchors);
      const primary = toOklch(parameters.blue);
      for (const family of syntaxWheelFamilies) {
        const native = toOklch(model.parameters[family]);
        assert.ok(hueDistance(resolved.seeds[family].h, (native.h! + resolved.hueRotation + 360) % 360) < 1e-9);
        assert.ok(Math.abs(resolved.seeds[family].c - native.c * primary.c / base.c) < 1e-9);
        assert.notEqual(resolved.colors[family], original.resolved[family], `${family} follows the anchor.`);
        assert.ok(Math.abs(toOklch(resolved.colors[family]).l - primary.l) < 0.003);
      }
      assert.notDeepEqual(generateSyntax(model, parameters, anchors), original.syntax);
    }
    for (const lightnessMode of ["manual", "off"] as const) {
      const darker = resolveSyntaxParameters(model, { ...low, lightnessMode }, anchors);
      const brighter = resolveSyntaxParameters(model, { ...high, lightnessMode }, anchors);
      for (const family of syntaxWheelFamilies) {
        assert.ok(darker.seeds[family].l < brighter.seeds[family].l);
      }
    }
  });

  test(`${mode}: Anchored separates the wheel from UI accent while keeping Neutral and Comments linked`, () => {
    const before = render();
    const accent = getSyntaxAnchors({ ...ui, accent: "#ff00ff" }, generatePalette(reference, { ...ui, accent: "#ff00ff" }));
    assert.deepEqual(render(anchored, accent), before);
    const parameters = { ...ui, foreground: "#937fba", mutedContrast: 0.6 };
    const changed = getSyntaxAnchors(parameters, generatePalette(reference, parameters));
    const after = render(anchored, changed);
    for (const family of syntaxWheelFamilies) assert.equal(after.resolved[family], before.resolved[family]);
    assert.notEqual(after.resolved.neutral, before.resolved.neutral);
    assert.notEqual(after.resolved.comments, before.resolved.comments);
    for (const palette of [anchored, setSyntaxSeed(anchored, "blue", "#9051ac")]) {
      const resolved = resolveSyntaxParameters(model, palette, changed);
      assert.equal(resolved.sourceColors.neutral, changed.foreground.toLowerCase());
      assert.equal(resolved.sourceColors.comments, changed.muted.toLowerCase());
    }
    assert.throws(() => resolveSyntaxParameters(model, { ...anchored, chromaMode: "off", lightnessMode: "off" }), /require UI/);
  });

  test(`${mode}: each Anchored adjustment combination captures exactly into Manual`, () => {
    for (const chromaMode of syntaxAdjustmentModes) {
      for (const lightnessMode of syntaxAdjustmentModes) {
        let parameters = setSyntaxSeed(anchored, "blue", "#a75287");
        parameters = setSyntaxAdjustmentMode(model, parameters, anchors, "chromaMode", chromaMode);
        parameters = setSyntaxAdjustmentMode(model, parameters, anchors, "lightnessMode", lightnessMode);
        parameters = {
          ...parameters,
          chromaBoost: chromaMode === "manual" ? 0.27 : 0,
          lightnessShift: lightnessMode === "manual" ? -0.13 : 0
        };
        const before = generateTheme(reference, ui, parameters, model);
        const manual = setSyntaxPaletteMode(model, parameters, anchors, "manual");
        const after = generateTheme(reference, ui, manual, model);
        assert.equal(manual.paletteMode, "manual");
        assert.deepEqual(after.syntax.resolved.colors, before.syntax.resolved.colors, `${chromaMode}/${lightnessMode}`);
        assert.deepEqual(after.syntax.palette, before.syntax.palette, `${chromaMode}/${lightnessMode}`);
        assert.deepEqual(after.syntax.brackets, before.syntax.brackets, `${chromaMode}/${lightnessMode}`);
        assert.deepEqual(after.palette, before.palette, `${chromaMode}/${lightnessMode}`);
        assert.deepEqual(setSyntaxPaletteMode(model, manual, anchors, "manual"), manual);
        const roundTrip = parseSyntaxParameters(JSON.parse(JSON.stringify(manual)));
        assert.deepEqual(render(roundTrip), render(manual));
      }
    }
  });

  test(`${mode}: editing the anchor still changes brightness after capturing Auto lightness`, () => {
    const manualLightness = setSyntaxAdjustmentMode(model, anchored, anchors, "lightnessMode", "manual");
    const dark = setSyntaxSeed(manualLightness, "blue", "#25443d");
    const light = setSyntaxSeed(manualLightness, "blue", "#91dbce");
    assert.equal(render(dark).resolved.blue, "#25443d");
    assert.equal(render(light).resolved.blue, "#91dbce");
    assert.deepEqual(dark.lightnessBase?.neutral, manualLightness.lightnessBase?.neutral);
    assert.deepEqual(dark.lightnessBase?.comments, manualLightness.lightnessBase?.comments);
    assert.throws(() => setSyntaxSeed(anchored, "red", "#ffffff"), /Only Color 1/);
    assert.throws(() => setSyntaxSeed(anchored, "comments", "#ffffff"), /Only Color 1/);
    assert.throws(() => setSyntaxSeed(anchored, "blue", "not a color"), /blue/);
  });

  test(`${mode}: resets, mode round trips, brackets and export use the same rotated palette`, () => {
    const parameters = setSyntaxSeed(anchored, "blue", "#a75287");
    const generated = generateTheme(reference, ui, parameters, model);
    syntaxWheelFamilies.forEach((family, index) => {
      assert.equal(generated.syntax.brackets.colors[`editorBracketHighlight.foreground${index + 1}`], generated.syntax.resolved.colors[family]);
    });
    const document = createThemeDocument(reference, generated.palette, "Anchored Test", generated.syntax.palette, generated.syntax.brackets);
    assert.deepEqual(document.tokenColors, generated.syntax.palette.tokenColors);
    assert.deepEqual(document.semanticTokenColors, generated.syntax.palette.semanticTokenColors);
    for (const [id, value] of Object.entries(generated.syntax.brackets.colors)) assert.equal(document.colors[id], value);
    assert.throws(() => resetSyntaxGroup(model, parameters, "autoHue"), /Manual/);
    const manual = setSyntaxPaletteMode(model, parameters, anchors, "manual");
    const reset = resetSyntaxGroup(model, manual, "autoHue");
    assert.equal(reset.paletteMode, "manual");
    for (const family of syntaxFamilies) assert.equal(reset[family], model.parameters[family]);
    assert.equal(reset.lightnessMode, manual.lightnessMode);
    assert.equal(reset.chromaMode, manual.chromaMode);
    assert.deepEqual(reset.lightnessBase, manual.lightnessBase);
    assert.deepEqual(reset.seedSnapshots, {});
    const auto = setSyntaxPaletteMode(model, parameters, anchors, "auto");
    assert.deepEqual(render(auto), render(defaults));
  });
}

test("palette parsing migrates Simple syntax and validates Anchored state and lightness captures", () => {
  const defaults = getDefaultSyntaxParameters(references.dark);
  const { paletteMode, ...legacy } = defaults;
  assert.equal(paletteMode, "auto");
  assert.deepEqual(parseSyntaxParameters({ ...legacy, autoHue: true }), defaults);
  assert.deepEqual(parseSyntaxParameters({ ...legacy, autoHue: false }), { ...defaults, paletteMode: "manual" });
  assert.throws(() => parseSyntaxParameters({ ...defaults, autoHue: true }), /legacy autoHue/);
  for (const paletteMode of [undefined, null, "", "Anchored", true, 1, [], {}]) {
    assert.throws(() => parseSyntaxParameters({ ...defaults, paletteMode }), /paletteMode/);
  }
  for (const paletteMode of ["auto", "anchored"] as const) {
    assert.throws(() => parseSyntaxParameters({
      ...defaults, paletteMode, seedSnapshots: { blue: { l: 0.7, c: 0.1, h: 240 } }
    }), /seedSnapshots/);
  }
  for (const neutral of [undefined, null, -0.1, 1.1, NaN, "0.5"]) {
    assert.throws(() => parseSyntaxParameters({
      ...defaults, lightnessMode: "manual", lightnessBase: { text: 0.7, comments: 0.5, neutral }
    }), /neutral/);
  }
});
