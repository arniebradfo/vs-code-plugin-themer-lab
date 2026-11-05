import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { releaseBlockers } from "../tools/check-release";

test("the installed publishing CLI supports the configured OIDC command", () => {
  const cli = path.resolve(__dirname, "..", "node_modules", "@vscode", "vsce", "vsce");
  const help = execFileSync(process.execPath, [cli, "publish", "--help"], { encoding: "utf8" });
  assert.match(help, /--oidc\b/);
  assert.match(help, /--packagePath\b/);
});

test("OIDC permission belongs to the protected publishing job, not workflow defaults", async () => {
  const workflow = await readFile(path.resolve(__dirname, "..", ".github", "workflows", "publish.yml"), "utf8");
  assert.doesNotMatch(workflow, /^  id-token:/m);
  assert.match(workflow, /^    environment: marketplace\r?\n    permissions:\r?\n      contents: read\r?\n      id-token: write\r?$/m);
});

test("Marketplace publication rejects the local publisher and unlicensed snapshot", () => {
  const blockers = releaseBlockers({ publisher: "themer-local", license: "UNLICENSED" }, false);
  assert.equal(blockers.length, 3);
  assert.match(blockers.join("\n"), /publisher/);
  assert.match(blockers.join("\n"), /license/);
  assert.match(blockers.join("\n"), /LICENSE/);
});

test("Marketplace publication requires each prerequisite independently", () => {
  const ready = { publisher: "example-publisher", license: "MIT" };
  assert.deepEqual(releaseBlockers(ready, true), []);
  assert.equal(releaseBlockers({ ...ready, publisher: "themer-local" }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, publisher: " themer-local " }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, license: "UNLICENSED" }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, license: " unlicensed " }, true).length, 1);
  assert.equal(releaseBlockers(ready, false).length, 1);
  for (const invalid of [undefined, null, "", " ", 42]) {
    assert.equal(releaseBlockers({ ...ready, publisher: invalid }, true).length, 1);
    assert.equal(releaseBlockers({ ...ready, license: invalid }, true).length, 1);
  }
});
