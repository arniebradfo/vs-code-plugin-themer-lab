import assert from "node:assert/strict";
import { test } from "node:test";
import { limitOklchChroma, toOklch } from "../src/color";
import { reference, references } from "../src/shared/reference";
import {
  classifySyntaxColor,
  adjustSyntaxColor,
  evaluateSyntaxContrast,
  evaluateSyntaxRules,
  fitSyntaxModel,
  generateResolvedSyntax,
  generateSyntax,
  getSyntaxModel,
  getDefaultSyntaxParameters,
  maximumSyntaxHueShift,
  parseSyntaxParameters,
  renderSyntaxColor,
  resolveSyntaxParameters,
  syntaxFamilies,
  syntaxNumericParameterLimits,
  syntaxPreviewColors,
  syntaxVocabulary
} from "../src/syntax";

const model = fitSyntaxModel(reference);
const generated = generateSyntax(model, model.parameters);
const fits = [model.editorForeground, ...model.tokenColors.flatMap(({ fit }) => fit ? [fit] : []),
  ...model.semanticTokenColors.flatMap(({ fit }) => fit ? [fit] : [])];
const distance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);
const scopeColor = (palette: typeof generated, scope: string) => {
  const color = [...palette.tokenColors].reverse().find((rule) =>
    (Array.isArray(rule.scope) ? rule.scope : [rule.scope]).includes(scope)
  )?.settings.foreground;
  assert.ok(color, scope);
  return color;
};
const foregrounds = (palette: typeof generated) => [
  palette.editorForeground,
  ...palette.tokenColors.flatMap((rule) => rule.settings.foreground ? [rule.settings.foreground] : []),
  ...Object.values(palette.semanticTokenColors).flatMap((style) =>
    typeof style === "string" ? [style] : style.foreground ? [style.foreground] : [])
];

test("lazy syntax models are cached per reference without changing fitted or rendered output", () => {
  for (const reference of Object.values(references)) {
    const cached = getSyntaxModel(reference);
    assert.equal(getSyntaxModel(reference), cached);
    const fitted = fitSyntaxModel(reference);
    assert.deepEqual(cached, fitted);
    assert.deepEqual(generateResolvedSyntax(cached, resolveSyntaxParameters(cached, cached.parameters)),
      generateSyntax(fitted, fitted.parameters));
    const independent = getSyntaxModel(structuredClone(reference));
    assert.notEqual(independent, cached);
    assert.deepEqual(independent, cached);
  }
});

test("the fitted manual baseline has eight seeds, two sliders, and three independent Auto modes", () => {
  assert.deepEqual(model.parameters, {
    red: "#ff7b72", amber: "#d7ba7d", green: "#7ee787", teal: "#4ec9b0",
    blue: "#79c0ff", violet: "#d2a8ff", neutral: "#c9d1d9", comments: "#8b949e",
    chromaBoost: 0, lightnessShift: 0,
    lightnessMode: "manual", chromaMode: "manual", paletteMode: "manual",
    lightnessBase: null, seedSnapshots: {}
  });
  const changedUi = structuredClone(reference);
  for (const entry of Object.values(changedUi.colors)) entry.value = "#123456";
  assert.deepEqual(getDefaultSyntaxParameters(changedUi), {
    ...model.parameters, lightnessMode: "auto", chromaMode: "auto", paletteMode: "auto"
  });
  assert.equal(model.complexity.inputCount, 13);
  assert.equal(model.complexity.colorInputCount, 8);
  assert.equal(model.complexity.globalSliderCount, 2);
  assert.equal(model.complexity.automaticModeCount, 3);
  assert.equal(model.complexity.learnedNumericCoefficients, 0);
  assert.equal(model.complexity.perTokenNumericResiduals, 0);
});

test("color grouping is primary with explicit diagnostic and diff safeguards", () => {
  for (const [color, family] of [
    ["#ff7b72", "red"], ["#ffa657", "amber"], ["#dcdcaa", "amber"],
    ["#b5cea8", "green"], ["#7ee787", "green"], ["#4ec9b0", "teal"],
    ["#a5d6ff", "blue"], ["#9cdcfe", "blue"], ["#c586c0", "violet"], ["#808080", "neutral"]
  ]) {
    assert.equal(classifySyntaxColor(color ?? "", model.parameters).family, family);
  }
  assert.equal(classifySyntaxColor("#a5d6ff", model.parameters, "keyword").family, "blue",
    "An ordinary semantic label must not override native color grouping.");
  assert.deepEqual(classifySyntaxColor("#ffa198", model.parameters, "invalid.illegal"), { family: "red", grouping: "semantic" });
  assert.deepEqual(classifySyntaxColor("#b5cea8", model.parameters, "markup.inserted"), { family: "green", grouping: "semantic" });
  assert.deepEqual(classifySyntaxColor("#cd9731", model.parameters, "token.warn-token"), { family: "amber", grouping: "semantic" });
  assert.ok(model.complexity.semanticAssignments > 0);
});

test("comments are a semantic exception independent of their native color and neutral text", () => {
  for (const scope of ["comment", "comment.block.documentation", "punctuation.definition.comment", "string.comment"]) {
    for (const color of ["#8b949e", "#6a9955", "#ff7b72"]) {
      assert.deepEqual(classifySyntaxColor(color, model.parameters, scope), { family: "comments", grouping: "semantic" });
    }
  }
  assert.equal(classifySyntaxColor("#8b949e", model.parameters).family, "neutral");
  assert.notEqual(classifySyntaxColor("#6a9955", model.parameters, "punctuation.definition.quote.begin.markdown").family, "comments");
  const commentsEdited = generateSyntax(model, { ...model.parameters, comments: "#ff0000" });
  assert.equal(scopeColor(commentsEdited, "comment"), "#ff0000");
  assert.equal(commentsEdited.editorForeground, generated.editorForeground);
  assert.equal(scopeColor(commentsEdited, "punctuation.definition.tag"), scopeColor(generated, "punctuation.definition.tag"));
  const neutralEdited = generateSyntax(model, { ...model.parameters, neutral: "#00ff00" });
  assert.equal(scopeColor(neutralEdited, "comment"), scopeColor(generated, "comment"));
  assert.notEqual(neutralEdited.editorForeground, generated.editorForeground);
});

test("all fitted hue shifts are at most fifteen degrees with no neutral or comment hue rotation", () => {
  assert.equal(maximumSyntaxHueShift, 15);
  for (const fit of fits) {
    assert.ok(Math.abs(fit.transform.hue) <= 15);
    assert.ok(syntaxVocabulary.lightness.includes(fit.transform.lightness));
    assert.ok(syntaxVocabulary.chroma.includes(fit.transform.chroma));
    assert.ok(syntaxVocabulary.hue.includes(fit.transform.hue));
    if (fit.family === "neutral" || fit.family === "comments") assert.equal(fit.transform.hue, 0);
  }
  assert.throws(() => renderSyntaxColor("#ff0000", { lightness: 0, chroma: 1, hue: 120 }), /bounded/);
});

test("generation does not read the native target RGB or refit the family assignments", () => {
  const changed = structuredClone(model);
  for (const entry of changed.tokenColors) {
    if (entry.fit) entry.fit.source = "#123456";
    if (entry.rule.settings.foreground) entry.rule.settings.foreground = "#123456";
  }
  for (const entry of changed.semanticTokenColors) {
    if (entry.fit) entry.fit.source = "#123456";
    if (typeof entry.style === "string") entry.style = "#123456";
    else if (entry.style.foreground) entry.style.foreground = "#123456";
  }
  changed.editorForeground.source = "#123456";
  assert.deepEqual(generateSyntax(changed, model.parameters), generated);
});

test("seed edits affect only their fixed family, including with chroma boost active", () => {
  const before = structuredClone(model);
  for (const chromaBoost of [-0.5, 0, 0.5, 1]) {
    const parameters = { ...model.parameters, chromaBoost };
    const base = generateSyntax(model, parameters);
    for (const family of syntaxFamilies) {
      const edited = generateSyntax(model, { ...parameters, [family]: "#ff0000" });
      let count = 0;
      model.tokenColors.forEach((entry, index) => {
        const original = base.tokenColors[index];
        const output = edited.tokenColors[index];
        assert.ok(original && output);
        assert.deepEqual(output.scope, original.scope);
        assert.equal(output.settings.fontStyle, original.settings.fontStyle);
        if (entry.fit?.family !== family) assert.deepEqual(output, original);
        else if (output.settings.foreground !== original.settings.foreground) count++;
      });
      for (const { selector, fit } of model.semanticTokenColors) {
        if (fit?.family !== family) assert.deepEqual(edited.semanticTokenColors[selector], base.semanticTokenColors[selector]);
      }
      if (family !== "neutral") assert.equal(edited.editorForeground, base.editorForeground);
      assert.ok(count > 0, `${family} at boost ${chromaBoost}`);
    }
  }
  assert.deepEqual(model, before);
});

test("a red seed never produces unrelated blue or green hues in that family", () => {
  for (const family of syntaxFamilies) {
    const edited = generateSyntax(model, { ...model.parameters, [family]: "#ff0000" });
    model.tokenColors.forEach(({ fit }, index) => {
      if (fit?.family !== family) return;
      const color = edited.tokenColors[index]?.settings.foreground;
      assert.ok(color);
      const output = toOklch(color);
      // Quantizing very dark shades to 8-bit RGB can add up to two degrees.
      if (output.c > 0.02) assert.ok(distance(output.h ?? 0, toOklch("#ff0000").h ?? 0) <= 17,
        `${family}: ${color} changed hue beyond the bound plus hex-quantization allowance.`);
    });
  }
});

test("black and gray seeds cannot acquire color from hue rotations, boost, or lightness shift", () => {
  for (const seed of ["#000000", "#808080", "#ffffff"]) {
    const parameters = { ...model.parameters, ...Object.fromEntries(syntaxFamilies.map((family) => [family, seed])) };
    for (const chromaBoost of [-1, -0.5, 0, 0.5, 1]) {
      for (const lightnessShift of [-1, -0.5, 0, 0.5, 1]) {
        const palette = generateSyntax(model, { ...parameters, chromaBoost, lightnessShift });
        assert.ok(foregrounds(palette).every((color) => toOklch(color).c < 1e-6));
      }
    }
  }
});

test("zero manual adjustments preserve the original fitted output", () => {
  const edited = generateSyntax(model, model.parameters);
  assert.deepEqual(edited.tokenColors, generated.tokenColors);
  assert.deepEqual(edited.semanticTokenColors, generated.semanticTokenColors);
  assert.equal(edited.editorForeground, generated.editorForeground);
  assert.equal(edited.editorForeground, renderSyntaxColor(model.parameters.neutral, model.editorForeground.transform));
  model.tokenColors.forEach(({ fit }, index) => {
    if (fit) assert.equal(edited.tokenColors[index]?.settings.foreground, renderSyntaxColor(model.parameters[fit.family], fit.transform));
  });
  for (const { selector, fit } of model.semanticTokenColors) {
    if (!fit) continue;
    const style = edited.semanticTokenColors[selector];
    assert.ok(style);
    assert.equal(typeof style === "string" ? style : style.foreground, renderSyntaxColor(model.parameters[fit.family], fit.transform));
  }
});

test("signed boost changes chroma monotonically without changing hue or lightness", () => {
  const original = foregrounds(generated).map(toOklch);
  let previous = original.map(() => 0);
  for (const chromaBoost of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
    const colors = foregrounds(generateSyntax(model, { ...model.parameters, chromaBoost })).map(toOklch);
    colors.forEach((color, index) => {
      const base = original[index];
      const preceding = previous[index];
      assert.ok(base && preceding !== undefined);
      assert.ok(color.c >= preceding - 0.003, `Chroma must not fall as boost rises: ${index} at ${chromaBoost}.`);
      assert.ok(Math.abs(color.l - base.l) < 0.003);
      // Near gray, RGB rounding can move hue angles by several degrees.
      const hueError = 2 * Math.min(color.c, base.c) * Math.sin(distance(color.h ?? 0, base.h ?? 0) * Math.PI / 360);
      assert.ok(hueError < 0.003, `Hue displacement exceeds RGB rounding: ${index} at ${chromaBoost}.`);
      if (chromaBoost <= 0) assert.ok(Math.abs(color.c - base.c * (1 + chromaBoost)) < 0.003);
      if (chromaBoost === -1) assert.ok(color.c < 1e-6, "The lower endpoint must be grayscale.");
    });
    previous = colors.map((color) => color.c);
  }
  assert.ok(toOklch(scopeColor(generateSyntax(model, { ...model.parameters, chromaBoost: 1 }), "comment")).c >
    toOklch(scopeColor(generated, "comment")).c + 0.05, "Muted comments must gain substantial chroma.");
});

test("signed lightness shift preserves hierarchy and follows each shade toward black or white", () => {
  const original = foregrounds(generated).map(toOklch);
  let previous = original.map(() => 0);
  for (const lightnessShift of [-1, -0.5, 0, 0.5, 1]) {
    const colors = foregrounds(generateSyntax(model, { ...model.parameters, lightnessShift })).map(toOklch);
    colors.forEach((color, index) => {
      const base = original[index];
      assert.ok(base);
      const expected = lightnessShift <= 0 ? base.l * (1 + lightnessShift) : base.l + (1 - base.l) * lightnessShift;
      // Near black, 8-bit RGB rounds perceptual lightness more coarsely.
      assert.ok(Math.abs(color.l - expected) < (color.l < 0.15 ? 0.005 : 0.003));
      assert.ok(color.l >= (previous[index] ?? 0) - 0.003);
    });
    previous = colors.map((color) => color.l);
  }
});

test("full boost uses each shade's own gamut boundary at the final lightness", () => {
  const palette = generateSyntax(model, {
    ...model.parameters, chromaBoost: 1,
    lightnessBase: { text: 0.75, comments: 0.75 }
  });
  const base = generateSyntax(model, { ...model.parameters, lightnessBase: { text: 0.75, comments: 0.75 } });
  const chromas = new Set<number>();
  model.tokenColors.forEach(({ fit }, index) => {
    if (!fit) return;
    const color = palette.tokenColors[index]?.settings.foreground;
    assert.ok(color);
    const output = toOklch(color);
    assert.ok(Math.abs(output.l - 0.75) < 0.003);
    const original = base.tokenColors[index]?.settings.foreground;
    assert.ok(original);
    const before = toOklch(original);
    if (fit.family === "neutral" || before.c < 1e-6) {
      assert.equal(color, original);
    } else {
      const target = limitOklchChroma(0.75, 1, (toOklch(model.parameters[fit.family]).h ?? 0) + fit.transform.hue);
      assert.ok(Math.abs(output.c - target) < 0.003);
      chromas.add(Math.round(output.c * 100));
      assert.ok(distance(output.h ?? 0, (toOklch(model.parameters[fit.family]).h ?? 0) + fit.transform.hue) < 2);
    }
  });
  assert.ok(chromas.size > 3, "Different hues must not be flattened to one common chroma.");
});

test("partial boost interpolates through available chroma headroom rather than multiplying the seed", () => {
  const color = toOklch(model.parameters.comments);
  const parameters = { ...model.parameters, lightnessShift: 0.5 };
  const lightness = color.l + (1 - color.l) * 0.5;
  const base = limitOklchChroma(lightness, color.c, color.h ?? 0);
  const maximum = limitOklchChroma(lightness, 1, color.h ?? 0);
  for (const chromaBoost of [-1, -0.5, 0, 0.5, 1]) {
    const output = toOklch(adjustSyntaxColor(color, "comments", { ...parameters, chromaBoost }));
    const expected = chromaBoost <= 0 ? base * (1 + chromaBoost) : base + (maximum - base) * chromaBoost;
    assert.ok(Math.abs(output.l - lightness) < 0.003);
    assert.ok(Math.abs(output.c - expected) < 0.003);
  }
});

test("neutral tint follows reductions but never receives a positive chroma boost", () => {
  const parameters = { ...model.parameters, neutral: "#996680" };
  const base = generateSyntax(model, parameters);
  for (const chromaBoost of [0.25, 0.5, 1]) {
    const boosted = generateSyntax(model, { ...parameters, chromaBoost });
    assert.equal(boosted.editorForeground, base.editorForeground, "Positive boost must not boost or fade the neutral tint.");
    model.tokenColors.forEach(({ fit }, index) => {
      if (fit?.family === "neutral") assert.deepEqual(boosted.tokenColors[index], base.tokenColors[index]);
    });
  }
  const original = toOklch(base.editorForeground);
  assert.ok(original.c > 0.005);
  for (const chromaBoost of [-0.5, -1]) {
    const reduced = generateSyntax(model, { ...parameters, chromaBoost });
    const edited = toOklch(reduced.editorForeground);
    assert.ok(Math.abs(edited.l - original.l) < 0.003);
    assert.ok(Math.abs(edited.c - original.c * (1 + chromaBoost)) < 0.003);
    assert.ok(edited.c < original.c);
  }
  const commentsBoosted = generateSyntax(model, {
    ...model.parameters, chromaBoost: 0.5,
    lightnessBase: { text: 0.75, comments: 0.75 }
  });
  assert.ok(toOklch(scopeColor(commentsBoosted, "comment")).c > toOklch(scopeColor(generated, "comment")).c + 0.03,
    "Comments follow normal chroma boost, not the neutral-only restriction.");
  assert.ok(Math.abs(toOklch(commentsBoosted.editorForeground).c - toOklch(generated.editorForeground).c) < 0.003);
});

test("lightness endpoints remain exact black or white at every chroma boost", () => {
  for (const lightnessShift of [-1, 1]) {
    for (const chromaBoost of [-1, 0, 1]) {
      const endpoint = generateSyntax(model, { ...model.parameters, chromaBoost, lightnessShift });
      assert.ok(foregrounds(endpoint).every((color) => color === (lightnessShift === -1 ? "#000000" : "#ffffff")));
    }
  }
});

test("ordered source scopes, typography, and semantic fields are retained", () => {
  const selectors = (scope: string | string[] | undefined) =>
    (Array.isArray(scope) ? scope : [scope ?? ""]).flatMap((value) => value.split(",").map((value) => value.trim()));
  reference.tokenColors.forEach((source, sourceIndex) => {
    const entries = model.tokenColors.filter((entry) => entry.sourceIndex === sourceIndex);
    assert.deepEqual(entries.flatMap((entry) => selectors(entry.rule.scope)), selectors(source.scope));
    for (const { rule } of entries) assert.equal(rule.settings.fontStyle, source.settings.fontStyle);
  });
  assert.deepEqual(Object.keys(generated.semanticTokenColors).sort(), Object.keys(reference.semanticTokenColors).sort());
  assert.equal(generated.semanticHighlighting, reference.semanticHighlighting);
  assert.deepEqual(generateSyntax(model, model.parameters), generated);
});

test("color and global slider validation is explicit and bounded", () => {
  for (const family of syntaxFamilies) {
    for (const value of [undefined, null, "#fff", "#ffffff00", "red", 1]) {
      assert.throws(() => parseSyntaxParameters({ ...model.parameters, [family]: value }), new RegExp(family));
    }
  }
  for (const [key, limits] of Object.entries(syntaxNumericParameterLimits)) {
    for (const value of [undefined, null, NaN, Infinity, limits.min - 0.01, limits.max + 0.01, "0.5"]) {
      assert.throws(() => parseSyntaxParameters({ ...model.parameters, [key]: value }), new RegExp(key));
    }
    assert.doesNotThrow(() => parseSyntaxParameters({ ...model.parameters, [key]: limits.min }));
    assert.doesNotThrow(() => parseSyntaxParameters({ ...model.parameters, [key]: limits.max }));
  }
  const incomplete = structuredClone(model);
  const entry = incomplete.tokenColors.find((entry) => entry.fit);
  assert.ok(entry);
  delete entry.fit;
  assert.throws(() => generateSyntax(incomplete, incomplete.parameters), /Missing fitted/);
});

test("the illustration and advisory contrast use actual generated representative scopes", () => {
  const colors = syntaxPreviewColors(generated);
  assert.equal(colors.text, generated.editorForeground);
  assert.equal(colors.keywords, model.parameters.red);
  const checks = evaluateSyntaxContrast(generated, "#121314");
  assert.equal(checks.length, 9);
  assert.ok(checks.every((check) => check.passes));
  const dark = generateSyntax(model, { ...model.parameters, lightnessShift: -0.8 });
  assert.ok(evaluateSyntaxContrast(dark, "#121314").some((check) => !check.passes));
  assert.throws(() => syntaxPreviewColors({ ...generated, tokenColors: [] }), /missing/);
});

test("rule fidelity is separate from rendered acceptance and retains strict thresholds", () => {
  const report = evaluateSyntaxRules(model, model.parameters);
  assert.ok(report.count > 100);
  assert.ok(report.samples.every((sample) => sample.withinTolerance === (sample.deltaE <= 3)));
  assert.ok(evaluateSyntaxRules(model, model.parameters, 0).withinTolerancePercent < report.withinTolerancePercent);
  for (const tolerance of [-1, NaN, Infinity]) assert.throws(() => evaluateSyntaxRules(model, model.parameters, tolerance), /tolerance/i);
});
