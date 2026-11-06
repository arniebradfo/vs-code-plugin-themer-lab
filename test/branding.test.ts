import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { previewScope } from "../src/extension/preview";
import { references } from "../src/shared/reference";
import { previewThemeNames, themeModes } from "../src/shared/types";
import { requireRecord } from "../src/shared/validation";
import { baselineThemeDocument } from "../tools/capture";

test("Marketplace metadata describes the theme builder without changing its extension identity", async () => {
  const manifest = requireRecord(JSON.parse(await readFile(path.resolve(__dirname, "..", "package.json"), "utf8")), "Manifest");
  assert.equal(manifest.name, "themer-lab");
  assert.equal(manifest.publisher, "themer-local");
  assert.equal(manifest.displayName, "Themer Lab: Live Theme Builder");
  assert.deepEqual(manifest.repository, {
    type: "git",
    url: "https://github.com/arniebradfo/vs-code-plugin-themer-lab.git"
  });
  assert.equal(manifest.homepage, "https://github.com/arniebradfo/vs-code-plugin-themer-lab#readme");
  assert.deepEqual(manifest.bugs, { url: "https://github.com/arniebradfo/vs-code-plugin-themer-lab/issues" });
  assert.equal(manifest.description,
    "Create a custom theme from a few colors. Preview UI and syntax highlighting live, then apply or export your theme.");
  assert.deepEqual(manifest.categories, ["Themes", "Other"]);
  assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.length <= 30);
  assert.ok(manifest.keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0));
  assert.equal(new Set(manifest.keywords).size, manifest.keywords.length);
  for (const keyword of ["theme editor", "theme builder", "theme maker", "theme generator", "syntax highlighting", "live preview"]) {
    assert.ok(manifest.keywords.includes(keyword), keyword);
  }
  const contributions = requireRecord(manifest.contributes, "Contributions");
  assert.deepEqual(contributions.commands, [
    { command: "themer.open", title: "Themer Lab: Open Theme Builder" },
    { command: "themer.openSample", title: "Themer Lab: Open Syntax Sample" },
    { command: "themer.restorePreview", title: "Themer Lab: Restore Unfinished Preview" },
    { command: "themer.reviewRecovery", title: "Themer Lab: Review Unfinished Theme Settings" }
  ]);
});

test("the public lockfile resolves dependencies only from the public npm registry", async () => {
  const lock = requireRecord(JSON.parse(await readFile(path.resolve(__dirname, "..", "package-lock.json"), "utf8")), "Lockfile");
  const packages = requireRecord(lock.packages, "Locked packages");
  for (const [name, value] of Object.entries(packages)) {
    const dependency = requireRecord(value, `Locked ${name}`);
    if (dependency.resolved !== undefined) {
      assert.ok(typeof dependency.resolved === "string", name);
      assert.ok(dependency.resolved.startsWith("https://registry.npmjs.org/"), name);
    }
  }
});

test("API type declarations stay within the supported extension targets", async () => {
  const root = path.resolve(__dirname, "..");
  const manifest = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Manifest");
  const engines = requireRecord(manifest.engines, "Engines");
  const dependencies = requireRecord(manifest.devDependencies, "Development dependencies");
  assert.ok(typeof engines.vscode === "string");
  assert.ok(typeof dependencies["@types/vscode"] === "string");
  const editor = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(engines.vscode);
  const declarations = /^~(\d+)\.(\d+)\.(\d+)$/.exec(dependencies["@types/vscode"]);
  assert.ok(editor && declarations, "Pin VS Code declarations to a compatible minor release.");
  assert.equal(declarations[1], editor[1]);
  assert.ok(Number(declarations[2]) < Number(editor[2]) ||
    (declarations[2] === editor[2] && Number(declarations[3]) <= Number(editor[3])),
  "Do not compile against APIs newer than the minimum supported editor.");
  const build = await readFile(path.join(root, "tools", "build.mjs"), "utf8");
  const nodeTarget = /target: "node(\d+)"/.exec(build);
  assert.ok(nodeTarget?.[1], "The extension build must declare its Node target.");
  assert.ok(typeof dependencies["@types/node"] === "string");
  assert.match(dependencies["@types/node"], new RegExp(`^(?:\\^|~)?${nodeTarget[1]}\\.\\d+\\.\\d+$`));
});

test("both native theme contributions, packaged JSON and capture output use the final names", async () => {
  const root = path.resolve(__dirname, "..");
  const manifest = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Manifest");
  const contributions = requireRecord(manifest.contributes, "Contributions");
  assert.ok(Array.isArray(contributions.themes));
  assert.equal(contributions.themes.length, themeModes.length, "Do not add legacy entries to the theme picker.");
  assert.equal(previewScope, "[Themer Lab Dark][Themer Lab Light]");
  for (const mode of themeModes) {
    const contribution: Record<string, unknown> | undefined = contributions.themes.map((entry) => requireRecord(entry, "Theme"))
      .find((entry) => entry.id === previewThemeNames[mode]);
    assert.ok(contribution, mode);
    assert.equal(contribution.label, previewThemeNames[mode]);
    assert.equal(contribution.uiTheme, mode === "dark" ? "vs-dark" : "vs");
    assert.equal(typeof contribution.path, "string");
    assert.doesNotMatch(previewThemeNames[mode], /preview/i);
    const file = mode === "dark" ? "themer-base-color-theme.json" : "themer-light-color-theme.json";
    const base = JSON.parse(await readFile(path.join(root, "themes", file), "utf8"));
    assert.deepEqual(base, baselineThemeDocument(references[mode]));
    assert.equal(base.name, previewThemeNames[mode]);
    assert.equal(base.type, mode);
  }
});
