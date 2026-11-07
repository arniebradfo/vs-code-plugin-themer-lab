import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertReleaseReady, releaseBlockers } from "../tools/check-release";

test("the installed publishing CLI supports the configured OIDC command", () => {
  const cli = path.resolve(__dirname, "..", "node_modules", "@vscode", "vsce", "vsce");
  const help = execFileSync(process.execPath, [cli, "publish", "--help"], { encoding: "utf8" });
  assert.match(help, /--oidc\b/);
  assert.match(help, /--packagePath\b/);
});

test("OIDC permission belongs to the protected publishing job, not workflow defaults", async () => {
  const workflow = await readFile(path.resolve(__dirname, "..", ".github", "workflows", "publish.yml"), "utf8");
  assert.doesNotMatch(workflow, /^  id-token:/m);
  assert.equal((workflow.match(/^\s+id-token: write$/gm) || []).length, 1);
  const publishingJob = workflow.split(/^  publish:\r?$/m)[1]?.split(/^  [a-z][a-z-]*:\r?$/m)[0];
  assert.ok(publishingJob);
  assert.match(publishingJob, /^    environment: marketplace\r?$/m);
  assert.match(publishingJob, /^      id-token: write\r?$/m);
  assert.doesNotMatch(publishingJob, /^      contents: write\r?$/m);
});

test("publishing defaults to review, reuses immutable candidates, and does not rebuild in write-capable jobs", async () => {
  const workflow = await readFile(path.resolve(__dirname, "..", ".github", "workflows", "publish.yml"), "utf8");
  assert.match(workflow, /default: review/);
  assert.match(workflow, /MARKETPLACE_PUBLISH_ENABLED: \$\{\{ vars\.MARKETPLACE_PUBLISH_ENABLED \|\| 'false' \}\}/);
  assert.match(workflow, /retention-days: 90/);
  assert.match(workflow, /digest-mismatch: error/);
  assert.match(workflow, /npm audit --audit-level=moderate/);
  const writeJobs = workflow.split(/^  publish:\r?$/m)[1];
  assert.ok(writeJobs);
  assert.doesNotMatch(writeJobs, /npm run (?:check|build|package)\r?$/m);
  assert.doesNotMatch(writeJobs, /--skip-license|--skip-duplicate|--clobber/);
  assert.match(writeJobs, /ref: \$\{\{ needs\.plan\.outputs\.source \}\}/);
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

test("public release readiness rejects empty licenses and inconsistent source metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "themer-release-ready-"));
  const manifest = {
    name: "themer-lab", publisher: "example-publisher", version: "0.1.0", license: "MIT",
    dependencies: {}, devDependencies: {}
  };
  const lockedRoot = { name: manifest.name, version: manifest.version, license: manifest.license, dependencies: {}, devDependencies: {} };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": lockedRoot } };
  try {
    await Promise.all([
      writeFile(path.join(directory, "package.json"), JSON.stringify(manifest)),
      writeFile(path.join(directory, "package-lock.json"), JSON.stringify(lock)),
      writeFile(path.join(directory, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n## 0.1.0\n\n- Initial release.\n"),
      writeFile(path.join(directory, "LICENSE"), " \n")
    ]);
    await assert.rejects(assertReleaseReady(directory), /LICENSE/);
    await writeFile(path.join(directory, "LICENSE"), "Approved fixture license text.");
    await assertReleaseReady(directory);
    await writeFile(path.join(directory, "package-lock.json"), JSON.stringify({ ...lock, version: "0.1.1" }));
    await assert.rejects(assertReleaseReady(directory), /version/i);
    await writeFile(path.join(directory, "package-lock.json"), JSON.stringify(lock));
    await writeFile(path.join(directory, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n- Not finalized.\n");
    await assert.rejects(assertReleaseReady(directory), /release|changelog/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
