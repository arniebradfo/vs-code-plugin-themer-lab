import assert from "node:assert/strict";
import { test } from "node:test";
import { compositeColors, contrastRatio, parseColor, toHex } from "../src/color";
import { createThemeDocument } from "../src/extension/export";
import { generatePalette, getDefaultParameters, inspectPalette } from "../src/model";
import { inactiveSelectionId, limitInactiveSelectionOpacity, withSyntaxSelectionContrast } from "../src/model/selection";
import { references } from "../src/shared/reference";
import { themeModes } from "../src/shared/types";
import { fitSyntaxModel, generateSyntax } from "../src/syntax";

test("prominent status items share primary button fill, readable text and hover transforms in both modes", () => {
  for (const mode of themeModes) {
    const reference = references[mode];
    for (const accent of ["#00aeff", "#0000ff", "#ffffff", "#101010", "#ff8000"]) {
      const palette = generatePalette(reference, { ...getDefaultParameters(reference), accent, overlayOpacity: 0 });
      for (const [id, button] of [
        ["statusBarItem.prominentBackground", "button.background"],
        ["statusBarItem.prominentForeground", "button.foreground"],
        ["statusBarItem.prominentHoverBackground", "button.hoverBackground"],
        ["statusBarItem.prominentHoverForeground", "button.foreground"]
      ] as const) {
        assert.equal(palette.colors[id], palette.colors[button], `${mode}/${accent}/${id}`);
        assert.equal(palette.roles[id], id.endsWith("Foreground") ? "text" : "accent");
      }
      const foreground = palette.colors["statusBarItem.prominentForeground"];
      const background = palette.colors["statusBarItem.prominentBackground"];
      assert.ok(foreground && background);
      assert.ok(contrastRatio(foreground, background) >= 4.5);
      assert.equal(palette.colors["statusBar.debuggingBackground"], reference.colors["statusBar.debuggingBackground"]?.value);
      assert.equal(palette.colors["statusBarItem.remoteBackground"], reference.colors["statusBarItem.remoteBackground"]?.value);
    }
  }
});

test("chat added/removed counters follow Added/Deleted, not accent or Error, including missing native entries", () => {
  for (const mode of themeModes) {
    const reference = references[mode];
    const parameters = { ...getDefaultParameters(reference), added: "#8855ee", deleted: "#00aeff", modified: "#ff9900" };
    const palette = generatePalette(reference, parameters);
    assert.equal(reference.colors["chat.linesAddedForeground"], undefined);
    assert.equal(reference.colors["chat.linesRemovedForeground"], undefined);
    assert.equal(palette.colors["chat.linesAddedForeground"], parameters.added);
    assert.equal(palette.colors["chat.linesRemovedForeground"], parameters.deleted);
    assert.equal(palette.colors["chat.editedFileForeground"], parameters.modified);
    const inspection = inspectPalette(reference, palette);
    assert.ok(inspection.unscoredGeneratedIds.includes("chat.linesAddedForeground"));
    assert.ok(inspection.unscoredGeneratedIds.includes("chat.linesRemovedForeground"));
    assert.ok(!inspection.samples.some(({ id }) => /^chat\.lines/.test(id)));
    const changed = generatePalette(reference, { ...parameters, accent: "#aa3355", error: "#111111", overlayOpacity: 0 });
    assert.equal(changed.colors["chat.linesAddedForeground"], parameters.added);
    assert.equal(changed.colors["chat.linesRemovedForeground"], parameters.deleted);
    const document = createThemeDocument(reference, palette, "Chat Colors");
    assert.equal(document.colors["chat.linesAddedForeground"], parameters.added);
    assert.equal(document.colors["chat.linesRemovedForeground"], parameters.deleted);
    assert.equal(document.colors["statusBarItem.prominentForeground"], palette.colors["button.foreground"]);
  }
});

test("explicit chat references are scored and explicit nulls stay unresolved", () => {
  const reference = structuredClone(references.dark);
  reference.colors["chat.linesAddedForeground"] = { value: "#ffffff", source: "test" };
  reference.colors["chat.linesRemovedForeground"] = { value: null, source: "test" };
  const palette = generatePalette(reference, getDefaultParameters(reference));
  const inspection = inspectPalette(reference, palette);
  assert.ok(inspection.samples.some(({ id, role }) => id === "chat.linesAddedForeground" && role === "added"));
  assert.ok(!inspection.unscoredGeneratedIds.includes("chat.linesAddedForeground"));
  assert.equal(palette.colors["chat.linesRemovedForeground"], undefined);
  assert.ok(inspection.unresolvedIds.includes("chat.linesRemovedForeground"));
});

test("inactive selection opacity prevents bright/dark accents from washing out primary text", () => {
  for (const mode of themeModes) {
    const reference = references[mode];
    const defaults = getDefaultParameters(reference);
    for (const accent of ["#ffffff", "#000000", "#00ffff", "#ffff00", "#ff00ff"]) {
      for (const overlayOpacity of [0, 0.5, 1, 2]) {
        const parameters = { ...defaults, accent, overlayOpacity, foreground: mode === "dark" ? "#999999" : "#666666" };
        const palette = generatePalette(reference, parameters);
        const selected = palette.colors[inactiveSelectionId];
        assert.ok(selected);
        const requested = palette.colors["editor.selectionHighlightBackground"];
        assert.ok(requested);
        assert.ok((parseColor(selected).alpha ?? 1) <= (parseColor(requested).alpha ?? 1));
        const background = compositeColors(selected, parameters.background);
        const target = Math.min(4.5, contrastRatio(parameters.foreground, parameters.background));
        assert.ok(contrastRatio(parameters.foreground, background) >= target, `${mode}/${accent}/${overlayOpacity}`);
        const alpha = parseColor(selected).alpha ?? 1;
        const nativeAlpha = Number((Math.round(alpha * 1000) / 1000).toFixed(2));
        assert.ok(contrastRatio(parameters.foreground, compositeColors(selected, parameters.background, nativeAlpha)) >= target,
          `${mode}/${accent}/${overlayOpacity}: native CSS alpha rounding must also be safe.`);
        assert.equal(toHex({ ...parseColor(selected), alpha: 1 }), toHex({ ...parseColor(requested), alpha: 1 }));
      }
    }
    const defaultPalette = generatePalette(reference, defaults);
    assert.equal(defaultPalette.colors[inactiveSelectionId], defaultPalette.colors["editor.selectionHighlightBackground"],
      "An already-readable default must stay byte-identical.");
  }
});

test("selection protection chooses the highest safe encoded alpha without assuming a monotonic contrast curve", () => {
  const overlay = "#ffffffe0", canvas = "#121314", foregrounds = ["#999999", "#aacc88"];
  const selected = limitInactiveSelectionOpacity(overlay, canvas, foregrounds);
  const alpha = Math.round((parseColor(selected).alpha ?? 1) * 255);
  assert.ok(alpha > 0 && alpha < 224);
  for (let value = alpha + 1; value <= 224; value++) {
    const candidate = toHex({ ...parseColor(overlay), alpha: value / 255 });
    const nativeAlpha = Number((Math.round(value / 255 * 1000) / 1000).toFixed(2));
    assert.ok([value / 255, nativeAlpha].some((opacity) => foregrounds.some((foreground) =>
      contrastRatio(foreground, compositeColors(candidate, canvas, opacity)) < 4.5)),
      `Larger alpha ${value} must be unsafe for at least one foreground.`);
  }
  for (const foreground of foregrounds) assert.ok(contrastRatio(foreground, compositeColors(selected, canvas)) >= 4.5);
  const boundary = limitInactiveSelectionOpacity("#00aeffee", canvas, ["#999999"]);
  assert.equal(boundary.slice(0, 7), "#00aeff", "Changing alpha must not gamut-map already encoded source RGB.");
});

test("a low-contrast canvas is not made worse, transparent selection stays transparent, and invalid inputs surface errors", () => {
  const selected = limitInactiveSelectionOpacity("#ffffffaa", "#888888", ["#999999"]);
  assert.ok(contrastRatio("#999999", compositeColors(selected, "#888888")) >= contrastRatio("#999999", "#888888"));
  assert.equal(limitInactiveSelectionOpacity("#12345600", "#121314", ["#bbbbbb"]), "#12345600");
  assert.throws(() => limitInactiveSelectionOpacity("red", "#121314", ["#bbbbbb"]), /Invalid theme color/);
  assert.throws(() => limitInactiveSelectionOpacity("#12345666", "#12131488", ["#bbbbbb"]), /opaque canvas/);
  assert.throws(() => limitInactiveSelectionOpacity("#12345666", "#121314", ["#bbbbbb88"]), /opaque foreground/);
  assert.throws(() => limitInactiveSelectionOpacity("#12345666", "#121314", []), /opaque foreground/);
});

test("manual code foreground gets the same selection guard in gallery state and standalone export", () => {
  const reference = references.dark;
  const parameters = { ...getDefaultParameters(reference), foreground: "#ffffff", accent: "#ffffff", overlayOpacity: 2 };
  const model = fitSyntaxModel(reference);
  const syntax = generateSyntax(model, { ...model.parameters, neutral: "#999999" });
  const palette = generatePalette(reference, parameters);
  const before = structuredClone(palette);
  const protectedPalette = withSyntaxSelectionContrast(palette, syntax);
  const original = palette.colors[inactiveSelectionId];
  const selected = protectedPalette.colors[inactiveSelectionId];
  assert.ok(original && selected);
  assert.ok((parseColor(selected).alpha ?? 1) < (parseColor(original).alpha ?? 1));
  assert.ok(contrastRatio(syntax.editorForeground, compositeColors(selected, parameters.background)) >= 4.5);
  assert.deepEqual(palette, before, "Syntax selection protection must not mutate its UI input.");
  for (const [id, color] of Object.entries(palette.colors)) {
    if (id !== inactiveSelectionId) assert.equal(protectedPalette.colors[id], color, id);
  }
  assert.equal(createThemeDocument(reference, palette, "Readable Selection", syntax).colors[inactiveSelectionId], selected);
  assert.equal(createThemeDocument(reference, protectedPalette, "Readable Selection", syntax).colors[inactiveSelectionId], selected,
    "Export must not double-attenuate an already safe selection.");
});
