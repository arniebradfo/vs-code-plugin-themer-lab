import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { parse, ParseError } from "jsonc-parser";
import ts from "typescript";
import { editorSamples } from "../src/shared/samples";

const directory = path.resolve(__dirname, "..", "samples");

test("the sample catalog maps unique language IDs to real, nonempty source files", async () => {
  assert.equal(editorSamples.length, 24);
  assert.equal(new Set(editorSamples.map((sample) => sample.language)).size, editorSamples.length);
  assert.equal(new Set(editorSamples.map((sample) => sample.file)).size, editorSamples.length);
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...editorSamples.map((sample) => sample.file), "tsconfig.json"].sort()
  );
  await Promise.all(editorSamples.map(async (sample) => {
    assert.equal(path.basename(sample.file), sample.file);
    assert.ok(sample.label.length > 0 && sample.detail.length > 0);
    const content = await readFile(path.join(directory, sample.file), "utf8");
    assert.ok(content.trim().length > 0, sample.file);
  }));
});

test("TypeScript, TSX, and JavaScript examples typecheck without third-party libraries", () => {
  const configFile = path.join(directory, "tsconfig.json");
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.fileNames.map((file) => path.basename(file)).sort(), ["card.tsx", "palette.js", "theme.ts"]);
  assert.equal(parsed.options.noEmit, true);
  assert.equal(parsed.options.strict, true);
  assert.equal(parsed.options.checkJs, true);
  assert.deepEqual(parsed.options.types, []);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => directory,
    getNewLine: () => "\n"
  }));
});

test("JSON and JSONC examples are valid in their respective language modes", async () => {
  const json = JSON.parse(await readFile(path.join(directory, "theme.json"), "utf8"));
  assert.equal(json.name, "Themer Lab");
  const errors: ParseError[] = [];
  const jsonc = parse(await readFile(path.join(directory, "theme.jsonc"), "utf8"), errors, {
    allowTrailingComma: true
  });
  assert.deepEqual(errors, []);
  assert.equal(jsonc.name, "Themer Lab");
});
