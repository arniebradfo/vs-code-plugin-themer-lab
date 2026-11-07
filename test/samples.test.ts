import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { parse, ParseError } from "jsonc-parser";
import { editorSamples } from "../src/shared/samples";
import { requireRecord } from "../src/shared/validation";

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

test("TypeScript, TSX, and JavaScript examples typecheck without third-party libraries", async () => {
  const configFile = path.join(directory, "tsconfig.json");
  const compilerDirectory = path.dirname(require.resolve("typescript/package.json"));
  const manifest = requireRecord(JSON.parse(await readFile(path.join(compilerDirectory, "package.json"), "utf8")), "Compiler manifest");
  const commands = requireRecord(manifest.bin, "Compiler commands");
  assert.ok(typeof commands.tsc === "string");
  const compiler = path.resolve(compilerDirectory, commands.tsc);
  const runCompiler = (...args: string[]) => {
    const result = spawnSync(process.execPath, [compiler, "--project", configFile, "--pretty", "false", ...args], { encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  const config = requireRecord(JSON.parse(runCompiler("--showConfig")), "Sample compiler configuration");
  assert.ok(Array.isArray(config.files));
  assert.deepEqual(config.files.map((file: unknown) => {
    assert.ok(typeof file === "string");
    return path.basename(file);
  }).sort(), ["card.tsx", "palette.js", "theme.ts"]);
  const options = requireRecord(config.compilerOptions, "Sample compiler options");
  assert.equal(options.noEmit, true);
  assert.equal(options.strict, true);
  assert.equal(options.checkJs, true);
  assert.deepEqual(options.types, []);
  runCompiler("--noEmit");
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
