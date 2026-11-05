import assert from "node:assert/strict";
import { test } from "node:test";
import { toOklch } from "../src/color";
import { generatePalette, getDefaultParameters } from "../src/model";
import { reference, references } from "../src/shared/reference";
import { SyntaxParameters, syntaxAdjustmentParameters, syntaxAutoModes, syntaxFamilies, syntaxWheelFamilies } from "../src/shared/types";
import { parseSyntaxParameters } from "../src/shared/validation";
import {
  fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxAnchors,
  isSyntaxAutomatic, resetSyntaxGroup, resolveSyntaxParameters, scaleSyntaxAutoLightness,
  setSyntaxAdjustmentMode, setSyntaxAuto, setSyntaxSeed
} from "../src/syntax";
import { generateBracketPalette, unexpectedBracketId } from "../src/syntax/brackets";

const model = fitSyntaxModel(reference);
const defaults = getDefaultSyntaxParameters(reference);
const ui = getDefaultParameters(reference);
const anchorsFor = (parameters = ui) => getSyntaxAnchors(parameters, generatePalette(reference, parameters));
const anchors = anchorsFor();
const distance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);
const render = (parameters = defaults, context = anchors) => {
  const resolved = resolveSyntaxParameters(model, parameters, context);
  return {
    palette: generateSyntax(model, parameters, context),
    brackets: generateBracketPalette(resolved, ui.error, ui.background).colors,
    swatches: resolved.colors
  };
};

test("all three automatic axes are on by default and require real UI anchors", () => {
  for (const mode of syntaxAutoModes) assert.equal(isSyntaxAutomatic(defaults, mode), true);
  assert.equal(defaults.lightnessShift, 0);
  assert.equal(defaults.chromaBoost, 0);
  assert.equal(defaults.lightnessBase, null);
  assert.deepEqual(defaults.seedSnapshots, {});
  assert.throws(() => generateSyntax(model, defaults), /require UI/);
  assert.throws(() => generateSyntax(model, defaults, { ...anchors, muted: "#ffffff80" }), /opaque/);
  assert.throws(() => getSyntaxAnchors(ui, { ...generatePalette(reference, ui), colors: {} }), /descriptionForeground/);
});

test("automatic hue aligns Color 1 and preserves wheel spacing, not exact accent RGB", () => {
  for (const accent of ["#297aa0", "#30a080", "#00ffff", "#aa3377"]) {
    const context = anchorsFor({ ...ui, accent });
    const resolved = resolveSyntaxParameters(model, defaults, context);
    assert.ok(distance(resolved.seeds.blue.h, toOklch(accent).h ?? 0) < 1e-9);
    for (const family of syntaxWheelFamilies) {
      const offset = ((resolved.seeds[family].h - toOklch(model.parameters[family]).h! + 540) % 360) - 180;
      assert.ok(Math.abs(offset - resolved.hueRotation) < 1e-9);
    }
    assert.notEqual(resolved.colors.blue, accent);
    assert.ok(Math.abs(resolved.seeds.neutral.l - toOklch(ui.foreground).l) < 1e-9);
    assert.ok(Math.abs(resolved.seeds.comments.l - toOklch(context.muted).l) < 1e-9);
  }
});

test("gray accents use the original orientation without erasing syntax color", () => {
  for (const accent of ["#000000", "#808080", "#ffffff", "#777879"]) {
    const resolved = resolveSyntaxParameters(model, defaults, anchorsFor({ ...ui, accent }));
    assert.equal(resolved.hueRotation, 0);
    for (const family of syntaxWheelFamilies) {
      assert.ok(distance(resolved.seeds[family].h, toOklch(model.parameters[family]).h ?? 0) < 1e-9);
      assert.ok(toOklch(resolved.colors[family]).c > 0.02);
    }
  }
});

test("automatic chroma is bounded, neutral at the reference accent, and monotonic with accent chroma", () => {
  assert.ok(Math.abs(resolveSyntaxParameters(model, defaults, anchors).chromaBoost) < 1e-12);
  let previous = -Infinity;
  const ordered = ["#808080", "#64748b", "#297aa0", "#00ffff", "#0000ff"]
    .sort((left, right) => toOklch(left).c - toOklch(right).c);
  for (const accent of ordered) {
    const resolved = resolveSyntaxParameters(model, defaults, anchorsFor({ ...ui, accent }));
    assert.ok(resolved.chromaBoost >= -0.25 && resolved.chromaBoost <= 0.25);
    assert.ok(resolved.chromaBoost >= previous);
    previous = resolved.chromaBoost;
  }
  assert.equal(resolveSyntaxParameters(model, defaults, anchorsFor({ ...ui, accent: "#ffffff" })).chromaBoost, -0.25);
  assert.ok(resolveSyntaxParameters(model, defaults, anchorsFor({ ...ui, accent: "#00ffff" })).chromaBoost < 0.25);
});

test("automatic lightness scales generated foreground/muted lightness for every fitted variant", () => {
  for (const mutedContrast of [0.25, 1, 2]) {
    const context = anchorsFor({ ...ui, foreground: "#b8c4d0", mutedContrast });
    const parameters: SyntaxParameters = { ...defaults, paletteMode: "manual", chromaMode: "manual" };
    const syntax = generateSyntax(model, parameters, context);
    const targets = {
      text: scaleSyntaxAutoLightness(toOklch(context.foreground).l),
      comments: scaleSyntaxAutoLightness(toOklch(context.muted).l)
    };
    model.tokenColors.forEach(({ fit }, index) => {
      if (!fit) return;
      const value = syntax.tokenColors[index]?.settings.foreground;
      assert.ok(value);
      assert.ok(Math.abs(toOklch(value).l - targets[fit.family === "comments" ? "comments" : "text"]) < 0.003);
    });
    assert.ok(Math.abs(toOklch(syntax.editorForeground).l - targets.text) < 0.003);
  }
});

test("automatic lightness has a smooth monotonic shoulder above 0.8 and maps white to 0.85", () => {
  for (const value of [0, 0.1, 0.5, 0.75, 0.8]) assert.equal(scaleSyntaxAutoLightness(value), value);
  let previous = 0;
  for (let step = 0; step <= 1000; step++) {
    const value = step / 1000;
    const output = scaleSyntaxAutoLightness(value);
    assert.ok(output >= previous - 1e-12, "Brighter anchors must never darken syntax.");
    assert.ok(output <= 0.85 && output <= value + 1e-12);
    previous = output;
  }
  assert.equal(scaleSyntaxAutoLightness(1), 0.85);
  const step = 1e-6;
  assert.ok(Math.abs((scaleSyntaxAutoLightness(0.8 + step) - 0.8) / step - 1) < 1e-4,
    "The roll-off must not introduce a sudden change in slope.");
  assert.throws(() => scaleSyntaxAutoLightness(NaN), /finite/);
});

test("white foreground keeps all six syntax/bracket hues colorful without changing UI white", () => {
  for (const paletteMode of ["manual", "auto"] as const) {
    for (const chromaMode of ["manual", "auto"] as const) {
      for (const mutedContrast of [1, 2]) {
        const uiParameters = { ...ui, foreground: "#ffffff", mutedContrast };
        const uiPalette = generatePalette(reference, uiParameters);
        const context = getSyntaxAnchors(uiParameters, uiPalette);
        const parameters = { ...defaults, paletteMode, chromaMode };
        const resolved = resolveSyntaxParameters(model, parameters, context);
        const output = render(parameters, context);
        assert.equal(uiPalette.colors.foreground, "#ffffff", "Only automatic syntax lightness should be limited.");
        assert.equal(resolved.lightnessBase?.text, 0.85);
        assert.ok(resolved.lightnessBase && resolved.lightnessBase.comments <= 0.85);
        for (const [index, family] of syntaxWheelFamilies.entries()) {
          const color = toOklch(resolved.colors[family]);
          assert.ok(Math.abs(color.l - 0.85) < 0.003);
          assert.ok(color.c > 0.03, `${family} must retain visible chroma with white foreground.`);
          assert.equal(output.brackets[`editorBracketHighlight.foreground${index + 1}`], resolved.colors[family]);
        }
        assert.equal(new Set(syntaxWheelFamilies.map((family) => resolved.colors[family])).size, 6);
        model.tokenColors.forEach(({ fit }, index) => {
          if (!fit) return;
          const color = output.palette.tokenColors[index]?.settings.foreground;
          assert.ok(color && toOklch(color).l <= 0.853, "Fitted variants must also respect scaled automatic lightness.");
        });
        for (const style of Object.values(output.palette.semanticTokenColors)) {
          const color = typeof style === "string" ? style : style.foreground;
          if (color) assert.ok(toOklch(color).l <= 0.853, "Semantic styles must use the same automatic lightness.");
        }
      }
    }
  }
});

test("the automatic shoulder is captured exactly but never caps manual lightness", () => {
  const context = anchorsFor({ ...ui, foreground: "#ffffff", mutedContrast: 2 });
  const manual = setSyntaxAuto(model, defaults, context, "autoLightness", false);
  assert.deepEqual(manual.lightnessBase, { text: 0.85, comments: 0.85 });
  assert.deepEqual(render(manual, context), render(defaults, context));
  const shifted = render({ ...manual, lightnessShift: 1 }, context);
  assert.equal(shifted.palette.editorForeground, "#ffffff");
  for (const rule of shifted.palette.tokenColors) {
    if (rule.settings.foreground) assert.equal(rule.settings.foreground, "#ffffff");
  }
  for (const family of syntaxWheelFamilies) assert.equal(shifted.swatches[family], "#ffffff");
});

test("every automatic-to-manual handoff is byte-exact for all eight mode combinations", () => {
  const contexts = [
    anchors,
    anchorsFor({ ...ui, accent: "#17a291", foreground: "#b1bccf", mutedContrast: 0.65 }),
    anchorsFor({ ...ui, accent: "#ffffff", foreground: "#557799", mutedContrast: 1.5 }),
    anchorsFor({ ...ui, foreground: "#ffffff", mutedContrast: 2 })
  ];
  for (const context of contexts) {
    for (let mask = 0; mask < 8; mask++) {
      const parameters: SyntaxParameters = {
        ...defaults, lightnessMode: mask & 1 ? "auto" : "manual", chromaMode: mask & 2 ? "auto" : "manual", paletteMode: mask & 4 ? "auto" : "manual",
        chromaBoost: 0.37, lightnessShift: -0.23
      };
      for (const mode of syntaxAutoModes) {
        if (!isSyntaxAutomatic(parameters, mode)) continue;
        const before = render(parameters, context);
        const manual = setSyntaxAuto(model, parameters, context, mode, false);
        assert.equal(isSyntaxAutomatic(manual, mode), false);
        assert.deepEqual(render(manual, context), before, `${mask}/${mode}`);
        for (const other of syntaxAutoModes) {
          if (other !== mode) assert.equal(isSyntaxAutomatic(manual, other), isSyntaxAutomatic(parameters, other));
        }
        if (mode === "autoLightness") {
          assert.equal(manual.lightnessShift, 0);
          assert.ok(manual.lightnessBase);
        } else if (mode === "autoChroma") {
          assert.equal(manual.chromaBoost, resolveSyntaxParameters(model, parameters, context).chromaBoost);
        } else {
          assert.equal(Object.keys(manual.seedSnapshots).length, 8);
        }
      }
    }
  }
});

test("disabling all axes in any order freezes the palette even after UI anchors change", () => {
  for (const order of [
    ["autoLightness", "autoChroma", "autoHue"],
    ["autoHue", "autoLightness", "autoChroma"],
    ["autoChroma", "autoHue", "autoLightness"]
  ] as const) {
    let parameters = defaults;
    const before = render(parameters);
    for (const mode of order) parameters = setSyntaxAuto(model, parameters, anchors, mode, false);
    assert.deepEqual(render(parameters), before);
    const changed = anchorsFor({ ...ui, foreground: "#ccaabb", accent: "#cc2299", mutedContrast: 0.4 });
    assert.deepEqual(render(parameters, changed), before);
    const resumed = setSyntaxAuto(model, parameters, changed, "autoHue", true);
    assert.notDeepEqual(render(resumed, changed), before);
    const capturedAgain = setSyntaxAuto(model, resumed, changed, "autoHue", false);
    assert.deepEqual(render(capturedAgain, changed), render(resumed, changed));
  }
});

test("manual resets leave Auto off, affect only their axis, and clear captures instead of restoring Auto", () => {
  const context = anchorsFor({ ...ui, accent: "#b04488", foreground: "#bcddef", mutedContrast: 0.55 });
  let parameters = defaults;
  for (const mode of syntaxAutoModes) parameters = setSyntaxAuto(model, parameters, context, mode, false);
  parameters = { ...parameters, chromaBoost: 0.7, lightnessShift: -0.3 };
  const lightness = resetSyntaxGroup(model, parameters, "autoLightness");
  assert.equal(lightness.lightnessMode, "manual");
  assert.equal(lightness.lightnessShift, 0);
  assert.equal(lightness.lightnessBase, null);
  assert.equal(lightness.chromaBoost, parameters.chromaBoost);
  assert.deepEqual(lightness.seedSnapshots, parameters.seedSnapshots);
  const chroma = resetSyntaxGroup(model, parameters, "autoChroma");
  assert.equal(chroma.chromaMode, "manual");
  assert.equal(chroma.chromaBoost, 0);
  assert.deepEqual(chroma.lightnessBase, parameters.lightnessBase);
  assert.equal(chroma.lightnessShift, parameters.lightnessShift);
  const palette = resetSyntaxGroup(model, parameters, "autoHue");
  assert.equal(palette.paletteMode, "manual");
  assert.deepEqual(palette.seedSnapshots, {});
  for (const family of syntaxFamilies) assert.equal(palette[family], model.parameters[family]);
  assert.deepEqual(palette.lightnessBase, parameters.lightnessBase);
  assert.equal(palette.chromaBoost, parameters.chromaBoost);
  for (const mode of syntaxAutoModes) {
    assert.throws(() => resetSyntaxGroup(model, defaults, mode), /Disable/);
    const mixed = setSyntaxAuto(model, defaults, anchors, mode, false);
    const reset = resetSyntaxGroup(model, mixed, mode);
    for (const other of syntaxAutoModes) assert.equal(isSyntaxAutomatic(reset, other), isSyntaxAutomatic(mixed, other));
  }
  let reset = parameters;
  for (const mode of syntaxAutoModes) reset = resetSyntaxGroup(model, reset, mode);
  assert.deepEqual(reset, model.parameters);
});

test("editing a captured seed drops only its precision snapshot and does not recolor other families", () => {
  const manual = setSyntaxAuto(model, defaults, anchors, "autoHue", false);
  const edited = setSyntaxSeed(manual, "blue", "#d04488");
  assert.equal(edited.seedSnapshots.blue, undefined);
  for (const family of syntaxFamilies) {
    if (family === "blue") continue;
    assert.deepEqual(edited.seedSnapshots[family], manual.seedSnapshots[family]);
    assert.equal(render(edited).swatches[family], render(manual).swatches[family]);
  }
  assert.throws(() => setSyntaxSeed(defaults, "blue", "#ffffff"), /Disable/);
  assert.throws(() => setSyntaxSeed(manual, "blue", "red"), /blue/);
});

test("automatic/manual handoffs survive the atomic draft boundary without losing precision", () => {
  let parameters = defaults;
  for (const mode of syntaxAutoModes) parameters = setSyntaxAuto(model, parameters, anchors, mode, false);
  const parsed = parseSyntaxParameters(JSON.parse(JSON.stringify(parameters)));
  assert.deepEqual(parsed, parameters);
  assert.deepEqual(render(parsed), render(defaults));
  for (const mode of [...syntaxAdjustmentParameters, "paletteMode"] as const) {
    for (const value of [undefined, null, 1, "true"]) {
      assert.throws(() => parseSyntaxParameters({ ...defaults, [mode]: value }), new RegExp(mode));
    }
  }
  for (const lightnessBase of [undefined, [], { text: NaN, comments: 0.5 }, { text: 0.5, comments: 2 }]) {
    assert.throws(() => parseSyntaxParameters({ ...parameters, lightnessBase }), /lightnessBase/);
  }
  for (const seedSnapshots of [undefined, [], { unknown: {} }, { blue: { l: 0.8, c: -1, h: 240 } }, { blue: { l: 0.8, c: 0.1, h: Infinity } }]) {
    assert.throws(() => parseSyntaxParameters({ ...parameters, seedSnapshots }), /snapshot/i);
  }
  assert.throws(() => parseSyntaxParameters({ ...parameters, paletteMode: "auto" }), /seedSnapshots/);
  assert.throws(() => parseSyntaxParameters({ ...parameters, lightnessMode: "auto" }), /lightnessBase/);
});

test("all modes leave unexpected-bracket errors independent and never add a shared gamut ceiling", () => {
  const error = render().brackets[unexpectedBracketId];
  for (let mask = 0; mask < 8; mask++) {
    const parameters: SyntaxParameters = {
      ...defaults, lightnessMode: mask & 1 ? "auto" : "manual", chromaMode: mask & 2 ? "auto" : "manual", paletteMode: mask & 4 ? "auto" : "manual",
      chromaBoost: 0.7, lightnessShift: -0.2
    };
    assert.equal(render(parameters).brackets[unexpectedBracketId], error);
  }
  const parameters = { ...model.parameters, chromaBoost: 1 };
  const base = render(parameters);
  const edited = render(setSyntaxSeed(parameters, "red", "#fefdfc"));
  for (const family of syntaxWheelFamilies) if (family !== "red") assert.equal(edited.swatches[family], base.swatches[family]);
});

test("Off matches each former reset, clears captures, and leaves other axes and seeds alone in both themes", () => {
  for (const reference of Object.values(references)) {
    const fitted = fitSyntaxModel(reference);
    const ui = { ...getDefaultParameters(reference), foreground: "#93a4b5", accent: "#aa4477" };
    const context = getSyntaxAnchors(ui, generatePalette(reference, ui));
    let manual = getDefaultSyntaxParameters(reference);
    for (const mode of syntaxAutoModes) manual = setSyntaxAuto(fitted, manual, context, mode, false);
    manual = { ...manual, chromaBoost: 0.7, lightnessShift: -0.3 };
    for (const key of syntaxAdjustmentParameters) {
      const group = key === "chromaMode" ? "autoChroma" : "autoLightness";
      for (const starting of [manual, setSyntaxAuto(fitted, manual, context, group, true)]) {
        const reset = resetSyntaxGroup(fitted,
          setSyntaxAuto(fitted, starting, context, group, false), group);
        const off = setSyntaxAdjustmentMode(fitted, starting, context, key, "off");
        assert.equal(off[key], "off");
        assert.deepEqual(generateSyntax(fitted, off, context), generateSyntax(fitted, reset, context));
        assert.deepEqual(off.seedSnapshots, starting.seedSnapshots);
        for (const family of syntaxFamilies) assert.equal(off[family], starting[family]);
        if (key === "chromaMode") {
          assert.equal(off.chromaBoost, 0);
          assert.equal(off.lightnessMode, starting.lightnessMode);
          assert.equal(off.lightnessShift, starting.lightnessShift);
          assert.deepEqual(off.lightnessBase, starting.lightnessBase);
        } else {
          assert.equal(off.lightnessShift, 0);
          assert.equal(off.lightnessBase, null);
          assert.equal(off.chromaMode, starting.chromaMode);
          assert.equal(off.chromaBoost, starting.chromaBoost);
        }
        assert.deepEqual(setSyntaxAdjustmentMode(fitted, off, context, key, "off"), off);
        const resumed = setSyntaxAdjustmentMode(fitted, off, context, key, "manual");
        assert.equal(resumed[key], "manual");
        assert.deepEqual(generateSyntax(fitted, resumed, context), generateSyntax(fitted, off, context));
        assert.deepEqual(parseSyntaxParameters(JSON.parse(JSON.stringify(off))), off);
        assert.deepEqual(parseSyntaxParameters(JSON.parse(JSON.stringify(resumed))), resumed,
          "Manual at zero must remain distinct from Off.");
        assert.deepEqual(setSyntaxAdjustmentMode(fitted, resumed, context, key, "auto"),
          setSyntaxAuto(fitted, resumed, context, group, true));
      }
    }
  }
});

test("mode parsing rejects hidden Off adjustments and explicitly migrates legacy automatic booleans", () => {
  assert.throws(() => parseSyntaxParameters({ ...defaults, chromaMode: "off", chromaBoost: 0.1 }), /zero chromaBoost/);
  assert.throws(() => parseSyntaxParameters({ ...defaults, lightnessMode: "off", lightnessShift: 0.1 }), /zero lightnessShift/);
  assert.throws(() => parseSyntaxParameters({
    ...defaults, lightnessMode: "off", lightnessBase: { text: 0.7, comments: 0.5 }
  }), /manual lightness/);
  for (const legacyKey of ["autoChroma", "autoLightness"]) {
    assert.throws(() => parseSyntaxParameters({ ...defaults, [legacyKey]: true }), /legacy/);
  }
  const { chromaMode, lightnessMode, ...legacy } = defaults;
  assert.equal(chromaMode, "auto");
  assert.equal(lightnessMode, "auto");
  assert.deepEqual(parseSyntaxParameters({ ...legacy, autoChroma: true, autoLightness: true }), defaults);
  assert.deepEqual(parseSyntaxParameters({ ...legacy, autoChroma: false, autoLightness: false }), {
    ...defaults, chromaMode: "manual", lightnessMode: "manual"
  });
});
