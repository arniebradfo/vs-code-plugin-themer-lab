import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { baselineThemeDocument, captureTheme } from "../tools/capture";
import { parseReferenceTheme } from "../src/shared/validation";

async function withInstallation(run: (app: string, themes: string) => Promise<void>): Promise<void> {
  const app = await mkdtemp(path.join(os.tmpdir(), "themer-capture-"));
  const root = path.join(app, "extensions", "theme-defaults");
  const themes = path.join(root, "themes");
  await mkdir(themes, { recursive: true });
  await writeFile(path.join(app, "product.json"), JSON.stringify({ commit: "test-commit" }));
  await writeFile(path.join(app, "package.json"), JSON.stringify({ version: "1.143.0" }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    contributes: { themes: [{ id: "Dark 2026", uiTheme: "vs-dark", path: "./themes/child.json" }] }
  }));
  try {
    await run(app, themes);
  } finally {
    await rm(app, { recursive: true });
  }
}

test("capture merges JSONC includes, syntax order, semantic rules, and provenance deterministically", async () => {
  await withInstallation(async (app, themes) => {
    await writeFile(path.join(themes, "parent.json"), `{
      // JSONC is accepted.
      "colors": { "editor.background": "#123", "foreground": "#abcdef", },
      "tokenColors": [{ "scope": "comment", "settings": { "foreground": "#555" } }],
      "semanticHighlighting": true,
      "semanticTokenColors": { "variable": "#123456" }
    }`);
    await writeFile(path.join(themes, "child.json"), JSON.stringify({
      name: "2026 Dark",
      include: "./parent.json",
      colors: { "editor.background": "#121314", "unset.color": null },
      tokenColors: [{ scope: "string", settings: { foreground: "#ffffff" } }],
      semanticTokenColors: { variable: { foreground: "#654321", italic: true } }
    }));
    const first = await captureTheme(app);
    assert.deepEqual(first, await captureTheme(app));
    assert.deepEqual(parseReferenceTheme(first), first);
    assert.equal(first.colors["editor.background"]?.value, "#121314");
    assert.equal(first.colors.foreground?.value, "#abcdef");
    assert.equal(first.colors["unset.color"]?.value, null);
    assert.match(first.colors.foreground?.source ?? "", /parent\.json$/);
    assert.equal(first.sources.length, 2);
    assert.equal(first.sources[0]?.sha256.length, 64);
    assert.deepEqual(first.tokenColors.map((rule) => rule.scope), ["comment", "string"]);
    assert.equal(first.semanticHighlighting, true);
    assert.deepEqual(first.semanticTokenColors.variable, { foreground: "#654321", italic: true });
    assert.equal(first.coverage.registeredDefaultsIncluded, false);
    assert.equal(first.coverage.runtimeResolved, false);
    assert.equal(baselineThemeDocument(first).name, "Themer Lab Dark");
  });
});

test("capture rejects cycles, malformed JSONC, invalid colors, and missing themes", async () => {
  await withInstallation(async (app, themes) => {
    const child = path.join(themes, "child.json");
    await writeFile(child, '{"include":"./child.json"}');
    await assert.rejects(captureTheme(app), /cycle/);
    await writeFile(child, '{"colors": ');
    await assert.rejects(captureTheme(app), /ValueExpected|CloseBraceExpected/);
    await writeFile(child, '{"colors":{"editor.background":"not-a-color"}}');
    await assert.rejects(captureTheme(app), /Invalid color/);
    await assert.rejects(captureTheme(app, "Missing"), /not found/);
  });
});

test("capture rejects includes outside the theme package", async () => {
  await withInstallation(async (app, themes) => {
    await writeFile(path.join(app, "outside.json"), '{"colors":{}}');
    await writeFile(path.join(themes, "child.json"), '{"include":"../../../outside.json"}');
    await assert.rejects(captureTheme(app), /escapes/);
  });

});

test("capture records light metadata and produces a genuinely light baseline theme", async () => {
  await withInstallation(async (app, themes) => {
  await writeFile(path.join(path.dirname(themes), "package.json"), JSON.stringify({
    contributes: { themes: [{ id: "Light 2026", uiTheme: "vs", path: "./themes/child.json" }] }
  }));
  await writeFile(path.join(themes, "child.json"), JSON.stringify({
    name: "2026 Light", colors: { "editor.background": "#ffffff", foreground: "#202020" }
  }));
  const captured = await captureTheme(app, "Light 2026");
  assert.equal(captured.theme.type, "light");
  assert.deepEqual(parseReferenceTheme(captured), captured);
  assert.equal(captured.colors["editor.background"]?.value, "#ffffff");
  const document = baselineThemeDocument(captured);
  assert.equal(document.name, "Themer Lab Light");
  assert.equal(document.type, "light");
  for (const type of ["hc-light", "hc-black", "unknown"]) {
    assert.throws(() => parseReferenceTheme({ ...captured, theme: { ...captured.theme, type } }), /Unsupported reference/);
  }
  });
});
