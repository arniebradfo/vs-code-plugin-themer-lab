import assert from "node:assert/strict";
import { test } from "node:test";
import { deltaE } from "../src/color";
import { compareNativeForegrounds, SyntaxLine } from "../src/syntax/evaluation";

function line(text: string, color: string): SyntaxLine {
  return { text, runs: text.length > 0 ? [{ start: 0, end: text.length, color }] : [] };
}

test("native comparison measures every non-whitespace character, not token-span counts", () => {
  const reference = [line("a b\t", "#ffffff")];
  const generated = [{
    text: "a b\t",
    runs: [
      { start: 0, end: 1, color: "#ffffff" },
      { start: 1, end: 2, color: "#000000" },
      { start: 2, end: 3, color: "#ffffff" },
      { start: 3, end: 4, color: "#000000" }
    ]
  }];
  const result = compareNativeForegrounds(reference, generated, 0);
  assert.equal(result.count, 2);
  assert.equal(result.withinTolerancePercent, 100);
  assert.equal(result.exactMatchPercent, 100);
  assert.equal(result.passes, true);
});

test("native threshold comparisons are exact and configurable", () => {
  const source = [line("keyword", "#ff7b72")];
  const generated = [line("keyword", "#00ff00")];
  const error = deltaE("#ff7b72", "#00ff00");
  const boundary = compareNativeForegrounds(source, generated, error);
  assert.equal(boundary.passes, true);
  assert.equal(boundary.maxError, error);
  assert.equal(compareNativeForegrounds(source, generated, error - 0.000001).passes, false);
  for (const tolerance of [-1, Infinity, NaN]) {
    assert.throws(() => compareNativeForegrounds(source, generated, tolerance), /tolerance/i);
  }
});

test("native capture rejects missing, duplicated, overlapping, and invalid-color coverage", () => {
  const source = [line("abc", "#ffffff")];
  const runs = source[0]?.runs;
  assert.ok(runs);
  for (const invalid of [
    [],
    [{ start: 1, end: 3, color: "#ffffff" }],
    [{ start: 0, end: 2, color: "#ffffff" }],
    [{ start: 0, end: 4, color: "#ffffff" }],
    [{ start: 0, end: 3, color: "#ffffff" }, { start: 0, end: 3, color: "#ffffff" }],
    [{ start: 0, end: 3, color: "#ffffff00" }],
    [{ start: 0, end: NaN, color: "#ffffff" }]
  ]) {
    assert.throws(() => compareNativeForegrounds(source, [{ text: "abc", runs: invalid }]), /syntax|capture/i);
  }
  assert.throws(() => compareNativeForegrounds(source, []), /line counts/);
  assert.throws(() => compareNativeForegrounds(source, [line("abd", "#ffffff")]), /source text/);
});

test("empty native samples never report a successful fidelity test", () => {
  const empty = compareNativeForegrounds([line("", "#ffffff")], [line("", "#ffffff")]);
  assert.equal(empty.count, 0);
  assert.equal(empty.withinTolerancePercent, 0);
  assert.equal(empty.passes, false);
});

test("native statistics are character-weighted and preserve actionable outlier positions", () => {
  const result = compareNativeForegrounds(
    [line("aaa b", "#ffffff")],
    [{ text: "aaa b", runs: [
      { start: 0, end: 4, color: "#ffffff" },
      { start: 4, end: 5, color: "#000000" }
    ] }],
    3
  );
  assert.equal(result.count, 4);
  assert.equal(result.meanError, 25);
  assert.equal(result.withinTolerancePercent, 75);
  assert.ok(Math.abs(result.p95Error - 85) < 1e-10);
  assert.equal(result.maxError, 100);
  assert.equal(result.pairs[0]?.line, 1);
  assert.equal(result.pairs[0]?.column, 5);
  assert.equal(result.pairs[0]?.example, "aaa b");
});
