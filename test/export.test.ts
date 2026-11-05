import assert from "node:assert/strict";
import { test } from "node:test";
import { createThemeDocument } from "../src/extension/export";
import { generatePalette, getDefaultParameters } from "../src/model";
import { reference, references } from "../src/shared/reference";
import { GeneratedPalette, personalityKeys } from "../src/shared/types";
import { fitSyntaxModel, generateSyntax, getDefaultSyntaxParameters, getSyntaxModel } from "../src/syntax";
import { generateTheme, managedThemeColorIds, themeColors } from "../src/theme";

const palette: GeneratedPalette = {
  colors: { "editor.background": "#202020", "button.background": "#227744" },
  roles: { "editor.background": "surface", "button.background": "accent" },
  coverage: { total: 2, generated: 2, preserved: 0, unresolved: 0, unscoredGenerated: 0 }
};

test("every generated mode and Personality color is managed and uses the same export precedence", () => {
  for (const reference of Object.values(references)) {
    for (let mask = 0; mask < 2 ** personalityKeys.length; mask++) {
      const parameters = getDefaultParameters(reference);
      personalityKeys.forEach((key, index) => { parameters[key] = (mask & (1 << index)) !== 0; });
      const { palette, syntax } = generateTheme(reference, parameters, getDefaultSyntaxParameters(reference), getSyntaxModel(reference));
      const colors = themeColors(palette, syntax.palette, syntax.brackets);
      assert.ok(Object.keys(colors).every((id) => managedThemeColorIds.has(id)));
      assert.equal(colors["editor.foreground"], syntax.palette.editorForeground);
      const document = createThemeDocument(reference, palette, "Shared pipeline", syntax.palette, syntax.brackets);
      assert.deepEqual(document.colors, {
        ...Object.fromEntries(Object.entries(reference.colors).map(([id, entry]) => [id, entry.value])),
        ...colors
      });
    }
  }
});

test("export is standalone, preserves syntax and inherited colors, and has no include dependency", () => {
  const document = createThemeDocument(reference, palette, " My Theme ");
  assert.equal(document.name, "My Theme");
  assert.equal(document.type, "dark");
  assert.equal(document.include, undefined);
  assert.deepEqual(document.tokenColors, reference.tokenColors);
  assert.deepEqual(document.semanticTokenColors, reference.semanticTokenColors);
  assert.equal(document.semanticHighlighting, reference.semanticHighlighting);
  assert.ok(typeof document.colors === "object" && document.colors !== null);
  assert.deepEqual(document.colors, {
    ...Object.fromEntries(Object.entries(reference.colors).map(([id, entry]) => [id, entry.value])),
    ...palette.colors
  });
  assert.doesNotThrow(() => JSON.stringify(document));
});

test("export rejects empty names and invalid generated colors", () => {
  assert.throws(() => createThemeDocument(reference, palette, " "), /name/);
  assert.throws(() => createThemeDocument(reference, { ...palette, colors: { "editor.background": "red" } }, "Theme"), /invalid color/);
});

test("export uses automatic on-accent text instead of restoring baseline white", () => {
  const generated = generatePalette(reference, { ...getDefaultParameters(reference), accent: "#00AEFF" });
  const document = createThemeDocument(reference, generated, "Bright Accent");
  const colors = document.colors;
  assert.ok(typeof colors === "object" && colors !== null);
  assert.equal(Reflect.get(colors, "button.background"), generated.colors["button.background"]);
  assert.equal(Reflect.get(colors, "button.foreground"), "#000000");
  assert.equal(Reflect.get(colors, "badge.foreground"), "#000000");
  assert.equal(Reflect.get(colors, "quickInputList.focusForeground"), "#000000");
});

test("export includes severity inputs and unscored editor diagnostic tokens", () => {
  const generated = generatePalette(reference, {
    ...getDefaultParameters(reference), infoSource: "custom", info: "#8855ee", warning: "#00aeff", error: "#0000ff"
  });
  const document = createThemeDocument(reference, generated, "Severity Palette");
  const colors = document.colors;
  assert.ok(typeof colors === "object" && colors !== null);
  for (const [id, expected] of [
    ["editorInfo.foreground", "#8855ee"],
    ["notificationsInfoIcon.foreground", "#8855ee"],
    ["editorWarning.foreground", "#00aeff"],
    ["activityWarningBadge.foreground", "#000000"],
    ["editorError.foreground", "#0000ff"],
    ["activityErrorBadge.foreground", "#ffffff"]
  ] as const) {
    assert.equal(Reflect.get(colors, id), expected, id);
  }
  assert.deepEqual(document.tokenColors, reference.tokenColors);
});

test("export resolves every Info source and inverted or flat surfaces without exposing input recipes", () => {
  for (const infoSource of ["accent", "foreground", "custom"] as const) {
    for (const surfaceSpread of [-3, -1, 0, 1, 3]) {
      const parameters = {
        ...getDefaultParameters(reference), infoSource, surfaceSpread,
        accent: "#27934d", foreground: "#b0a0c0", info: "#8855ee"
      };
      const generated = generatePalette(reference, parameters);
      const document = createThemeDocument(reference, generated, "Linked Info and Surfaces");
      for (const id of ["notificationsInfoIcon.foreground", "editorInfo.foreground",
        "inputValidation.infoBackground", "inputValidation.infoBorder", "sideBar.background",
        "editorWidget.background", "editor.background", "panel.border"]) {
        assert.equal(document.colors[id], generated.colors[id], `${infoSource}/${surfaceSpread}/${id}`);
      }
      assert.equal(document.colors["editor.background"], parameters.background);
      if (infoSource === "custom") assert.equal(document.colors["editorInfo.foreground"], parameters.info);
      assert.equal(Object.hasOwn(document, "parameters"), false);
      assert.equal(Object.hasOwn(document.colors, "infoSource"), false);
      assert.doesNotThrow(() => JSON.stringify(document));
    }
  }
});

test("export includes change inputs for file labels, translucent diffs, and supplemental markers", () => {
  const generated = generatePalette(reference, {
    ...getDefaultParameters(reference), added: "#8855ee", deleted: "#00aeff", modified: "#ff9900"
  });
  const document = createThemeDocument(reference, generated, "Change Palette");
  assert.equal(document.colors["gitDecoration.addedResourceForeground"], "#8855ee");
  assert.equal(document.colors["gitDecoration.deletedResourceForeground"], "#00aeff");
  assert.equal(document.colors["gitDecoration.modifiedResourceForeground"], "#ff9900");
  assert.equal(document.colors["minimapGutter.modifiedBackground"], "#ff9900");
  assert.equal(document.colors["diffEditor.insertedLineBackground"], "#8855ee26");
  assert.equal(document.colors["diffEditor.removedTextBackground"], "#00aeff4d");
  assert.equal(document.colors["mergeEditor.change.background"], "#ff990026");
  assert.deepEqual(document.tokenColors, reference.tokenColors);
});

test("interactive export includes generated syntax and independent code foreground", () => {
  const model = fitSyntaxModel(reference);
  const syntax = generateSyntax(model, {
    ...model.parameters, red: "#00ff00", neutral: "#abcdef", comments: "#aa6677",
    chromaBoost: 0.25, lightnessShift: 0.5
  });
  const document = createThemeDocument(reference, palette, "Edited Syntax", syntax);
  assert.deepEqual(document.tokenColors, syntax.tokenColors);
  assert.deepEqual(document.semanticTokenColors, syntax.semanticTokenColors);
  assert.equal(document.semanticHighlighting, syntax.semanticHighlighting);
  assert.equal(document.colors["editor.foreground"], syntax.editorForeground);
  assert.equal(document.colors["editor.background"], palette.colors["editor.background"]);
  assert.equal(document.colors["button.background"], palette.colors["button.background"]);
  assert.equal(document.include, undefined);
  assert.throws(() => createThemeDocument(reference, palette, "Invalid", { ...syntax, editorForeground: "red" }), /invalid syntax/);
  assert.throws(() => createThemeDocument(reference, palette, "Invalid", {
    ...syntax, tokenColors: [{ scope: "keyword", settings: { foreground: "red" } }]
  }), /Invalid token/);
});
