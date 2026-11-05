import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { compositeColors, contrastingForeground, contrastRatio, deltaE, limitOklchChroma, nativeCssAlpha, parseColor, toHex, toOklch } from "../src/color";
import { createThemeDocument } from "../src/extension/export";
import { generatePalette, getDefaultParameters, inspectPalette } from "../src/model";
import { activeItemContrastTarget, activeItemTargets, limitPaintedTintChroma, overlayTint, statefulStatusColors, tintOverlay, withAccentActiveItems, withStatefulStatusBar } from "../src/model/personality";
import { classifyColor, interactionSurfaceBackdrops, modernColorAliases, opacityFor, overlayTintProfile, supplementalChangeColors, supplementalModernColors, supplementalSeverityColors, supplementalUiColors } from "../src/model/rules";
import { withSyntaxSelectionContrast } from "../src/model/selection";
import { references } from "../src/shared/reference";
import { personalityKeys, themeModes } from "../src/shared/types";
import type { ThemeMode, ThemeParameters } from "../src/shared/types";
import { fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxAnchors, renderResolvedSyntaxColor } from "../src/syntax";
import { generateBracketPalette, unexpectedBracketId } from "../src/syntax/brackets";
import { generateTheme } from "../src/theme";

const models = { dark: fitSyntaxModel(references.dark), light: fitSyntaxModel(references.light) };
const beforeHashes: Record<ThemeMode, string> = {
  dark: "c9554997cf3f16f1c2553b0abcd1397cd3ea04a8792f4f0c3a16996dd000a4ba",
  light: "ad8d9779317a74de136ea926a53045fc7d82131654d4cc748081be8c75ef88cc"
};
const approvedPreviousTextDefaults: Record<ThemeMode, Record<string, string>> = {
  dark: { "textPreformat.foreground": "#8b8b8b" },
  light: { "textPreformat.foreground": "#606060", "editorSuggestWidget.selectedForeground": "#000000" }
};
const defaults = (mode: ThemeMode) => getDefaultParameters(references[mode]);
const hueDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);

test("all four toggles default off and preserve previous colors apart from approved inline-code/suggestion fixes", () => {
  for (const mode of themeModes) {
    const reference = references[mode];
    const parameters = defaults(mode);
    for (const key of personalityKeys) assert.equal(parameters[key], false);
    const palette = generatePalette(reference, parameters);
    const legacy = new Set([
      ...Object.keys(reference.colors), ...Object.keys(supplementalSeverityColors),
      ...Object.keys(supplementalChangeColors),
      ...Object.keys(supplementalUiColors).filter((id) => !id.startsWith("editorSuggestWidget."))
    ]);
    const colors = Object.fromEntries(Object.entries(palette.colors)
      .filter(([id]) => legacy.has(id))
      .map(([id, value]) => [id, approvedPreviousTextDefaults[mode][id] ?? value])
      .sort(([a], [b]) => a!.localeCompare(b!, "en")));
    assert.equal(createHash("sha256").update(JSON.stringify(colors)).digest("hex"), beforeHashes[mode]);
    const syntaxParameters = getDefaultSyntaxParameters(reference);
    const generated = generateTheme(reference, parameters, syntaxParameters, models[mode]);
    assert.deepEqual(generated.palette, withSyntaxSelectionContrast(palette, generated.syntax.palette));
    assert.deepEqual(generated.syntax.palette,
      generateSyntax(models[mode], syntaxParameters, getSyntaxAnchors(parameters, palette)));
    assert.deepEqual(generated.syntax.brackets,
      generateBracketPalette(generated.syntax.resolved, parameters.error, parameters.background));
  }
});

test("classic/Modern counterparts always have generated rules and missing native IDs are honestly unscored", () => {
  const documentedModernIds = [
    "modernUI.shellBackground", "modernUI.inactiveShellBackground", "surface.background", "surface.foreground",
    "surface.border", "editor.border", "modernPanel.border", "modernSash.gripForeground",
    "modernTab.activeBackground", "modernTab.activeForeground", "modernTab.hoverBackground", "modernTab.hoverForeground",
    "editorGroupHeader.connectedTabsBackground", "modernEditorTab.activeBackground", "modernEditorTab.activeActionBackground",
    "modernEditorTab.activeForeground", "modernEditorTab.activeHoverBackground", "modernEditorTab.activeHoverActionBackground",
    "modernEditorTab.inactiveBackground", "modernEditorTab.hoverBackground", "modernEditorTab.hoverActionBackground",
    "modernEditorTab.hoverForeground", "modernEditorTab.selectedActionBackground",
    "modernActivityBar.background", "modernActivityBar.inactiveBackground", "modernActivityBar.border",
    "modernActivityBarItem.activeBackground", "modernActivityBarItem.activeForeground",
    "modernActivityBarItem.hoverBackground", "modernActivityBarItem.hoverForeground", "statusBar.inactiveBackground"
  ];
  assert.deepEqual(Object.keys(supplementalModernColors).sort(), documentedModernIds.sort());
  for (const mode of themeModes) {
    const reference = references[mode];
    const palette = generatePalette(reference, defaults(mode));
    const inspection = inspectPalette(reference, palette);
    for (const [id, role] of Object.entries(supplementalModernColors)) {
      assert.ok(classifyColor(id, mode), id);
      assert.equal(palette.roles[id], role, id);
      assert.ok(palette.colors[id], id);
      if (!Object.hasOwn(reference.colors, id)) {
        assert.ok(inspection.unscoredGeneratedIds.includes(id), id);
        assert.ok(!inspection.samples.some((sample) => sample.id === id), id);
      }
    }
    for (const [id, source] of Object.entries(modernColorAliases)) {
      if (palette.colors[source]) assert.equal(palette.colors[id], palette.colors[source], `${mode}/${id}`);
    }
    for (const id of Object.keys(palette.colors).filter((id) => /^modernEditorTab\..*ActionBackground$/.test(id))) {
      assert.equal(parseColor(palette.colors[id]!).alpha, 1, id);
    }
    const changed = generatePalette(reference, { ...defaults(mode), foreground: "#aabbcc", background: "#181b25", accent: "#ff7733" });
    for (const [id, source] of Object.entries(modernColorAliases)) {
      if (changed.colors[source]) assert.equal(changed.colors[id], changed.colors[source], id);
    }
    assert.equal(inspection.raw.count, palette.coverage.generated);
  }
});

test("explicit new Modern colors use shared rules and explicit null counterparts remain unresolved", () => {
  for (const mode of themeModes) {
    const reference = structuredClone(references[mode]);
    reference.colors["modernTab.activeForeground"] = { value: "#ff00ff", source: "test" };
    reference.colors["modernEditorTab.hoverForeground"] = { value: null, source: "test" };
    const parameters = { ...defaults(mode), accentActiveItems: true };
    const palette = generatePalette(reference, parameters);
    const inspection = inspectPalette(reference, palette);
    assert.notEqual(palette.colors["modernTab.activeForeground"], "#ff00ff");
    assert.ok(inspection.samples.some((sample) => sample.id === "modernTab.activeForeground"));
    assert.equal(palette.colors["modernEditorTab.hoverForeground"], undefined);
    assert.ok(inspection.unresolvedIds.includes("modernEditorTab.hoverForeground"));
  }
});

test("accent active items cover classic/Modern tabs, activity bars, panels, menus and lists with native-alpha contrast", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#00ffff", "#ffffff", "#000000", "#ff00ff", "#808080"]) {
      for (const overlayOpacity of [0, 1, 2]) {
        const parameters = { ...defaults(mode), accent, overlayOpacity, accentActiveItems: true };
        const palette = generatePalette(references[mode], parameters);
        const ordinary = generatePalette(references[mode], { ...parameters, accentActiveItems: false });
        for (const [id, [background, canvas, hover]] of Object.entries(activeItemTargets)) {
          const foreground = palette.colors[id];
          const backdrop = palette.colors[canvas];
          assert.ok(foreground && backdrop, id);
          for (const fillId of [background, ...(hover ? [hover] : [])]) {
            const fill = palette.colors[fillId];
            for (const alpha of fill ? [parseColor(fill).alpha ?? 1, nativeCssAlpha(parseColor(fill).alpha ?? 1)] : [0]) {
              const painted = fill ? compositeColors(fill, backdrop, alpha) : backdrop;
              assert.ok(contrastRatio(foreground, painted) >= activeItemContrastTarget,
                `${mode}/${accent}/${overlayOpacity}/${id} on ${fillId}`);
            }
          }
          const source = toOklch(accent);
          const output = toOklch(foreground);
          if (source.c > 0.03 && output.c > 0.03) assert.ok(hueDistance(source.h ?? 0, output.h ?? 0) < 5, id);
        }
        for (const [id, color] of Object.entries(ordinary.colors)) {
          if (!Object.hasOwn(activeItemTargets, id)) assert.equal(palette.colors[id], color, id);
        }
        assert.doesNotThrow(() => inspectPalette(references[mode], palette));
      }
    }
  }
});

test("active accent text starts at Primary foreground lightness, not button-accent lightness", () => {
  for (const mode of themeModes) {
    const parameters = { ...defaults(mode), accentActiveItems: true };
    const palette = generatePalette(references[mode], parameters);
    const foreground = palette.colors["tab.activeForeground"];
    assert.ok(foreground);
    const source = toOklch(parameters.accent);
    const primary = toOklch(parameters.foreground);
    const expected = toHex({ ...source, l: primary.l, c: limitOklchChroma(primary.l, source.c, source.h ?? 0) });
    assert.equal(foreground, expected);
    assert.ok(Math.abs(toOklch(foreground).l - primary.l) < 0.003);
    assert.ok(mode === "dark" ? toOklch(foreground).l > source.l + 0.15 : toOklch(foreground).l < source.l - 0.15);
    const changed = generatePalette(references[mode], {
      ...parameters, foreground: mode === "dark" ? "#e0e0e0" : "#404040"
    });
    assert.notEqual(changed.colors["tab.activeForeground"], foreground);
    for (const accent of ["#000000", "#ffffff", "#808080"]) {
      const neutral = generatePalette(references[mode], { ...parameters, accent });
      assert.equal(neutral.colors["tab.activeForeground"], neutral.colors.foreground,
        "An achromatic accent should retain readable Primary foreground rather than adopt its own lightness.");
    }
  }
});

test("chromatic active items remain visibly tinted at black and white primary foregrounds", () => {
  for (const mode of themeModes) {
    for (const foreground of mode === "dark" ? ["#ffffff", "#fefefe"] : ["#000000", "#010101"]) {
      for (const accent of [defaults(mode).accent, "#ff7700", "#00ffff", "#ff00ff"]) {
        const parameters = { ...defaults(mode), foreground, accent };
        const ordinary = generatePalette(references[mode], parameters);
        const accented = generatePalette(references[mode], { ...parameters, accentActiveItems: true });
        for (const id of ["tab.activeForeground", "modernEditorTab.activeForeground", "activityBar.foreground", "panelTitle.activeForeground"]) {
          const color = accented.colors[id];
          assert.ok(color);
          assert.ok(deltaE(color, ordinary.colors[id]!) >= 5, `${mode}/${foreground}/${accent}/${id}: accent must visibly change active text.`);
          assert.ok(toOklch(color).c > 0.03, `${mode}/${foreground}/${accent}/${id}: retain visible chroma.`);
          assert.ok(hueDistance(toOklch(accent).h ?? 0, toOklch(color).h ?? 0) < 5, id);
        }
        assert.equal(accented.colors.foreground, foreground);
        assert.equal(accented.colors.descriptionForeground, ordinary.colors.descriptionForeground);
        assert.equal(accented.colors["textPreformat.foreground"], ordinary.colors["textPreformat.foreground"]);
        assert.equal(accented.colors["button.foreground"], ordinary.colors["button.foreground"]);
      }
      for (const accent of ["#ffffff", "#000000", "#808080"]) {
        const palette = generatePalette(references[mode], { ...defaults(mode), foreground, accent, accentActiveItems: true });
        assert.equal(palette.colors["tab.activeForeground"], foreground, "Gray accents retain the primary foreground.");
      }
    }
  }
});

test("active accent is only a base state; semantic resource colors and native dirty indicators remain independent", () => {
  for (const mode of themeModes) {
    const ordinary = generatePalette(references[mode], defaults(mode));
    const accented = generatePalette(references[mode], { ...defaults(mode), accentActiveItems: true, tintNeutralOverlays: true });
    for (const id of [
      "gitDecoration.addedResourceForeground", "gitDecoration.untrackedResourceForeground",
      "gitDecoration.modifiedResourceForeground", "gitDecoration.deletedResourceForeground",
      "gitDecoration.conflictingResourceForeground", "gitDecoration.ignoredResourceForeground",
      "list.errorForeground", "list.warningForeground", "problemsErrorIcon.foreground",
      "tab.activeModifiedBorder", "tab.inactiveModifiedBorder"
    ]) {
      assert.equal(accented.colors[id], ordinary.colors[id], `${mode}/${id}`);
    }
  }
});

test("active text on a solid accent fill chooses black/white without mutating the ordinary palette", () => {
  for (const mode of themeModes) {
    const parameters = { ...defaults(mode), accent: "#00aeff" };
    const ordinary = generatePalette(references[mode], parameters);
    const palette = { ...ordinary, colors: { ...ordinary.colors, "menu.selectionBackground": parameters.accent } };
    const before = structuredClone(palette);
    const changed = withAccentActiveItems(palette, parameters.accent);
    assert.equal(changed.colors["menu.selectionForeground"], contrastingForeground(parameters.accent));
    assert.deepEqual(palette, before);
  }
});

test("active-text contrast search finds a narrow feasible interval between very different active and hover fills", () => {
  const parameters = { ...defaults("dark"), accent: "#ffffff" };
  const palette = generatePalette(references.dark, parameters);
  palette.colors["tab.activeBackground"] = "#000000";
  palette.colors["tab.hoverBackground"] = "#ffffff";
  const changed = withAccentActiveItems(palette, parameters.accent);
  const foreground = changed.colors["tab.activeForeground"];
  assert.ok(foreground);
  assert.ok(contrastRatio(foreground, "#000000") >= 4.5);
  assert.ok(contrastRatio(foreground, "#ffffff") >= 4.5);
});

test("conflicting active/hover surfaces produce explicit below-target advisories rather than a false contrast claim", () => {
  const parameters = {
    ...defaults("dark"), background: "#666666", foreground: "#ffffff",
    surfaceSpread: 3, accentActiveItems: true
  };
  const generated = generateTheme(references.dark, parameters, getDefaultSyntaxParameters(references.dark), models.dark);
  const warnings = inspectPalette(references.dark, generated.palette).evaluation.contrast
    .filter((check) => !check.passes && check.label.startsWith("Active item"));
  assert.ok(warnings.length > 0);
  for (const warning of warnings) {
    assert.equal(warning.target, 4.5);
    assert.ok(warning.ratio < 4.5);
  }
});

test("tint covers nonsemantic opacity roles and opaque interaction states with their shared profiles", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#00ffff", "#ff00ff", "#ffffff", "#808080"]) {
      for (const overlayOpacity of [0, 0.5, 1, 2]) {
        const parameters = { ...defaults(mode), accent, overlayOpacity };
        const ordinary = generatePalette(references[mode], parameters);
        const referenceTint = tintOverlay(ordinary.colors["list.activeSelectionBackground"]!, accent);
        const tinted = generatePalette(references[mode], { ...parameters, tintNeutralOverlays: true });
        let affected = 0;
        for (const [id, color] of Object.entries(ordinary.colors)) {
          const assignment = classifyColor(id, mode);
          const opacity = assignment ? opacityFor(mode, assignment.opacity) : 1;
          const profile = assignment ? overlayTintProfile(id, assignment, mode) : undefined;
          const output = tinted.colors[id];
          assert.ok(output, id);
          if (!profile) {
            assert.equal(output, color, `${mode}/${accent}/${overlayOpacity}/${id}`);
            continue;
          }
          affected++;
          const rawTint = tintOverlay(color, accent, profile);
          const backdropId = assignment?.role === "surface"
            ? interactionSurfaceBackdrops(id)?.find((candidate) => ordinary.colors[candidate] !== undefined) : undefined;
          const expected = backdropId && toOklch(accent).c >= overlayTint.achromaticThreshold
            ? limitPaintedTintChroma(rawTint, referenceTint, ordinary.colors[backdropId]!)
            : rawTint;
          if (id === "editor.inactiveSelectionBackground") {
            assert.equal(output.slice(0, 7), expected.slice(0, 7), id);
            const requestedAlpha = Math.round(Math.min(1, opacity * overlayOpacity) * 255) / 255;
            assert.ok((parseColor(output).alpha ?? 1) <= requestedAlpha,
              "The existing selection guard may only reduce the requested alpha.");
          } else {
            assert.equal(output, expected, `${mode}/${accent}/${overlayOpacity}/${id}`);
            assert.equal(parseColor(output).alpha, parseColor(color).alpha, id);
          }
          if (toOklch(accent).c < overlayTint.achromaticThreshold) {
            assert.equal(output, color, "Gray accents must not disturb the original overlay source.");
          }
        }
        assert.ok(affected >= 35, `${mode}: the whole nonsemantic opacity pipeline must participate.`);
      }
    }
  }
});

test("inactive/opaque interaction fills have comparable painted chroma to active selection throughout the opacity range", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#00ffff", "#ff00ff", "#ff8000"]) {
      const parameters = { ...defaults(mode), accent };
      for (const overlayOpacity of [0.5, 1, 2]) {
        const ordinary = generatePalette(references[mode], { ...parameters, overlayOpacity });
        const referenceTint = tintOverlay(ordinary.colors["list.activeSelectionBackground"]!, accent);
        const tinted = generatePalette(references[mode], { ...parameters, overlayOpacity, tintNeutralOverlays: true });
        for (const id of [
          "list.inactiveSelectionBackground", "terminal.inactiveSelectionBackground",
          "activityBar.activeBackground", "modernActivityBarItem.activeBackground",
          "modernTab.activeBackground", "tab.selectedBackground", "menubar.selectionBackground"
        ]) {
          const fill = tinted.colors[id];
          const backdropId = interactionSurfaceBackdrops(id)?.find((candidate) => tinted.colors[candidate] !== undefined);
          assert.ok(fill && backdropId, id);
          const background = tinted.colors[backdropId];
          assert.ok(background, backdropId);
          const neutral = toHex({ ...toOklch(fill), c: 0 });
          const chroma = (value: string) => Math.max(...[
            parseColor(value).alpha ?? 1, nativeCssAlpha(parseColor(value).alpha ?? 1)
          ].map((alpha) => toOklch(compositeColors(value, background, alpha)).c));
          const ceiling = Math.max(chroma(referenceTint), chroma(neutral));
          assert.ok(chroma(fill) <= ceiling + 0.000001,
            `${mode}/${accent}/${overlayOpacity}/${id}: rendered chroma ${chroma(fill)} must stay below ${ceiling}.`);
        }
        const background = tinted.colors["sideBar.background"]!;
        const paintedChroma = (id: string) => {
          const fill = tinted.colors[id]!;
          return toOklch(compositeColors(fill, background, nativeCssAlpha(parseColor(fill).alpha ?? 1))).c;
        };
        const active = paintedChroma("list.activeSelectionBackground");
        const inactive = paintedChroma("list.inactiveSelectionBackground");
        assert.ok(inactive <= active * 1.25, `${mode}/${accent}/${overlayOpacity}: inactive saturation must not dwarf active.`);
        assert.ok(inactive >= active * 0.5, `${mode}/${accent}/${overlayOpacity}: inactive fill must retain meaningful tint.`);
        assert.equal(tinted.colors["list.activeSelectionBackground"], referenceTint,
          "The active selection must retain the user's chosen opacity and tint, not be capped against a stale 1x reference.");
      }
    }
  }
});

test("painted tint limiting retains source lightness/alpha and existing colored-backdrop chroma", () => {
  for (const background of ["#121314", "#ffffff", "#202032", "#e7eee1"]) {
    for (const fill of ["#803379", "#8a4f9933", "#c17bc8cc"]) {
      const reference = "#a8c4e322";
      const result = limitPaintedTintChroma(fill, reference, background);
      assert.equal(parseColor(result).alpha, parseColor(fill).alpha);
      assert.ok(Math.abs(toOklch(result).l - toOklch(fill).l) < 0.003);
      assert.ok(toOklch(result).c <= toOklch(fill).c + 0.002);
      assert.equal(limitPaintedTintChroma(result, reference, background), result, "Limiting must be idempotent.");
    }
  }
  assert.throws(() => limitPaintedTintChroma("#ff00ff", "#ff00ff22", "#12131480"), /opaque backdrop/);
});

test("inactive list/terminal selections and classic/Modern activity fills tint even when opaque", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#00ffff", "#ff00ff"]) {
      const parameters = { ...defaults(mode), accent };
      const ordinary = generatePalette(references[mode], parameters);
      const tinted = generatePalette(references[mode], { ...parameters, tintNeutralOverlays: true });
      for (const id of [
        "list.inactiveSelectionBackground", "terminal.inactiveSelectionBackground",
        "activityBar.activeBackground", "modernActivityBarItem.activeBackground", "modernActivityBarItem.hoverBackground",
        "modernTab.activeBackground", "tab.selectedBackground"
      ]) {
        const before = ordinary.colors[id];
        const after = tinted.colors[id];
        assert.ok(before && after, id);
        assert.notEqual(after, before, `${mode}/${accent}/${id}`);
        assert.equal(parseColor(after).alpha, parseColor(before).alpha, id);
        if (parseColor(before).alpha === 1) {
          assert.ok(Math.abs(toOklch(after).l - toOklch(before).l) <= 0.003,
            `${mode}/${id}: opaque interaction fills retain their modeled lightness.`);
        }
      }
      for (const [id, source] of Object.entries(modernColorAliases)) {
        if (!id.includes("Foreground") && tinted.colors[source]) {
          assert.equal(tinted.colors[id], tinted.colors[source], `${mode}/${id}: Modern counterpart parity`);
        }
      }
      for (const id of ["editor.background", "sideBar.background", "tab.inactiveBackground",
        "settings.dropdownBackground", "surface.background", "statusBar.background", "button.background"]) {
        assert.equal(tinted.colors[id], ordinary.colors[id], `${mode}/${id}: ordinary chrome must not acquire state tint.`);
      }
      const zero = generatePalette(references[mode], { ...parameters, tintNeutralOverlays: true, overlayOpacity: 0 });
      const zeroActivity = zero.colors["activityBar.activeBackground"]!;
      const tintedActivity = tinted.colors["activityBar.activeBackground"]!;
      assert.equal(parseColor(zeroActivity).alpha, 1, "Opaque activity fills must remain opaque.");
      assert.ok(Math.abs(toOklch(zeroActivity).l - toOklch(tintedActivity).l) < 0.003);
      assert.ok(toOklch(zeroActivity).c <= toOklch(tintedActivity).c,
        "The saturation cap follows the active tint's strength without changing opaque-fill transparency.");
      assert.doesNotThrow(() => inspectPalette(references[mode], tinted));
    }
  }
});

test("quiet scrollbar/minimap/shadow/grip tint reduces color without weakening interaction overlays or changing alpha", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#00ffff", "#ff00ff"]) {
      const parameters = { ...defaults(mode), accent };
      const ordinary = generatePalette(references[mode], parameters);
      const tinted = generatePalette(references[mode], { ...parameters, tintNeutralOverlays: true });
      for (const id of [
        "scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground",
        "minimapSlider.background", "minimapSlider.hoverBackground", "minimapSlider.activeBackground",
        "scrollbar.shadow", "modernSash.gripForeground"
      ]) {
        const before = ordinary.colors[id];
        const after = tinted.colors[id];
        assert.ok(before && after, id);
        if (parseColor(before).alpha === 0) {
          assert.equal(after, before, id);
          continue;
        }
        const strong = tintOverlay(before, accent);
        assert.equal(after, tintOverlay(before, accent, "quiet"), id);
        assert.equal(parseColor(after).alpha, parseColor(before).alpha, id);
        assert.ok(toOklch(after).c <= toOklch(strong).c * 0.5 + 0.002,
          `${mode}/${id}: quiet structural tint must have at least half the chroma of the previous strong tint.`);
        assert.ok(deltaE(after, before) < deltaE(strong, before),
          `${mode}/${id}: quiet tint must stay closer to its original neutral color.`);
      }
      for (const id of ["list.hoverBackground", "list.activeSelectionBackground", "menu.selectionBackground"]) {
        const raw = tintOverlay(ordinary.colors[id]!, accent);
        assert.equal(tinted.colors[id], raw,
          `${mode}/${id}: normal-strength interaction tint must not be weakened by the quiet structural profile.`);
      }
      assert.equal(tinted.colors["minimapSlider.background"], tinted.colors["scrollbarSlider.background"]);
    }
  }
});

test("accent tint is measurably visible after native-alpha compositing at default opacity", () => {
  for (const mode of themeModes) {
    const parameters = defaults(mode);
    const ordinary = generatePalette(references[mode], parameters);
    const tinted = generatePalette(references[mode], { ...parameters, tintNeutralOverlays: true });
    const source = toOklch(parameters.accent);
    for (const [id, minimum] of [
      ["list.hoverBackground", mode === "dark" ? 2 : 1],
      ["list.activeSelectionBackground", mode === "dark" ? 3 : 1.5]
    ] as const) {
      const background = ordinary.colors["sideBar.background"];
      const before = ordinary.colors[id];
      const after = tinted.colors[id];
      assert.ok(background && before && after);
      const nativeAlpha = nativeCssAlpha(parseColor(after).alpha ?? 1);
      const originalPaint = compositeColors(before, background, nativeAlpha);
      const tintedPaint = compositeColors(after, background, nativeAlpha);
      assert.ok(deltaE(originalPaint, tintedPaint) >= minimum,
        `${mode}/${id}: require a visible painted difference, not only a different source hex.`);
      const transformed = toOklch(after);
      assert.ok(transformed.c > 0.02);
      assert.ok(transformed.c <= overlayTint.maximumChroma + 0.002);
      assert.ok(hueDistance(transformed.h ?? 0, source.h ?? 0) < 4);
    }
    for (const id of ["menu.selectionBackground", "editor.selectionBackground", "editor.inactiveSelectionBackground",
      "editorWhitespace.foreground", "modernSash.gripForeground", "editorIndentGuide.background1"]) {
      assert.notEqual(tinted.colors[id], ordinary.colors[id], `${mode}/${id} must now participate.`);
    }
    assert.doesNotThrow(() => inspectPalette(references[mode], tinted));
  }
});

test("tinted selections retain Primary/manual syntax contrast protections at extreme accents and opacity", () => {
  for (const mode of themeModes) {
    for (const accent of ["#00ffff", "#ff00ff", "#ffff00", "#ffffff", "#000000"]) {
      const parameters = {
        ...defaults(mode), foreground: mode === "dark" ? "#999999" : "#666666",
        accent, overlayOpacity: 2, tintNeutralOverlays: true, accentActiveItems: true
      };
      const syntaxParameters = { ...models[mode].parameters, neutral: mode === "dark" ? "#aaaaaa" : "#555555" };
      const { palette, syntax } = generateTheme(references[mode], parameters, syntaxParameters, models[mode]);
      const selection = palette.colors["editor.inactiveSelectionBackground"];
      assert.ok(selection);
      for (const alpha of [parseColor(selection).alpha ?? 1, nativeCssAlpha(parseColor(selection).alpha ?? 1)]) {
        const painted = compositeColors(selection, parameters.background, alpha);
        for (const foreground of [parameters.foreground, syntax.palette.editorForeground]) {
          assert.ok(contrastRatio(foreground, painted) >= Math.min(4.5, contrastRatio(foreground, parameters.background)));
        }
      }
      assert.doesNotThrow(() => inspectPalette(references[mode], palette));
    }
  }
});

test("monochrome brackets use resolved Neutral 7 for every nesting level and guide while keeping errors vivid", () => {
  for (const mode of themeModes) {
    for (const manual of [false, true]) {
      const parameters = { ...defaults(mode), monochromeBrackets: true };
      const syntaxParameters = manual ? { ...models[mode].parameters, neutral: "#aabbcc", violet: "#ff8833" }
        : getDefaultSyntaxParameters(references[mode]);
      const generated = generateTheme(references[mode], parameters, syntaxParameters, models[mode]);
      const ordinary = generateTheme(references[mode], { ...parameters, monochromeBrackets: false }, syntaxParameters, models[mode]);
      const neutral = renderResolvedSyntaxColor(generated.syntax.resolved, "neutral");
      for (let level = 1; level <= 6; level++) {
        assert.equal(generated.syntax.brackets.colors[`editorBracketHighlight.foreground${level}`], neutral);
        assert.equal(generated.syntax.brackets.colors[`editorBracketPairGuide.background${level}`], `${neutral}40`);
        assert.equal(generated.syntax.brackets.colors[`editorBracketPairGuide.activeBackground${level}`], `${neutral}a6`);
      }
      assert.equal(generated.syntax.brackets.colors[unexpectedBracketId], ordinary.syntax.brackets.colors[unexpectedBracketId]);
      assert.deepEqual(generated.syntax.palette, ordinary.syntax.palette);
      assert.deepEqual(generated.palette, ordinary.palette);
    }
  }
});

test("stateful status uses accent, resolved Color 2, quiet no-folder and separate remote fills with readable text", () => {
  for (const mode of themeModes) {
    for (const accent of [defaults(mode).accent, "#ffffff", "#000000", "#00ffff"]) {
      const parameters = { ...defaults(mode), accent, statefulStatusBar: true, monochromeBrackets: true };
      const syntaxParameters = { ...models[mode].parameters, violet: "#ab4499" };
      const generated = generateTheme(references[mode], parameters, syntaxParameters, models[mode]);
      const colors = generated.palette.colors;
      assert.equal(colors["statusBar.background"], colors["button.background"]);
      assert.equal(colors["statusBar.inactiveBackground"], colors["statusBar.background"]);
      assert.equal(colors["statusBar.debuggingBackground"], renderResolvedSyntaxColor(generated.syntax.resolved, "violet"));
      assert.notEqual(colors["statusBar.debuggingBackground"], generated.syntax.brackets.colors["editorBracketHighlight.foreground6"]);
      assert.equal(colors["statusBar.noFolderBackground"], colors["surface.background"]);
      assert.equal(colors["statusBarItem.remoteBackground"], colors["button.hoverBackground"]);
      assert.equal(colors["statusBarItem.remoteHoverBackground"], colors["button.background"]);
      for (const [foreground, background] of [
        ["statusBar.foreground", "statusBar.background"],
        ["statusBar.debuggingForeground", "statusBar.debuggingBackground"],
        ["statusBar.noFolderForeground", "statusBar.noFolderBackground"],
        ["statusBarItem.hoverForeground", "statusBarItem.hoverBackground"],
        ["statusBarItem.remoteForeground", "statusBarItem.remoteBackground"],
        ["statusBarItem.remoteHoverForeground", "statusBarItem.remoteHoverBackground"]
      ]) {
        assert.ok(colors[foreground!] && colors[background!]);
        assert.ok(contrastRatio(colors[foreground!]!, colors[background!]!) >= 4.5, `${mode}/${foreground}`);
        assert.equal(colors[foreground!], contrastingForeground(colors[background!]!));
      }
      const ordinary = generateTheme(references[mode], { ...parameters, statefulStatusBar: false }, syntaxParameters, models[mode]);
      for (const [id, color] of Object.entries(ordinary.palette.colors)) {
        if (!Object.hasOwn(statefulStatusColors, id)) assert.equal(colors[id], color, id);
      }
      assert.doesNotThrow(() => inspectPalette(references[mode], generated.palette));
      assert.deepEqual(withStatefulStatusBar(references[mode], generated.palette, colors["statusBar.debuggingBackground"]!), generated.palette);
    }
  }
});

test("every toggle combination reaches export with honest coverage and no palette mutation", () => {
  for (const mode of themeModes) {
    for (let mask = 0; mask < 16; mask++) {
      const parameters: ThemeParameters = { ...defaults(mode) };
      personalityKeys.forEach((key, index) => { parameters[key] = (mask & (1 << index)) !== 0; });
      const generated = generateTheme(references[mode], parameters, getDefaultSyntaxParameters(references[mode]), models[mode]);
      const before = structuredClone(generated);
      const inspection = inspectPalette(references[mode], generated.palette);
      const document = createThemeDocument(references[mode], generated.palette, "Personality", generated.syntax.palette, generated.syntax.brackets);
      for (const [id, color] of Object.entries(generated.palette.colors)) {
        assert.equal(document.colors[id], id === "editor.foreground" ? generated.syntax.palette.editorForeground : color, id);
      }
      for (const [id, color] of Object.entries(generated.syntax.brackets.colors)) assert.equal(document.colors[id], color, id);
      assert.equal(generated.palette.coverage.total, Object.keys(references[mode].colors).length);
      assert.equal(generated.palette.coverage.unscoredGenerated, inspection.unscoredGeneratedIds.length);
      assert.deepEqual(generated, before);
    }
  }
});

test("stateful null references stay unresolved and unsupported state colors or invalid contexts fail explicitly", () => {
  const reference = structuredClone(references.dark);
  reference.colors["statusBar.debuggingBackground"] = { value: null, source: "test" };
  const parameters = { ...defaults("dark"), statefulStatusBar: true };
  const generated = generateTheme(reference, parameters, getDefaultSyntaxParameters(reference), models.dark);
  assert.equal(generated.palette.colors["statusBar.debuggingBackground"], undefined);
  assert.ok(inspectPalette(reference, generated.palette).unresolvedIds.includes("statusBar.debuggingBackground"));
  const invalid = structuredClone(generated.palette);
  invalid.colors["statusBar.unknownStateBackground"] = "#123456";
  invalid.roles["statusBar.unknownStateBackground"] = "accent";
  assert.throws(() => inspectPalette(reference, invalid), /outside explicit reference coverage/);
  const missingRole = structuredClone(generated.palette);
  delete missingRole.roles["modernTab.hoverForeground"];
  assert.throws(() => inspectPalette(reference, missingRole), /required opacity/);
  assert.throws(() => generateTheme(references.dark, defaults("dark"), models.dark.parameters, models.light), /syntax model must match/);
  const partial = structuredClone(generated.palette);
  delete partial.colors["sideBar.background"];
  assert.throws(() => withAccentActiveItems(partial, parameters.accent), /backdrop sideBar.background/);
});
