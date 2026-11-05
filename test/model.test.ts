import assert from "node:assert/strict";
import { test } from "node:test";
import { compositeColors, contrastRatio, deltaE, parseColor, toOklab, toOklch } from "../src/color";
import {
  evaluatePalette,
  fitModel,
  generatePalette,
  getDefaultParameters,
  inspectPalette,
  modelDefinition
} from "../src/model";
import { reference, references } from "../src/shared/reference";
import { fixedScrollbarOpacityPattern, supplementalColors, supplementalSeverityColors } from "../src/model/rules";
import { changeParameters, infoSources, numericParameterLimits, personalityDefaults, severityParameters, themeModes } from "../src/shared/types";
import { personalityFixedRuleCount } from "../src/model/personality";
import type { ChangeKind, ReferenceTheme, Severity, ThemeParameters } from "../src/shared/types";
import { createReport, parseEvaluationArguments, reportMarkdown } from "../tools/evaluate";

const defaults = getDefaultParameters(reference);
const unscoredIds = Object.keys(supplementalColors).filter((id) => !Object.hasOwn(reference.colors, id));

function close(actual: number, expected: number, tolerance = 0.0001): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function theme(colors: Record<string, string | null>): ReferenceTheme {
  return {
    ...reference,
    colors: Object.fromEntries(Object.entries(colors).map(([id, value]) => [id, { value, source: "test" }])),
    tokenColors: [],
    semanticTokenColors: {}
  };
}

function color(colors: Record<string, string>, id: string): string {
  const value = colors[id];
  assert.ok(value !== undefined, `Expected color ${id}`);
  return value;
}

test("fits use nine explicit anchors and a default Info link and honestly report model size and coverage", () => {
  assert.equal(Object.keys(reference.colors).length, 324);
  assert.equal(reference.tokenColors.length, 118);
  assert.equal(Object.keys(reference.semanticTokenColors).length, 4);
  assert.deepEqual(defaults, {
    mode: "dark",
    background: "#121314", foreground: "#bfbfbf", accent: "#297aa0",
    infoSource: "accent",
    info: "#3a94bc", warning: "#cca700", error: "#f48771",
    added: "#73c991", deleted: "#f48771", modified: "#e5ba7d",
    surfaceSpread: 1, mutedContrast: 1, borderStrength: 1, overlayOpacity: 1, ...personalityDefaults
  });
  const fit = fitModel(reference);
  assert.equal(fit.controlCount, 19);
  assert.equal(fit.controlCount, Object.keys(fit.parameters).length);
  assert.equal(fit.fixedRuleCount, Object.keys(modelDefinition.families).length + Object.keys(modelDefinition.opacities).length + 2 + personalityFixedRuleCount);
  assert.equal(modelDefinition.infoLightnessLift, 0.08);
  assert.equal(fit.exceptionCount, fit.palette.coverage.preserved);
  assert.equal(fit.evaluation.tolerance, 3);
  assert.equal(fit.palette.coverage.generated, 305);
  assert.equal(fit.palette.coverage.preserved, 19);
  const coverage = fit.palette.coverage;
  assert.equal(coverage.generated + coverage.preserved + coverage.unresolved, 324);
  assert.equal(Object.keys(fit.palette.colors).length, coverage.generated + coverage.preserved + coverage.unscoredGenerated);
  assert.ok(Number.isFinite(fit.evaluation.meanError));
  assert.ok(fit.evaluation.withinTolerancePercent >= 0 && fit.evaluation.withinTolerancePercent <= 100);
});

test("the single model is deterministic and does not claim learned coefficients", () => {
  const fit = fitModel(reference, 2);
  assert.deepEqual(fitModel(reference, 2), fit);
  assert.deepEqual(fit.palette, generatePalette(reference, fit.parameters));
  assert.deepEqual(fit.evaluation, evaluatePalette(reference, fit.palette, 2));
  assert.equal(modelDefinition.learnedCoefficientCount, 0);
  assert.equal(modelDefinition.perTokenResidualCount, 0);
});

test("generated families never depend on per-token source RGB or alpha corrections", () => {
  const baseline = generatePalette(reference, defaults);
  const editedReference = structuredClone(reference);
  for (const [id, role] of Object.entries(baseline.roles)) {
    if (role !== "preserved") {
      const entry = editedReference.colors[id];
      if (entry) {
        entry.value = "#ff00ff01";
      } else {
        assert.ok(Object.hasOwn(supplementalColors, id));
      }
    }
  }
  const regenerated = generatePalette(editedReference, defaults);
  assert.deepEqual(regenerated, baseline);
});

test("other semantic statuses stay preserved even when numerically identical to the accent", () => {
  const input = structuredClone(reference);
  const extra = [
    "terminal.ansiBlue", "testing.runAction",
    "myExtension.signalColor", "myExtension.background"
  ];
  for (const id of extra) {
    input.colors[id] = { value: defaults.accent, source: "test" };
  }
  const palette = generatePalette(input, {
    ...defaults, accent: "#c22b82", background: "#202032", foreground: "#ebd7bc",
    surfaceSpread: 3, borderStrength: -2, overlayOpacity: 0
  });
  const preserved = [
    ...extra,
    "gitDecoration.conflictingResourceForeground", "gitDecoration.ignoredResourceForeground",
    "statusBar.debuggingBackground", "statusBarItem.remoteBackground", "charts.blue"
  ];
  for (const id of preserved) {
    assert.equal(palette.roles[id], "preserved", id);
    assert.equal(palette.colors[id], input.colors[id]?.value, id);
  }
  assert.notEqual(palette.colors["button.background"], reference.colors["button.background"]?.value);
});

test("custom Info, Warning, and Error independently drive their marks, validation colors, and badges", () => {
  const directMarks: Record<Severity, readonly string[]> = {
    info: ["notificationsInfoIcon.foreground", "editorInfo.foreground"],
    warning: ["notificationsWarningIcon.foreground", "list.warningForeground",
      "editorOverviewRuler.warningForeground", "editorWarning.foreground", "activityWarningBadge.background"],
    error: ["errorForeground", "notificationsErrorIcon.foreground", "list.errorForeground",
      "editorOverviewRuler.errorForeground", "editorError.foreground", "activityErrorBadge.background"]
  };
  const parameters: ThemeParameters = { ...defaults, infoSource: "custom" };
  const baseline = generatePalette(reference, parameters);
  for (const severity of severityParameters) {
    const palette = generatePalette(reference, { ...parameters, [severity]: "#8855EE" });
    for (const id of directMarks[severity]) {
      assert.equal(palette.colors[id], "#8855ee", `${severity}: ${id}`);
      assert.equal(palette.roles[id], severity, id);
    }
    for (const suffix of ["Background", "Border"]) {
      const id = `inputValidation.${severity}${suffix}`;
      assert.notEqual(palette.colors[id], baseline.colors[id], id);
      assert.notEqual(palette.colors[id], "#8855ee", id);
      assert.equal(palette.roles[id], severity, id);
    }
    assert.equal(palette.colors[`inputValidation.${severity}Foreground`], baseline.colors.foreground);
    for (const other of severityParameters.filter((value) => value !== severity)) {
      for (const id of [...directMarks[other], `inputValidation.${other}Background`, `inputValidation.${other}Border`]) {
        assert.equal(palette.colors[id], baseline.colors[id], `${severity} must not alter ${id}`);
      }
    }
    for (const id of ["editor.background", "foreground", "button.background", "button.foreground",
      "panel.border", "gitDecoration.addedResourceForeground", "diffEditor.removedLineBackground"]) {
      assert.equal(palette.colors[id], baseline.colors[id], id);
    }
  }
});

test("default linked Info keeps the accent hue, lifts lightness, and fits the native Info within tolerance", () => {
  const palette = generatePalette(reference, defaults);
  const info = color(palette.colors, "notificationsInfoIcon.foreground");
  const source = toOklch(defaults.accent);
  const generated = toOklch(info);
  assert.equal(info, "#4492b9");
  assert.notEqual(info, defaults.accent);
  close(generated.l - source.l, 0.08, 0.003);
  close(generated.c, source.c, 0.003);
  close(generated.h ?? 0, source.h ?? 0, 1);
  assert.ok(deltaE(info, defaults.info) <= 3);
  assert.equal(palette.colors["editorInfo.foreground"], info);
  assert.equal(defaults.info, "#3a94bc", "The independent custom seed stays at its fitted default.");
  assert.equal(generatePalette(reference, { ...defaults, infoSource: "custom" }).colors["editorInfo.foreground"], defaults.info);
});

test("Info sources follow only their selected anchor and retain the independent custom seed", () => {
  for (const infoSource of infoSources) {
    const parameters: ThemeParameters = {
      ...defaults, infoSource, accent: "#27934d", foreground: "#b0a0c0", info: "#8855ee"
    };
    const snapshot = { ...parameters };
    const baseline = generatePalette(reference, parameters);
    const info = color(baseline.colors, "editorInfo.foreground");
    if (infoSource === "custom") assert.equal(info, parameters.info);
    for (const key of ["accent", "foreground", "info"] as const) {
      const edited = generatePalette(reference, { ...parameters, [key]: "#8060b0" });
      const active = key === (infoSource === "custom" ? "info" : infoSource);
      for (const [id, role] of Object.entries(baseline.roles)) {
        if (role !== "info") continue;
        if (active) assert.notEqual(edited.colors[id], baseline.colors[id], `${infoSource}/${key}/${id}`);
        else assert.equal(edited.colors[id], baseline.colors[id], `${infoSource}/${key}/${id}`);
      }
      for (const id of ["editorWarning.foreground", "editorError.foreground",
        "gitDecoration.addedResourceForeground", "diffEditor.removedLineBackground"]) {
        assert.equal(edited.colors[id], baseline.colors[id], id);
      }
    }
    assert.deepEqual(parameters, snapshot, "Generating linked Info must not overwrite the custom seed.");
    const custom = generatePalette(reference, { ...parameters, infoSource: "custom" });
    assert.equal(custom.colors["editorInfo.foreground"], "#8855ee");
  }
});

test("linked Info preserves hue through gamut limiting and keeps gray, white, and black anchors neutral", () => {
  for (const infoSource of ["accent", "foreground"] as const) {
    for (const anchor of ["#297aa0", "#27934d", "#c22b82", "#00ffff", "#ff0000",
      "#fdfcff", "#888888", "#ffffff", "#000000"]) {
      const palette = generatePalette(reference, { ...defaults, infoSource, [infoSource]: anchor });
      const info = toOklch(color(palette.colors, "editorInfo.foreground"));
      const source = toOklch(anchor);
      close(info.l, Math.min(1, source.l + 0.08), 0.005);
      assert.ok(info.c <= source.c + 0.003, `${infoSource}/${anchor}: no chroma boost`);
      if (source.c < 0.002) {
        assert.ok(info.c < 0.002, `${infoSource}/${anchor}: no invented hue`);
      } else if (info.c > 0.005) {
        const radians = ((info.h ?? 0) - (source.h ?? 0)) * Math.PI / 180;
        assert.ok(Math.abs(info.c * Math.sin(radians)) < 0.003, `${infoSource}/${anchor}: hue retained`);
      }
    }
  }
});

test("Added, Deleted, and Modified independently recolor file labels, markers, and diff or merge backgrounds", () => {
  const direct: Record<ChangeKind, readonly string[]> = {
    added: ["gitDecoration.addedResourceForeground", "gitDecoration.untrackedResourceForeground",
      "editorGutter.addedBackground", "editorOverviewRuler.addedForeground", "minimapGutter.addedBackground",
      "diffEditorOverview.insertedForeground", "scmGraph.historyItemHoverAdditionsForeground"],
    deleted: ["gitDecoration.deletedResourceForeground", "gitDecoration.stageDeletedResourceForeground",
      "editorGutter.deletedBackground", "editorOverviewRuler.deletedForeground", "minimapGutter.deletedBackground",
      "diffEditorOverview.removedForeground", "scmGraph.historyItemHoverDeletionsForeground"],
    modified: ["gitDecoration.modifiedResourceForeground", "gitDecoration.stageModifiedResourceForeground",
      "gitDecoration.renamedResourceForeground", "editorGutter.modifiedBackground",
      "editorOverviewRuler.modifiedForeground", "minimapGutter.modifiedBackground", "chat.editedFileForeground"]
  };
  const backgrounds: Record<ChangeKind, readonly string[]> = {
    added: ["diffEditor.insertedLineBackground", "diffEditor.insertedTextBackground", "diffEditorGutter.insertedLineBackground"],
    deleted: ["diffEditor.removedLineBackground", "diffEditor.removedTextBackground", "diffEditorGutter.removedLineBackground"],
    modified: ["mergeEditor.change.background", "mergeEditor.change.word.background", "mergeEditor.changeBase.background"]
  };
  const baseline = generatePalette(reference, defaults);
  for (const kind of changeParameters) {
    const palette = generatePalette(reference, { ...defaults, [kind]: "#00AEFF" });
    for (const id of direct[kind]) {
      assert.equal(palette.colors[id], "#00aeff", id);
      assert.equal(palette.roles[id], kind, id);
    }
    for (const id of backgrounds[kind]) {
      const value = color(palette.colors, id);
      assert.equal(value.slice(0, 7), "#00aeff", "Transparent fills must retain the selected source RGB.");
      assert.ok((parseColor(value).alpha ?? 1) < 1, id);
      assert.notEqual(value, baseline.colors[id], id);
      assert.equal(palette.roles[id], kind, id);
    }
    for (const [id, value] of Object.entries(baseline.colors)) {
      if (baseline.roles[id] !== kind) assert.equal(palette.colors[id], value, `${kind} must not change ${id}`);
    }
    assert.equal(palette.colors["diffEditor.modifiedLineBackground"], undefined, "VS Code replacements use removed plus inserted colors.");
    assert.equal(palette.colors["notebook.diffInsertedCellBackground"], undefined, "Undocumented, unsupported token IDs must not be invented.");
  }
});

test("change backgrounds remain translucent and follow overlay opacity without changing file-label colors", () => {
  for (const overlayOpacity of [0, 1, 2]) {
    const palette = generatePalette(reference, { ...defaults, added: "#8855ee", deleted: "#00aeff", overlayOpacity, borderStrength: -2 });
    assert.equal(palette.colors["gitDecoration.addedResourceForeground"], "#8855ee");
    assert.equal(palette.colors["gitDecoration.deletedResourceForeground"], "#00aeff");
    for (const [id, source, alpha] of [
      ["diffEditor.insertedLineBackground", "#8855ee", 0.15],
      ["diffEditor.insertedTextBackground", "#8855ee", 0.3],
      ["diffEditor.removedLineBackground", "#00aeff", 0.15],
      ["diffEditor.removedTextBackground", "#00aeff", 0.3]
    ] as const) {
      const value = color(palette.colors, id);
      assert.equal(value.slice(0, 7), source);
      assert.equal(parseColor(value).alpha, Math.round(alpha * overlayOpacity * 255) / 255);
      assert.ok((parseColor(value).alpha ?? 1) < 1, id);
    }
  }
});

test("suggestion text, icons and matches stay independent of black-on-bright-accent button and Quick Pick text", () => {
  const ids = [
    "editorSuggestWidget.selectedForeground", "editorSuggestWidget.selectedIconForeground",
    "editorSuggestWidget.focusHighlightForeground"
  ];
  for (const mode of themeModes) {
    const source = references[mode];
    const parameters = getDefaultParameters(source);
    const baseline = generatePalette(source, parameters);
    for (const accent of ["#ffff00", "#00ffff", "#ffffff"]) {
      for (const tintNeutralOverlays of [false, true]) {
        for (const overlayOpacity of [0, 1, 2]) {
          const palette = generatePalette(source, { ...parameters, accent, tintNeutralOverlays, overlayOpacity });
          assert.equal(palette.colors["button.foreground"], "#000000");
          assert.equal(palette.colors["quickInputList.focusForeground"], "#000000",
            "Solid-accent Quick Picks must retain their existing contrasting foreground.");
          const background = compositeColors(color(palette.colors, "editorSuggestWidget.selectedBackground"),
            color(palette.colors, "editorSuggestWidget.background"));
          for (const id of ids) {
            const foreground = color(palette.colors, id);
            assert.equal(foreground, baseline.colors[id], `${mode}/${accent}/${id}`);
            assert.notEqual(foreground, palette.colors["button.foreground"], id);
            assert.equal(palette.roles[id], "text");
            assert.ok(contrastRatio(foreground, background) >= 4.5, `${mode}/${accent}/${overlayOpacity}/${id}`);
          }
        }
      }
    }
    for (const id of ids) {
      const unresolvedSource = structuredClone(source);
      unresolvedSource.colors[id] = { value: null, source: "test" };
      const unresolved = generatePalette(unresolvedSource, parameters);
      assert.equal(unresolved.colors[id], undefined, id);
      assert.ok(inspectPalette(unresolvedSource, unresolved).unresolvedIds.includes(id));
    }
  }
});

test("inline Markdown code follows the accent with readable contrast while its background remains unchanged", () => {
  for (const mode of themeModes) {
    const source = references[mode];
    const parameters = getDefaultParameters(source);
    const baseline = generatePalette(source, parameters);
    for (const accent of [parameters.accent, "#ffff00", "#00ffff", "#ff00ff", "#ffffff", "#000000", "#777777"]) {
      const palette = generatePalette(source, { ...parameters, accent });
      const foreground = color(palette.colors, "textPreformat.foreground");
      const background = color(palette.colors, "textPreformat.background");
      assert.equal(palette.roles["textPreformat.foreground"], "accent");
      assert.equal(background, baseline.colors["textPreformat.background"]);
      assert.equal(parseColor(foreground).alpha, 1);
      assert.ok(contrastRatio(foreground, background) >= 4.5, `${mode}/${accent}: ${foreground} on ${background}`);
      const seed = toOklch(accent);
      const text = toOklch(foreground);
      if (seed.c > 0.01) {
        const difference = Math.abs((text.h ?? 0) - (seed.h ?? 0));
        assert.ok(Math.min(difference, 360 - difference) < 2, `${mode}/${accent}: preserve accent hue`);
        assert.ok(text.c > 0.01, "Chromatic accents must not turn into neutral inline text.");
      } else {
        assert.ok(text.c < 0.002, "Gray accents must not invent an inline-code hue.");
      }
      assert.equal(generatePalette(source, { ...parameters, accent, mutedContrast: 2 })
        .colors["textPreformat.foreground"], foreground, "Inline code is no longer muted prose.");
      assert.ok(inspectPalette(source, palette).evaluation.contrast
        .some((check) => check.label === "Inline code" && check.passes));
    }
    const unresolvedSource = structuredClone(source);
    unresolvedSource.colors["textPreformat.foreground"] = { value: null, source: "test" };
    assert.equal(generatePalette(unresolvedSource, parameters).colors["textPreformat.foreground"], undefined);
  }
});

test("scrollbar and minimap opacities remain fixed across the overlay slider, including quiet tint", () => {
  for (const mode of themeModes) {
    const source = references[mode];
    for (const tintNeutralOverlays of [false, true]) {
      const parameters = { ...getDefaultParameters(source), accent: "#00ffff", tintNeutralOverlays };
      const baseline = generatePalette(source, parameters);
      const ids = Object.keys(baseline.colors).filter((id) => fixedScrollbarOpacityPattern.test(id));
      assert.equal(ids.length, 7, "All six normal/hover/drag thumbs and the scrollbar shadow are covered.");
      for (const overlayOpacity of [0, 0.5, 1, 2]) {
        const palette = generatePalette(source, { ...parameters, overlayOpacity });
        for (const id of ids) assert.equal(palette.colors[id], baseline.colors[id], `${mode}/${overlayOpacity}/${id}`);
        for (const root of ["scrollbarSlider", "minimapSlider"]) {
          const alpha = (state: string) => parseColor(color(palette.colors, `${root}.${state}Background`)).alpha ?? 1;
          const normal = parseColor(color(palette.colors, `${root}.background`)).alpha ?? 1;
          assert.ok(normal > 0 && normal < alpha("hover") && alpha("hover") < alpha("active") && alpha("active") < 1,
            "Content must remain visible beneath distinct thumb interaction states.");
        }
        if (overlayOpacity !== 1) {
          assert.notEqual(palette.colors["list.activeSelectionBackground"], baseline.colors["list.activeSelectionBackground"]);
          assert.notEqual(palette.colors["diffEditor.insertedTextBackground"], baseline.colors["diffEditor.insertedTextBackground"]);
        }
      }
    }
  }
});

test("supplemental change backgrounds have honest coverage, explicit-null handling, and opacity validation", () => {
  const baseline = generatePalette(reference, defaults);
  const id = "diffEditorGutter.insertedLineBackground";
  const opaque = structuredClone(baseline);
  opaque.colors[id] = "#ffffff";
  assert.throws(() => evaluatePalette(reference, opaque), /required opacity/);
  const invalid = structuredClone(baseline);
  invalid.colors[id] = "red";
  assert.throws(() => evaluatePalette(reference, invalid), /Invalid theme color/);
  const missing = structuredClone(baseline);
  delete missing.colors[id];
  assert.throws(() => evaluatePalette(reference, missing), /missing supplemental/);
  const captured = structuredClone(reference);
  captured.colors[id] = { value: "#11223340", source: "test" };
  const scored = inspectPalette(captured, generatePalette(captured, defaults));
  assert.ok(scored.samples.some((sample) => sample.id === id && sample.role === "added"));
  assert.ok(!scored.unscoredGeneratedIds.includes(id));
  captured.colors[id] = { value: null, source: "test" };
  const unresolved = generatePalette(captured, defaults);
  assert.equal(unresolved.colors[id], undefined);
  assert.ok(inspectPalette(captured, unresolved).unresolvedIds.includes(id));
});

test("diff word backgrounds composite over their matching line background before the canvas", () => {
  const input = theme({
    "editor.background": "#000000",
    "diffEditor.insertedLineBackground": "#ffffff80",
    "diffEditor.insertedTextBackground": "#ffffff80"
  });
  const palette = generatePalette(input, defaults);
  palette.colors["editor.background"] = "#000000";
  palette.colors["diffEditor.insertedLineBackground"] = "#ffffff80";
  palette.colors["diffEditor.insertedTextBackground"] = "#ffffff80";
  const sample = inspectPalette(input, palette).samples.find((sample) => sample.id === "diffEditor.insertedTextBackground");
  assert.ok(sample?.rendered);
  assert.deepEqual(sample.rendered.backgroundIds, ["diffEditor.insertedLineBackground", "editor.background"]);
  assert.equal(sample.rendered.reference, "#c0c0c0");
  assert.equal(sample.rendered.generated, "#c0c0c0");
});

test("filled severity badges automatically choose readable text and do not reuse the fill cache", () => {
  for (const severity of ["warning", "error"] as const) {
    const prefix = severity === "warning" ? "activityWarningBadge" : "activityErrorBadge";
    for (const [source, expected] of [["#00AEFF", "#000000"], ["#0000ff", "#ffffff"]] as const) {
      const palette = generatePalette(reference, { ...defaults, [severity]: source });
      const background = color(palette.colors, `${prefix}.background`);
      const foreground = color(palette.colors, `${prefix}.foreground`);
      assert.equal(background, source.toLowerCase());
      assert.equal(foreground, expected);
      assert.notEqual(foreground, background);
      assert.ok(contrastRatio(foreground, background) >= 4.5);
    }
  }
});

test("supplemental severity and change colors are generated but never inflate reference fidelity", () => {
  const palette = generatePalette(reference, defaults);
  const inspection = inspectPalette(reference, palette);
  assert.deepEqual(inspection.unscoredGeneratedIds, unscoredIds);
  assert.equal(palette.coverage.unscoredGenerated, unscoredIds.length);
  assert.equal(inspection.raw.count, 305);
  assert.equal(inspection.samples.length, palette.coverage.generated);
  for (const [id, severity] of Object.entries(supplementalSeverityColors)) {
    assert.equal(palette.colors[id], severity === "info" ? palette.colors["notificationsInfoIcon.foreground"] : defaults[severity]);
    assert.equal(palette.roles[id], severity);
    assert.ok(!inspection.samples.some((sample) => sample.id === id));
  }
});

test("explicit severity references are scored while explicit nulls remain unresolved", () => {
  const explicit = structuredClone(reference);
  explicit.colors["editorInfo.foreground"] = { value: "#112233", source: "test" };
  const scored = generatePalette(explicit, defaults);
  const scoredInspection = inspectPalette(explicit, scored);
  assert.equal(scored.coverage.unscoredGenerated, unscoredIds.length - 1);
  assert.equal(scored.coverage.generated, 306);
  assert.ok(scoredInspection.samples.some(({ id }) => id === "editorInfo.foreground"));
  assert.ok(!scoredInspection.unscoredGeneratedIds.includes("editorInfo.foreground"));
  explicit.colors["editorInfo.foreground"] = { value: null, source: "test" };
  const unresolved = generatePalette(explicit, defaults);
  assert.equal(unresolved.colors["editorInfo.foreground"], undefined);
  assert.equal(unresolved.roles["editorInfo.foreground"], undefined);
  assert.equal(unresolved.coverage.unresolved, 1);
  assert.equal(unresolved.coverage.unscoredGenerated, unscoredIds.length - 1);
  assert.ok(inspectPalette(explicit, unresolved).unresolvedIds.includes("editorInfo.foreground"));
});

test("unscored severity coverage still rejects missing, transparent, misclassified, or fabricated outputs", () => {
  const palette = generatePalette(reference, defaults);
  const missing = structuredClone(palette);
  delete missing.colors["editorInfo.foreground"];
  assert.throws(() => evaluatePalette(reference, missing), /missing supplemental/);
  const alpha = structuredClone(palette);
  alpha.colors["editorInfo.foreground"] = "#11223380";
  assert.throws(() => evaluatePalette(reference, alpha), /required opacity/);
  const role = structuredClone(palette);
  role.roles["editorInfo.foreground"] = "text";
  assert.throws(() => evaluatePalette(reference, role), /role info/);
  const wrongCount = structuredClone(palette);
  wrongCount.coverage.unscoredGenerated++;
  assert.throws(() => evaluatePalette(reference, wrongCount), /coverage.unscoredGenerated/);
  const invented = structuredClone(palette);
  invented.colors["future.unregisteredSeverity"] = "#112233";
  assert.throws(() => evaluatePalette(reference, invented), /outside explicit reference coverage/);
});

test("inactive tabs and active window chrome are structural surfaces, not active-control fills", () => {
  const input = structuredClone(reference);
  input.colors["input.inactiveBackground"] = { value: "#191a1b", source: "test" };
  input.colors["input.activeBackground"] = { value: "#313233", source: "test" };
  for (const parameters of [defaults, { ...defaults, background: "#242133" }]) {
    const palette = generatePalette(input, parameters);
    const chrome = color(palette.colors, "sideBar.background");
    for (const id of ["tab.inactiveBackground", "tab.unfocusedInactiveBackground", "titleBar.activeBackground",
      "input.inactiveBackground"]) {
      assert.equal(palette.roles[id], "surface", id);
      assert.equal(palette.colors[id], chrome, id);
    }
    assert.notEqual(palette.colors["input.activeBackground"], chrome);
    assert.equal(palette.colors["input.activeBackground"], palette.colors["activityBar.activeBackground"]);
    close(toOklab(chrome).l - toOklab(color(palette.colors, "editor.background")).l, 0.03, 0.005);
  }
});

test("navigation selection, list selection, and selected tabs use distinct shared text semantics", () => {
  for (const parameters of [defaults, { ...defaults, foreground: "#9aaac0" }]) {
    const palette = generatePalette(reference, parameters);
    assert.equal(palette.roles["breadcrumb.activeSelectionForeground"], "text");
    assert.equal(palette.colors["breadcrumb.activeSelectionForeground"], palette.colors.foreground);
    const normal = toOklab(color(palette.colors, "breadcrumb.activeSelectionForeground")).l;
    const selectedList = toOklab(color(palette.colors, "list.activeSelectionForeground")).l;
    const selectedTab = toOklab(color(palette.colors, "tab.selectedForeground")).l;
    assert.ok(normal < selectedList && selectedList < selectedTab);
  }
  assert.equal(generatePalette(reference, defaults).colors["tab.selectedForeground"], "#ffffff");
});

test("accent-filled controls automatically switch black/white text without changing neutral or status text", () => {
  const pairs = [
    ["button.foreground", "button.background"],
    ["extensionButton.prominentForeground", "extensionButton.prominentBackground"],
    ["badge.foreground", "badge.background"],
    ["activityBarBadge.foreground", "activityBarBadge.background"],
    ["agentsBadge.foreground", "agentsBadge.background"],
    ["agentsUnreadBadge.foreground", "agentsUnreadBadge.background"],
    ["quickInputList.focusForeground", "quickInputList.focusBackground"],
    ["quickInputList.focusHighlightForeground", "quickInputList.focusBackground"],
    ["quickInputList.focusIconForeground", "quickInputList.focusBackground"]
  ] as const;
  const baseline = generatePalette(reference, defaults);
  for (const [accent, expected] of [
    ["#00AEFF", "#000000"], ["#ffffff", "#000000"], ["#ffff00", "#000000"],
    ["#297aa0", "#ffffff"], ["#0000ff", "#ffffff"], ["#000000", "#ffffff"]
  ] as const) {
    const palette = generatePalette(reference, { ...defaults, accent });
    for (const [foreground, background] of pairs) {
      assert.equal(palette.colors[foreground], expected, `${accent}: ${foreground}`);
      assert.equal(palette.roles[foreground], "text", foreground);
      assert.ok(contrastRatio(color(palette.colors, foreground), color(palette.colors, background)) >= 4.5, foreground);
    }
    for (const id of ["foreground", "editor.foreground", "button.secondaryForeground",
      "tab.selectedForeground", "list.activeSelectionForeground", "list.activeSelectionIconForeground",
      "statusBarItem.hoverForeground", "activityErrorBadge.foreground", "activityWarningBadge.foreground"]) {
      assert.equal(palette.colors[id], baseline.colors[id], id);
    }
  }
});

test("on-accent text ignores primary text and shape inputs and switches back with a darker accent", () => {
  const bright = generatePalette(reference, { ...defaults, accent: "#00aeff" });
  const shaped = generatePalette(reference, {
    ...defaults, accent: "#00aeff", foreground: "#223344", background: "#e8e0dd",
    surfaceSpread: 3, mutedContrast: 0.25, borderStrength: -2, overlayOpacity: 0
  });
  assert.equal(shaped.colors["button.foreground"], "#000000");
  assert.equal(shaped.colors["button.foreground"], bright.colors["button.foreground"]);
  assert.equal(shaped.colors["badge.foreground"], bright.colors["badge.foreground"]);
  const dark = generatePalette(reference, { ...defaults, accent: "#0000ff" });
  assert.equal(dark.colors["button.foreground"], "#ffffff");
  assert.notEqual(dark.colors["button.foreground"], bright.colors["button.foreground"]);
  assert.ok(contrastRatio("#000000", color(bright.colors, "button.background")) >
    contrastRatio("#ffffff", color(bright.colors, "button.background")));
  const buttonChecks = evaluatePalette(reference, bright).contrast.filter(({ label }) =>
    label === "Primary button text" || label === "Primary button hover text");
  assert.equal(buttonChecks.length, 2);
  assert.ok(buttonChecks.every(({ foreground, passes }) => foreground === "#000000" && passes));
});

test("edited-file status follows Modified while slash-command colors stay generated and scored", () => {
  const baseline = generatePalette(reference, defaults);
  assert.deepEqual(baseline.coverage, { total: 324, generated: 305, preserved: 19, unresolved: 0, unscoredGenerated: unscoredIds.length });
  assert.equal(baseline.roles["chat.editedFileForeground"], "modified");
  assert.equal(baseline.colors["chat.editedFileForeground"], defaults.modified);
  const edited = generatePalette(reference, { ...defaults, accent: "#ac497c", foreground: "#c8d8ee" });
  assert.equal(edited.colors["chat.editedFileForeground"], baseline.colors["chat.editedFileForeground"]);
  const inspection = inspectPalette(reference, baseline);
  assert.equal(inspection.raw.count, 305);
  assert.ok(!inspection.preservedIds.includes("chat.editedFileForeground"));
  assert.ok(inspection.samples.some(({ id }) => id === "chat.editedFileForeground"));
  for (const id of ["chat.slashCommandBackground", "chat.slashCommandForeground"]) {
    assert.equal(baseline.roles[id], "accent");
    assert.notEqual(edited.colors[id], baseline.colors[id]);
    assert.ok(inspection.samples.some((sample) => sample.id === id && sample.deltaE > 0));
  }
});

test("background, foreground, and accent edits propagate to shared families without changing syntax", () => {
  const before = JSON.stringify(reference);
  const normal = generatePalette(reference, defaults);
  const edited = generatePalette(reference, {
    ...defaults, background: "#202132", foreground: "#e2e6f2", accent: "#ac497c"
  });
  for (const id of ["editor.background", "sideBar.background", "editorWidget.background", "input.foreground",
    "descriptionForeground", "button.background", "textLink.foreground", "editor.selectionBackground"]) {
    assert.notEqual(edited.colors[id], normal.colors[id], id);
  }
  assert.equal(JSON.stringify(reference), before);
  const canvas = toOklab(color(edited.colors, "editor.background")).l;
  const chrome = toOklab(color(edited.colors, "sideBar.background")).l;
  const raised = toOklab(color(edited.colors, "editorWidget.background")).l;
  const control = toOklab(color(edited.colors, "checkbox.background")).l;
  assert.ok(canvas < chrome && chrome < raised && raised < control);
  assert.equal(edited.coverage.total, 324);
});

test("surface hierarchy also moves toward a darker foreground for a light background edit", () => {
  const palette = generatePalette(reference, { ...defaults, background: "#eeeeee", foreground: "#222222" });
  const canvas = toOklab(color(palette.colors, "editor.background")).l;
  const chrome = toOklab(color(palette.colors, "sideBar.background")).l;
  const raised = toOklab(color(palette.colors, "editorWidget.background")).l;
  assert.ok(canvas > chrome && chrome > raised);
});

test("normal/hover button colors and translucent hover states are meaningfully distinct", () => {
  const palette = generatePalette(reference, defaults);
  const button = toOklch(color(palette.colors, "button.background"));
  const hover = toOklch(color(palette.colors, "button.hoverBackground"));
  assert.ok(hover.l - button.l > 0.005);
  const normalBubble = parseColor(color(palette.colors, "chat.requestBubbleBackground")).alpha ?? 1;
  const hoverBubble = parseColor(color(palette.colors, "chat.requestBubbleHoverBackground")).alpha ?? 1;
  assert.ok(hoverBubble - normalBubble > 0.04);
  assert.notEqual(palette.colors["tab.activeBackground"], palette.colors["tab.hoverBackground"]);
  assert.ok(
    (parseColor(color(palette.colors, "scrollbarSlider.hoverBackground")).alpha ?? 0) >
    (parseColor(color(palette.colors, "scrollbarSlider.background")).alpha ?? 0)
  );
});

test("every available input affects the single model when its source is selected", () => {
  const baseline = generatePalette(reference, defaults);
  const cases: { edit: Partial<ThemeParameters>; id: string }[] = [
    { edit: { background: "#202032" }, id: "editor.background" },
    { edit: { foreground: "#e2e6f2" }, id: "foreground" },
    { edit: { accent: "#27934d" }, id: "button.background" },
    { edit: { infoSource: "foreground" }, id: "notificationsInfoIcon.foreground" },
    { edit: { infoSource: "custom", info: "#8855ee" }, id: "notificationsInfoIcon.foreground" },
    { edit: { warning: "#f09020" }, id: "notificationsWarningIcon.foreground" },
    { edit: { error: "#dd2255" }, id: "errorForeground" },
    { edit: { surfaceSpread: 3 }, id: "sideBar.background" },
    { edit: { mutedContrast: 1.5 }, id: "descriptionForeground" },
    { edit: { borderStrength: -1 }, id: "panel.border" },
    { edit: { overlayOpacity: 0 }, id: "editor.selectionBackground" }
  ];
  for (const { edit, id } of cases) {
    assert.notEqual(generatePalette(reference, { ...defaults, ...edit }).colors[id], baseline.colors[id], id);
  }
});

test("surface separation and muted text controls change only their intended dimensions", () => {
  const baseline = generatePalette(reference, defaults);
  const spread = generatePalette(reference, { ...defaults, surfaceSpread: 3 });
  close(
    toOklab(color(spread.colors, "sideBar.background")).l - toOklab(color(spread.colors, "editor.background")).l,
    0.09, 0.005
  );
  assert.equal(spread.colors.foreground, baseline.colors.foreground);
  assert.equal(spread.colors["panel.border"], baseline.colors["panel.border"]);
  const muted = generatePalette(reference, { ...defaults, mutedContrast: 1.5 });
  assert.ok(toOklab(color(muted.colors, "descriptionForeground")).l >
    toOklab(color(baseline.colors, "descriptionForeground")).l);
  assert.equal(muted.colors.foreground, baseline.colors.foreground);
  assert.equal(spread.colors["button.background"], baseline.colors["button.background"]);
  assert.equal(muted.colors["button.background"], baseline.colors["button.background"]);
});

test("signed surface separation flattens and reverses canvas-derived layers in dark and light palettes", () => {
  const surfaces = ["sideBar.background", "titleBar.activeBackground", "editorWidget.background",
    "checkbox.background", "list.inactiveSelectionBackground", "statusBarItem.activeBackground"];
  for (const anchors of [
    { background: "#484050", foreground: "#c0d0e0" },
    { background: "#b0a8b8", foreground: "#302838" }
  ]) {
    const parameters = { ...defaults, ...anchors };
    const normal = generatePalette(reference, parameters);
    const flat = generatePalette(reference, { ...parameters, surfaceSpread: 0 });
    const inverted = generatePalette(reference, { ...parameters, surfaceSpread: -0.5 });
    const canvas = toOklab(parameters.background).l;
    const background = parseColor(parameters.background);
    const direction = toOklab(parameters.foreground).l > canvas ? 1 : -1;
    for (const id of surfaces) {
      assert.equal(flat.roles[id], "surface", id);
      const flatColor = parseColor(color(flat.colors, id));
      close(flatColor.r, background.r);
      close(flatColor.g, background.g);
      close(flatColor.b, background.b);
      assert.ok((toOklab(color(normal.colors, id)).l - canvas) * direction > 0, id);
      assert.ok((toOklab(color(inverted.colors, id)).l - canvas) * direction < 0, id);
      close(toOklab(color(inverted.colors, id)).l - canvas,
        -0.5 * (toOklab(color(normal.colors, id)).l - canvas), 0.005);
      assert.equal(flatColor.alpha, parseColor(color(normal.colors, id)).alpha, id);
      assert.equal(parseColor(color(inverted.colors, id)).alpha, flatColor.alpha, id);
    }
    for (const id of ["editor.background", "foreground", "descriptionForeground", "panel.border",
      "button.background", "focusBorder", "editor.selectionBackground", "list.focusBackground",
      "inputValidation.infoBackground", "inputValidation.errorBorder", "diffEditor.insertedLineBackground"]) {
      assert.equal(flat.colors[id], normal.colors[id], id);
      assert.equal(inverted.colors[id], normal.colors[id], id);
    }
  }
});

test("negative surface separation reverses the default layer hierarchy without changing the canvas", () => {
  const palette = generatePalette(reference, { ...defaults, surfaceSpread: -1 });
  const canvas = toOklab(color(palette.colors, "editor.background")).l;
  const chrome = toOklab(color(palette.colors, "sideBar.background")).l;
  const raised = toOklab(color(palette.colors, "editorWidget.background")).l;
  assert.ok(canvas > chrome && chrome > raised);
  assert.equal(palette.colors["editor.background"], defaults.background);
  for (const surfaceSpread of [-3, -1, 0, 1, 3]) {
    const colors = generatePalette(reference, { ...defaults, background: "#606060", surfaceSpread }).colors;
    close(toOklab(color(colors, "sideBar.background")).l - toOklab("#606060").l, 0.03 * surfaceSpread, 0.005);
    close(toOklab(color(colors, "editorWidget.background")).l - toOklab("#606060").l, 0.06 * surfaceSpread, 0.005);
  }
});

test("border and opacity controls affect neutral borders and overlays separately", () => {
  const baseline = generatePalette(reference, defaults);
  const borders = generatePalette(reference, { ...defaults, borderStrength: 2 });
  assert.notEqual(borders.colors["panel.border"], baseline.colors["panel.border"]);
  assert.equal(borders.colors.foreground, baseline.colors.foreground);
  assert.equal(borders.colors["button.background"], baseline.colors["button.background"]);
  const noOverlays = generatePalette(reference, { ...defaults, overlayOpacity: 0 });
  assert.equal(parseColor(color(noOverlays.colors, "editor.selectionBackground")).alpha, 0);
  assert.equal(parseColor(color(noOverlays.colors, "focusBorder")).alpha, 0);
  assert.equal(noOverlays.colors["button.background"], baseline.colors["button.background"]);
  assert.equal(parseColor(color(noOverlays.colors, "diffEditor.insertedTextBackground")).alpha, 0);
  assert.ok((parseColor(color(baseline.colors, "diffEditor.insertedTextBackground")).alpha ?? 0) > 0);
});

test("signed neutral borders pivot around the canvas without recoloring accent or status borders", () => {
  const neutralBorders = ["panel.border", "input.border", "checkbox.border", "editorIndentGuide.activeBackground1", "editorGroup.border"];
  for (const anchors of [
    { background: "#484050", foreground: "#c0d0e0" },
    { background: "#ded8e8", foreground: "#302838" }
  ]) {
    const parameters = { ...defaults, ...anchors };
    const normal = generatePalette(reference, parameters);
    const zero = generatePalette(reference, { ...parameters, borderStrength: 0 });
    const inverted = generatePalette(reference, { ...parameters, borderStrength: -0.5 });
    const canvas = toOklab(parameters.background).l;
    const direction = toOklab(parameters.foreground).l > canvas ? 1 : -1;
    for (const id of neutralBorders) {
      assert.equal(zero.roles[id], "border", id);
      const normalColor = parseColor(color(normal.colors, id));
      const zeroColor = parseColor(color(zero.colors, id));
      const background = parseColor(parameters.background);
      close(zeroColor.r, background.r);
      close(zeroColor.g, background.g);
      close(zeroColor.b, background.b);
      assert.equal(zeroColor.alpha, normalColor.alpha, id);
      assert.ok((toOklab(color(normal.colors, id)).l - canvas) * direction > 0, id);
      assert.ok((toOklab(color(inverted.colors, id)).l - canvas) * direction < 0, id);
      assert.equal(parseColor(color(inverted.colors, id)).alpha, normalColor.alpha, id);
    }
    for (const id of ["button.border", "focusBorder", "inputValidation.errorBorder",
      "editor.background", "sideBar.background", "foreground", "editor.selectionBackground"]) {
      assert.equal(inverted.colors[id], normal.colors[id], id);
      assert.equal(zero.colors[id], normal.colors[id], id);
    }
    assert.equal(zero.colors["browser.border"], normal.colors["browser.border"]);
    assert.equal(inverted.colors["browser.border"], normal.colors["browser.border"]);
  }
});

test("negative neutral borders are darker than the default dark canvas, with finite clamped extremes", () => {
  const palette = generatePalette(reference, { ...defaults, surfaceSpread: 3, borderStrength: -1 });
  const canvas = toOklab(color(palette.colors, "editor.background")).l;
  assert.ok(toOklab(color(palette.colors, "panel.border")).l < canvas);
  assert.ok(toOklab(color(palette.colors, "input.border")).l < canvas);
  assert.ok(toOklab(color(palette.colors, "checkbox.border")).l < canvas);
  assert.equal(palette.colors["editor.background"], defaults.background);
  close(toOklab(color(palette.colors, "sideBar.background")).l - canvas, 0.09, 0.005);
});

test("accent source color controls saturation and lightness without separate shape inputs", () => {
  const baseline = generatePalette(reference, defaults);
  const gray = generatePalette(reference, { ...defaults, accent: "#888888" });
  const lighter = generatePalette(reference, { ...defaults, accent: "#72d0f0" });
  assert.equal(gray.colors["button.background"], "#888888");
  assert.ok(toOklch(color(gray.colors, "textLink.foreground")).c < 0.002);
  assert.ok(toOklch(color(lighter.colors, "button.background")).l >
    toOklch(color(baseline.colors, "button.background")).l);
  for (const palette of [gray, lighter]) {
    assert.equal(palette.colors["editor.background"], baseline.colors["editor.background"]);
    assert.equal(palette.colors["panel.border"], baseline.colors["panel.border"]);
    assert.equal(palette.colors["gitDecoration.addedResourceForeground"], baseline.colors["gitDecoration.addedResourceForeground"]);
  }
});

test("all bounded numeric extremes generate finite valid colors and evaluations", () => {
  for (const endpoint of ["min", "max"] as const) {
    const parameters = { ...defaults };
    for (const key of Object.keys(numericParameterLimits) as (keyof typeof numericParameterLimits)[]) {
      parameters[key] = numericParameterLimits[key][endpoint];
    }
    const palette = generatePalette(reference, parameters);
    for (const value of Object.values(palette.colors)) {
      const parsed = parseColor(value);
      assert.ok([parsed.r, parsed.g, parsed.b, parsed.alpha].every(Number.isFinite));
    }
    const evaluation = evaluatePalette(reference, palette);
    for (const value of [evaluation.meanError, evaluation.p50Error, evaluation.p95Error,
      evaluation.maxError, evaluation.alphaMeanError, evaluation.alphaMaxError, evaluation.withinTolerancePercent]) {
      assert.ok(Number.isFinite(value));
    }
  }
});

test("null entries remain unresolved and missing registered defaults are never invented", () => {
  const input = structuredClone(reference);
  input.colors["future.inheritedColor"] = { value: null, source: "test" };
  const palette = generatePalette(input, defaults);
  assert.equal(palette.coverage.unresolved, 1);
  assert.equal(palette.coverage.total, 325);
  assert.equal(palette.colors["future.inheritedColor"], undefined);
  assert.equal(palette.roles["future.inheritedColor"], undefined);
  assert.equal(palette.colors["notCaptured.registeredDefault"], undefined);
  assert.deepEqual(inspectPalette(input, palette).unresolvedIds, ["future.inheritedColor"]);
});

test("raw error statistics match independent black/white distances and interpolated percentiles", () => {
  const input = theme({ "editor.background": "#000000", foreground: "#ffffff", "button.background": "#ffffff" });
  const palette = generatePalette(input, defaults);
  palette.colors = { ...palette.colors, "editor.background": "#000000", foreground: "#000000", "button.background": "#ffffff" };
  const evaluation = evaluatePalette(input, palette);
  close(evaluation.meanError, 100 / 3);
  close(evaluation.p50Error, 0);
  close(evaluation.p95Error, 90);
  assert.equal(evaluation.maxError, 100);
  close(evaluation.withinTolerancePercent, 200 / 3);
  assert.equal(evaluation.alphaMeanError, 0);
  assert.equal(evaluation.worst[0]?.id, "foreground");
  close(evaluatePalette(input, palette, 0).withinTolerancePercent, 200 / 3);
  assert.equal(evaluatePalette(input, palette, 100).withinTolerancePercent, 100);
  assert.equal(evaluatePalette(input, palette, 99.99999999999999).withinTolerancePercent, 200 / 3);
});

test("fully transparent RGB errors cannot disappear from the primary metric", () => {
  const input = theme({ "editor.background": "#000000", "editor.selectionBackground": "#ff000000" });
  const palette = generatePalette(input, defaults);
  palette.colors["editor.background"] = "#000000";
  palette.colors["editor.selectionBackground"] = "#0000ff00";
  const inspection = inspectPalette(input, palette);
  const sample = inspection.samples.find(({ id }) => id === "editor.selectionBackground");
  assert.ok(sample);
  assert.ok(sample.deltaE > 50);
  assert.equal(sample.renderedDeltaE, 0);
  assert.equal(sample.alphaError, 0);
  assert.equal(inspection.evaluation.withinTolerancePercent, 50);
});

test("alpha mismatch is exposed separately even if raw source RGB is exact", () => {
  const input = theme({ "editor.background": "#000000", "editor.selectionBackground": "#ff000080" });
  const palette = generatePalette(input, defaults);
  palette.colors["editor.background"] = "#000000";
  palette.colors["editor.selectionBackground"] = "#ff000000";
  const inspection = inspectPalette(input, palette);
  assert.equal(inspection.evaluation.maxError, 0);
  close(inspection.evaluation.alphaMaxError, 128 / 255);
  close(inspection.evaluation.alphaMeanError, 64 / 255);
  assert.ok(inspection.rendered.max > 20);
  assert.equal(inspection.alpha.exactMatchPercent, 50);
});

test("transparent list colors use the explicit sidebar backdrop, not an invented black pixel", () => {
  const input = theme({
    "editor.background": "#000000", "sideBar.background": "#ffffff",
    "list.activeSelectionBackground": "#00000080"
  });
  const palette = generatePalette(input, defaults);
  palette.colors = {
    ...palette.colors,
    "editor.background": "#000000", "sideBar.background": "#ffffff",
    "list.activeSelectionBackground": "#ffffff80"
  };
  const sample = inspectPalette(input, palette).samples.find(({ id }) => id === "list.activeSelectionBackground");
  assert.ok(sample?.rendered);
  assert.deepEqual(sample.rendered.backgroundIds, ["sideBar.background"]);
  assert.equal(sample.rendered.reference, "#7f7f7f");
  assert.equal(sample.rendered.generated, "#ffffff");
});

test("transparent colors without any explicit backdrop remain unrendered", () => {
  const input = theme({ "editor.selectionBackground": "#ff000080" });
  const palette = generatePalette(input, defaults);
  palette.colors["editor.selectionBackground"] = "#ff000080";
  const inspection = inspectPalette(input, palette);
  assert.equal(inspection.raw.count, 1);
  assert.equal(inspection.rendered.count, 0);
  assert.deepEqual(inspection.renderedUnavailableIds, ["editor.selectionBackground"]);
  assert.equal(inspection.samples[0]?.renderedDeltaE, null);
});

test("contrast checks agree with black/white and composited gray facts", () => {
  const input = theme({ "editor.background": "#000000", foreground: "#ffffff" });
  const palette = generatePalette(input, defaults);
  palette.colors = { ...palette.colors, "editor.background": "#000000", foreground: "#ffffff" };
  const opaque = evaluatePalette(input, palette).contrast.find(({ label }) => label === "Workbench text on editor");
  assert.ok(opaque);
  close(opaque.ratio, 21);
  assert.equal(opaque.passes, true);
  palette.colors.foreground = "#ffffff80";
  const translucent = evaluatePalette(input, palette).contrast.find(({ label }) => label.startsWith("Workbench text on editor"));
  assert.ok(translucent);
  close(translucent.ratio, 5.31721, 0.001);
  assert.equal(translucent.foreground, "#808080");
  assert.match(translucent.label, /approximation/);
});

test("preserved, null, and empty references cannot inflate generated success rates", () => {
  const input = theme({ "gitDecoration.ignoredResourceForeground": "#00ff00", "missing.color": null });
  const palette = generatePalette(input, defaults);
  const inspection = inspectPalette(input, palette);
  assert.equal(inspection.raw.count, 0);
  assert.equal(inspection.evaluation.withinTolerancePercent, 0);
  assert.equal(inspection.evaluation.meanError, 0);
  assert.deepEqual(inspection.evaluation.worst, []);
  assert.deepEqual(inspection.preservedIds, ["gitDecoration.ignoredResourceForeground"]);
  assert.equal(palette.coverage.preserved, 1);
  assert.equal(palette.coverage.unresolved, 1);
  const empty = theme({});
  assert.equal(evaluatePalette(empty, generatePalette(empty, defaults)).withinTolerancePercent, 0);
});

test("evaluation rejects missing colors, altered preservation, and fabricated role/coverage claims", () => {
  const input = theme({ "editor.background": "#000000", "gitDecoration.ignoredResourceForeground": "#00ff00" });
  const original = generatePalette(input, defaults);
  const missing = structuredClone(original);
  delete missing.colors["editor.background"];
  assert.throws(() => evaluatePalette(input, missing), /missing explicit color/);
  const preserved = structuredClone(original);
  preserved.colors["gitDecoration.ignoredResourceForeground"] = "#ffffff";
  assert.throws(() => evaluatePalette(input, preserved), /Preserved source color/);
  const wrongRole = structuredClone(original);
  wrongRole.roles["editor.background"] = "preserved";
  assert.throws(() => evaluatePalette(input, wrongRole), /role/);
  const wrongCount = structuredClone(original);
  wrongCount.coverage.generated++;
  assert.throws(() => evaluatePalette(input, wrongCount), /coverage.generated/);
  const invented = structuredClone(original);
  invented.colors["notCaptured.background"] = "#000000";
  assert.throws(() => evaluatePalette(input, invented), /outside explicit reference coverage/);
});

test("public APIs reject invalid colors, parameter bounds, and tolerances", () => {
  assert.throws(() => generatePalette(reference, { ...defaults, background: "#abc" }), /six-digit/);
  assert.throws(() => generatePalette(reference, { ...defaults, borderStrength: NaN }), /borderStrength/);
  assert.throws(() => generatePalette(reference, { ...defaults, surfaceSpread: 3.01 }), /surfaceSpread/);
  assert.throws(() => generatePalette(reference, { ...defaults, surfaceSpread: -3.01 }), /surfaceSpread/);
  assert.throws(() => generatePalette(reference, { ...defaults, overlayOpacity: Infinity }), /overlayOpacity/);
  const palette = generatePalette(reference, defaults);
  for (const tolerance of [-1, Infinity, NaN]) {
    assert.throws(() => fitModel(reference, tolerance), /finite nonnegative/);
    assert.throws(() => evaluatePalette(reference, palette, tolerance), /finite nonnegative/);
  }
  const badSource = theme({ "editor.background": "red" });
  assert.throws(() => generatePalette(badSource, defaults), /Invalid theme color/);
  assert.throws(() => fitModel(theme({})), /anchor editor.background/);
  const transparentAnchor = structuredClone(reference);
  transparentAnchor.colors.foreground = { value: "#ffffff80", source: "test" };
  assert.throws(() => fitModel(transparentAnchor), /anchor foreground must be opaque/);
});

test("evaluation CLI validates tolerance and rejects unsupported or ambiguous arguments", () => {
  assert.deepEqual(parseEvaluationArguments([]), { tolerance: 3, mode: "dark" });
  assert.deepEqual(parseEvaluationArguments(["--tolerance", "0"]), { tolerance: 0, mode: "dark" });
  assert.deepEqual(parseEvaluationArguments(["--tolerance=2.5"]), { tolerance: 2.5, mode: "dark" });
  for (const args of [["--tolerance"], ["--tolerance="], ["--tolerance", "-1"], ["--tolerance", "Infinity"],
    ["--tolerance", "NaN"], ["--unknown"], ["--tolerance", "2", "--tolerance", "3"]]) {
    assert.throws(() => parseEvaluationArguments(args));
  }
});

test("report generation includes honest raw/rendered metrics, provenance, complexity, and limitations", () => {
  const report = createReport(4);
  assert.equal(report.schemaVersion, 3);
  assert.equal(Object.hasOwn(report, "models"), false);
  assert.equal(Object.hasOwn(report.model, "variant"), false);
  assert.equal(report.baseline.explicitWorkbenchColorCount, 324);
  assert.equal(report.baseline.orderedSyntaxRuleCount, 118);
  assert.equal(report.baseline.coverage.registeredDefaultsIncluded, false);
  assert.deepEqual(report.baseline.sources, reference.sources);
  const { model } = report;
  assert.equal(model.controlCount, 19);
  assert.deepEqual([...model.controls].sort(), Object.keys(defaults).sort());
  assert.equal(model.raw.count, model.coverage.generated);
  assert.equal(model.exceptionCount, model.preservedIds.length);
  assert.equal(model.evaluation.tolerance, 4);
  assert.equal(model.samples.length, model.coverage.generated);
  assert.ok(model.worstRaw.length > 0);
  assert.ok(model.worstAlpha.length > 0);
  assert.ok(model.evaluation.contrast.length > 0);
  assert.deepEqual(model.coverage, { total: 324, generated: 305, preserved: 19, unresolved: 0, unscoredGenerated: unscoredIds.length });
  assert.deepEqual(model.unscoredGeneratedIds, unscoredIds);
  assert.equal(model.knownResiduals.length, 2);
  assert.ok(model.knownResiduals.every((sample) => sample.role === "accent" && sample.deltaE > 0));
  assert.match(report.experiment.primaryMetric, /Raw/);
  assert.match(report.experiment.acceptance, /Human review/);
  const markdown = reportMarkdown(report);
  assert.match(markdown, /NOT CIEDE2000/);
  assert.match(markdown, /Preserved \(excluded\)/);
  assert.match(markdown, /Worst alpha outliers/);
  assert.match(markdown, /Retained generated slash-command mismatches/);
  assert.match(markdown, /Added\/Deleted\/Modified/);
  assert.match(markdown, /Source provenance/);
  assert.match(markdown, /Human review/);
  assert.doesNotThrow(() => JSON.stringify(report));
});
