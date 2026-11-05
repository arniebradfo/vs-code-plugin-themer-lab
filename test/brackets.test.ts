import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, limitOklchChroma, parseColor, toOklch } from "../src/color";
import { createThemeDocument } from "../src/extension/export";
import { generatePalette, getDefaultParameters } from "../src/model";
import { reference } from "../src/shared/reference";
import { SyntaxParameters, syntaxWheelFamilies } from "../src/shared/types";
import { fitSyntaxModel, generateSyntax, resolveSyntaxParameters } from "../src/syntax";
import { bracketColorIds, generateBracketPalette as generateResolvedBrackets, parseBracketColors, unexpectedBracketId } from "../src/syntax/brackets";

const model = fitSyntaxModel(reference);
const generateBracketPalette = (parameters: SyntaxParameters, error: string, background: string) =>
  generateResolvedBrackets(resolveSyntaxParameters(model, parameters), error, background);
const defaults = model.parameters;
const syntax = generateSyntax(model, defaults);
const error = "#f48771";
const background = "#121314";
const brackets = generateBracketPalette(defaults, error, background);
const circularDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);

test("six bracket slots reuse the existing seed colors without adding controls or hue rotations", () => {
  assert.equal(Object.keys(brackets.colors).length, 19);
  assert.deepEqual(Object.keys(brackets.colors), bracketColorIds);
  syntaxWheelFamilies.forEach((family, index) => {
    const slot = index + 1;
    assert.equal(brackets.colors[`editorBracketHighlight.foreground${slot}`], defaults[family]);
    assert.equal(brackets.colors[`editorBracketPairGuide.background${slot}`], `${defaults[family]}40`);
    assert.equal(brackets.colors[`editorBracketPairGuide.activeBackground${slot}`], `${defaults[family]}a6`);
  });
});

test("a seed changes only its bracket/guide slot, never another hue or the unexpected-bracket color", () => {
  syntaxWheelFamilies.forEach((family, index) => {
    const edited = { ...defaults, [family]: "#ff0000" };
    const current = generateBracketPalette(edited, error, background);
    for (const id of bracketColorIds) {
      if (id.endsWith(String(index + 1))) assert.equal(current.colors[id]?.slice(0, 7), "#ff0000", id);
      else assert.equal(current.colors[id], brackets.colors[id], id);
    }
  });
});

test("brackets use their own chroma headroom at the chosen lightness", () => {
  const parameters = {
    ...defaults, chromaBoost: 1,
    lightnessBase: { text: 0.75, comments: 0.75 }
  };
  const current = generateBracketPalette(parameters, error, background);
  syntaxWheelFamilies.forEach((family, index) => {
    const value = current.colors[`editorBracketHighlight.foreground${index + 1}`];
    assert.ok(value);
    const color = toOklch(value);
    assert.ok(Math.abs(color.l - 0.75) < 0.003);
    assert.ok(Math.abs(color.c - limitOklchChroma(0.75, 1, toOklch(defaults[family]).h ?? 0)) < 0.003);
    assert.ok(circularDistance(color.h ?? 0, toOklch(defaults[family]).h ?? 0) < 2);
  });
  assert.equal(current.colors[unexpectedBracketId], brackets.colors[unexpectedBracketId],
    "Ordinary palette adjustments must not mute unexpected brackets.");
  for (const settings of [
    { ...defaults, chromaBoost: -1 },
    { ...defaults, lightnessShift: -1 }
  ]) {
    assert.equal(generateBracketPalette(settings, error, background).colors[unexpectedBracketId],
      brackets.colors[unexpectedBracketId]);
  }
});

test("bracket chroma is monotonic, independent of other seeds, and cannot colorize true grays", () => {
  let previous = syntaxWheelFamilies.map(() => 0);
  for (const chromaBoost of [-1, -0.5, 0, 0.5, 1]) {
    const parameters = { ...defaults, chromaBoost };
    const current = generateBracketPalette(parameters, error, background);
    const paleSeed = generateBracketPalette({ ...parameters, red: "#fefdfc" }, error, background);
    const graySeeds = generateBracketPalette({
      ...parameters, ...Object.fromEntries(syntaxWheelFamilies.map((family) => [family, "#808080"]))
    }, error, background);
    previous = syntaxWheelFamilies.map((family, index) => {
      const id = `editorBracketHighlight.foreground${index + 1}`;
      const value = current.colors[id];
      const gray = graySeeds.colors[id];
      const preceding = previous[index];
      assert.ok(value && gray && preceding !== undefined);
      const color = toOklch(value);
      const original = toOklch(defaults[family]);
      assert.ok(color.c >= preceding - 0.003);
      assert.ok(Math.abs(color.l - original.l) < 0.003);
      if (color.c > 0.02) assert.ok(circularDistance(color.h ?? 0, original.h ?? 0) < 2);
      if (chromaBoost === -1) assert.ok(color.c < 1e-6);
      if (family !== "red") assert.equal(paleSeed.colors[id], value, "A pale seed must not hold back other bracket colors.");
      assert.ok(toOklch(gray).c < 1e-6);
      assert.equal(current.colors[`editorBracketPairGuide.background${index + 1}`], `${value}40`);
      assert.equal(current.colors[`editorBracketPairGuide.activeBackground${index + 1}`], `${value}a6`);
      return color.c;
    });
  }
});

test("unexpected brackets keep the Error hue, maximize chroma, and meet contrast on dark/light/mid backgrounds", () => {
  for (const source of ["#f48771", "#64758f", "#37896a", "#00aeff"]) {
    for (const canvas of ["#121314", "#ffffff", "#777777", "#f1e1d1", "#000000"]) {
      const current = generateBracketPalette(defaults, source, canvas);
      const value = current.colors[unexpectedBracketId];
      assert.ok(value);
      const color = toOklch(value);
      assert.equal(current.usesRedFallback, false);
      assert.ok(circularDistance(color.h ?? 0, toOklch(source).h ?? 0) < 2);
      // Mid-gray backgrounds can require near-black/white to reach 4.5:1.
      assert.ok(color.c > (canvas === "#777777" ? 0.01 : 0.05), `${source} on ${canvas} must use available chroma.`);
      assert.ok(contrastRatio(value, canvas) >= 4.5);
      assert.ok(current.contrast.passes);
      assert.ok(Math.abs(color.c - limitOklchChroma(color.l, 0.3, toOklch(source).h ?? 0)) < 0.005,
        "The chosen lightness should use its available chroma, not the muted Error chroma.");
    }
  }
});

test("achromatic Error inputs have an explicit vivid-red fallback, unaffected by the code palette", () => {
  for (const source of ["#000000", "#808080", "#ffffff", "#777879"]) {
    const current = generateBracketPalette(defaults, source, background);
    const value = current.colors[unexpectedBracketId];
    assert.ok(value);
    const color = toOklch(value);
    assert.equal(current.usesRedFallback, true);
    assert.ok(circularDistance(color.h ?? 0, toOklch("#ff0000").h ?? 0) < 2);
    assert.ok(color.c > 0.15);
  }
});

test("bracket generation rejects incomplete/foreign/transparent foreground palettes and invalid context", () => {
  const missing = { ...brackets.colors };
  delete missing["editorBracketHighlight.foreground1"];
  assert.throws(() => parseBracketColors(missing), /exactly/);
  assert.throws(() => parseBracketColors({ ...brackets.colors, "unknown.slot": "#ffffff" }), /exactly/);
  assert.throws(() => parseBracketColors({ ...brackets.colors, [unexpectedBracketId]: "#ffffff80" }), /opaque/);
  assert.throws(() => parseBracketColors({ ...brackets.colors, "editorBracketPairGuide.background1": "red" }), /valid hex/);
  assert.throws(() => generateBracketPalette(defaults, "red", background), /six-digit/);
  assert.throws(() => generateBracketPalette(defaults, error, "#12131480"), /six-digit/);
  assert.throws(() => generateBracketPalette({ ...defaults, chromaBoost: 1.01 }, error, background), /chromaBoost/);
  assert.throws(() => generateBracketPalette({ ...defaults, chromaBoost: NaN }, error, background), /chromaBoost/);
});

test("export includes supported bracket colors but cannot enable editor behavior or change match-box colors", () => {
  const ui = generatePalette(reference, getDefaultParameters(reference));
  const document = createThemeDocument(reference, ui, "Bracket Palette", syntax, brackets);
  for (const id of bracketColorIds) assert.equal(document.colors[id], brackets.colors[id]);
  assert.equal(document.colors["editorBracketMatch.border"], ui.colors["editorBracketMatch.border"]);
  assert.equal(document.colors["editorBracketMatch.background"], ui.colors["editorBracketMatch.background"]);
  assert.deepEqual(document.tokenColors, syntax.tokenColors);
  assert.equal(document["editor.bracketPairColorization.enabled"], undefined);
  assert.equal(document.include, undefined);
  for (const id of bracketColorIds) {
    if (id.startsWith("editorBracketHighlight.")) assert.equal(parseColor(document.colors[id] ?? "").alpha, 1);
  }
});
