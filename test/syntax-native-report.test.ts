import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { deltaE } from "../src/color";
import { generatePalette, getDefaultParameters } from "../src/model";
import { references } from "../src/shared/reference";
import { editorSamples } from "../src/shared/samples";
import { parseSyntaxParameters, requireRecord } from "../src/shared/validation";
import { fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxAnchors, resolveSyntaxParameters, syntaxAutoModes, syntaxFamilies, syntaxNumericParameterLimits } from "../src/syntax";
import { bracketColorIds, generateBracketPalette } from "../src/syntax/brackets";
import { ThemeMode, syntaxPaletteModes, themeModes } from "../src/shared/types";

const root = path.resolve(__dirname, "..");
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

async function verifyNativeEvidence(mode: ThemeMode): Promise<void> {
  const reference = references[mode];
  const report = requireRecord(JSON.parse(await readFile(path.join(root, "reports", `syntax-evaluation${mode === "light" ? "-light" : ""}.json`), "utf8")), "Native syntax report");
  assert.equal(report.schemaVersion, 8);
  assert.equal(report.passes, true, "Run npm run test:syntax to regenerate failed or stale native evidence.");
  assert.ok(typeof report.tolerance === "number" && Number.isFinite(report.tolerance) && report.tolerance >= 0);
  const source = requireRecord(report.source, "Native syntax source");
  assert.deepEqual(source.vscode, reference.vscode);
  assert.deepEqual(source.theme, reference.theme);
  assert.deepEqual(source.sources, reference.sources);
  assert.equal(source.themeSourcesVerified, true);
  const runtime = requireRecord(source.runtime, "Actual native VS Code runtime");
  assert.ok(typeof runtime.version === "string" && /^\d+\.\d+\.\d+/.test(runtime.version));
  assert.ok(typeof runtime.commit === "string" && /^[0-9a-f]{40}$/.test(runtime.commit));
  const model = fitSyntaxModel(reference);
  const recordedModel = requireRecord(report.model, "Recorded syntax model");
  assert.deepEqual(parseSyntaxParameters(recordedModel.parameters), model.parameters);
  assert.deepEqual(recordedModel.complexity, model.complexity);
  assert.equal(recordedModel.generatedSha256, hash(JSON.stringify(generateSyntax(model, model.parameters))),
    "Generator output changed; run npm run test:syntax against actual VS Code again.");
  const negative = requireRecord(report.negativeControl, "Native negative control");
  assert.equal(negative.detected, true);
  const interactions = requireRecord(report.interactionChecks, "Native syntax interaction checks");
  assert.deepEqual(interactions.colorInputs, [...syntaxFamilies]);
  const witnesses = requireRecord(interactions.colorWitnesses, "Native color-control witnesses");
  assert.deepEqual(Object.keys(witnesses).sort(), [...syntaxFamilies].sort());
  for (const family of syntaxFamilies) {
    const witness = requireRecord(witnesses[family], `Native ${family} witness`);
    assert.ok(editorSamples.some((sample) => sample.file === witness.file));
    assert.ok(typeof witness.changedCharacters === "number" && Number.isSafeInteger(witness.changedCharacters) &&
      witness.changedCharacters > 0, `${family} must change actual native characters.`);
  }
  assert.deepEqual(interactions.globalInputs, Object.keys(syntaxNumericParameterLimits));
  assert.equal(interactions.commentNeutralIsolation, true);
  assert.equal(interactions.neutralChromaReductionOnly, true);
  assert.equal(interactions.independentAdjustments, true);
  assert.equal(interactions.chromaBoost, true);
  assert.equal(interactions.perColorGamut, true);
  assert.deepEqual(interactions.automaticModes, [...syntaxAutoModes]);
  assert.deepEqual(interactions.paletteModes, [...syntaxPaletteModes]);
  assert.equal(interactions.anchoredPalette, true);
  assert.equal(interactions.automaticHandoffs, true);
  assert.equal(interactions.manualResets, true);
  assert.equal(interactions.exactRestore, true);
  assert.equal(interactions.nativeDiffColors, true);
  const brackets = requireRecord(report.bracketChecks, "Native bracket checks");
  assert.equal(brackets.passes, true);
  assert.equal(brackets.chromaBoost, true);
  assert.equal(brackets.automaticModes, true);
  assert.equal(brackets.anchoredPalette, true);
  assert.equal(brackets.whiteForegroundChroma, true);
  assert.equal(brackets.lightModeBlackForegroundChroma, mode === "light" ? true : null);
  assert.equal(brackets.generatedColorCount, bracketColorIds.length);
  const uiParameters = getDefaultParameters(reference);
  const background = generatePalette(reference, uiParameters).colors["editor.background"];
  assert.ok(background);
  assert.equal(brackets.generatedColorsSha256, hash(JSON.stringify(generateBracketPalette(
    resolveSyntaxParameters(model, model.parameters), uiParameters.error, background
  ).colors)), "Bracket palette changed; rerun its native rendering test.");
  const automatic = requireRecord(report.automaticChecks, "Automatic syntax checks");
  assert.equal(automatic.passes, true);
  assert.equal(automatic.themeMode, mode);
  assert.equal(automatic.nativeThemeKind, mode);
  assert.deepEqual(automatic.paletteModes, [...syntaxPaletteModes]);
  const anchored = requireRecord(automatic.anchoredPalette, "Native anchored palette checks");
  assert.equal(anchored.passes, true);
  assert.deepEqual(anchored.primaryColors, ["#a75287", "#2b7d69"]);
  assert.equal(anchored.nativeColorChanges, 2);
  assert.equal(anchored.uiAccentIndependent, true);
  assert.equal(anchored.neutralAndCommentsLinked, true);
  assert.equal(anchored.exactManualHandoff, true);
  if (mode === "light") {
    const floor = requireRecord(automatic.lightnessFloor, "Native Light lower-lightness limit");
    assert.equal(floor.blackTarget, 0.4);
    assert.ok(typeof floor.minimumBlackWheelChroma === "number" && floor.minimumBlackWheelChroma > 0.03);
    assert.ok(typeof floor.blackColoredForegroundCount === "number" && floor.blackColoredForegroundCount >= 4);
  } else {
    assert.equal(automatic.lightnessFloor, null);
  }
  const rolloff = requireRecord(automatic.lightnessRolloff, "Automatic lightness roll-off checks");
  assert.equal(rolloff.whiteTarget, 0.85);
  assert.ok(typeof rolloff.minimumWhiteWheelChroma === "number" && rolloff.minimumWhiteWheelChroma > 0.03);
  assert.ok(typeof rolloff.whiteColoredForegroundCount === "number" && rolloff.whiteColoredForegroundCount >= 4);
  const ui = generatePalette(reference, uiParameters);
  const defaults = getDefaultSyntaxParameters(reference);
  assert.equal(automatic.generatedSha256, hash(JSON.stringify(generateSyntax(model, defaults, getSyntaxAnchors(uiParameters, ui)))),
    "Automatic default colors changed; rerun the native interaction checks.");
  assert.ok(Array.isArray(report.modes));
  assert.equal(report.modes.length, 2);
  const modes = report.modes.map((value) => requireRecord(value, "Native capture mode"));
  assert.deepEqual(modes.map((mode) => mode.mode).sort(), ["grammar-only", "semantic-enabled"]);
  for (const mode of modes) {
    assert.ok(Array.isArray(mode.samples));
    const samples = mode.samples.map((value) => requireRecord(value, "Native sample result"));
    assert.deepEqual(samples.map((sample) => sample.file).sort(), editorSamples.map((sample) => sample.file).sort());
    for (const sample of samples) {
      assert.ok(typeof sample.file === "string");
      const content = await readFile(path.join(root, "samples", sample.file));
      assert.equal(sample.sha256, hash(content),
        `${sample.file} changed; recapture its actual native syntax colors.`);
      const comparison = requireRecord(sample.comparison, "Native color comparison");
      assert.equal(comparison.passes, true);
      assert.equal(comparison.withinTolerancePercent, 100);
      assert.ok(typeof comparison.count === "number" && comparison.count > 0);
      assert.equal(comparison.count, content.toString("utf8").replace(/\s/g, "").length,
        "Every non-whitespace source character must be scored.");
      assert.ok(Array.isArray(comparison.pairs));
      let count = 0;
      let maximum = 0;
      for (const value of comparison.pairs) {
        const pair = requireRecord(value, "Native foreground pair");
        assert.ok(typeof pair.reference === "string" && typeof pair.generated === "string");
        assert.ok(typeof pair.count === "number" && Number.isSafeInteger(pair.count) && pair.count > 0);
        const error = deltaE(pair.reference, pair.generated);
        // Electron and Node can differ in their final floating-point bits.
        // Both threshold checks remain strict.
        assert.ok(typeof pair.deltaE === "number" && Math.abs(pair.deltaE - error) < 1e-10);
        assert.ok(pair.deltaE <= report.tolerance);
        assert.ok(error <= report.tolerance, `${sample.file} has an out-of-tolerance native color.`);
        count += pair.count;
        maximum = Math.max(maximum, error);
      }
      assert.equal(count, comparison.count);
      assert.ok(typeof comparison.maxError === "number" && Math.abs(maximum - comparison.maxError) < 1e-10);
    }
  }
}

for (const mode of themeModes) {
  test(`${mode} native evidence covers the current model, pinned sources, and all sample files`, () => verifyNativeEvidence(mode));
}
