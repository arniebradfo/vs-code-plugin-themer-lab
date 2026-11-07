import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createReleasePatch,
  createReleasePlan,
  nextReleaseVersion,
  parsePrepareReleaseArguments
} from "../tools/prepare-release";
import { compareReleaseVersions, getChangelogSections, getReleaseMetadata, parseReleaseVersion } from "../tools/release";

const root = path.resolve(__dirname, "..");
const initialChangelog = "# Changelog\n\n## Unreleased\n\n- Initial theme builder.\n";
const releasedChangelog = "# Changelog\n\n## Unreleased\n\n### Fixed\n\n- Preview recovery.\n\n## [0.1.0] - 2026-10-01\n\n- Initial theme builder.\n\n## Historical context\n\nKeep this section.\n";

function fixture() {
  const manifest = {
    name: "themer-lab",
    publisher: "themer-local",
    version: "0.1.0",
    license: "UNLICENSED",
    dependencies: { culori: "^4.0.2", "jsonc-parser": "^3.3.1" },
    devDependencies: { tsx: "^4.19.4" },
    engines: { vscode: "^1.143.0" }
  };
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    packages: {
      "": {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license,
        dependencies: { ...manifest.dependencies },
        devDependencies: { ...manifest.devDependencies },
        engines: { ...manifest.engines }
      },
      "node_modules/culori": { version: "4.0.2", integrity: "unchanged" }
    }
  };
  return { manifest, lock };
}

async function withFixture(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = path.join(root, "artifacts", `release-plan-test-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const { manifest, lock } = fixture();
  await Promise.all([
    writeFile(path.join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(directory, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`),
    writeFile(path.join(directory, "CHANGELOG.md"), initialChangelog)
  ]);
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runCli(directory: string, args: string[]) {
  return spawnSync(process.execPath, [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "tools", "prepare-release.ts"),
    ...args
  ], { cwd: directory, encoding: "utf8", env: { ...process.env, TSX_DISABLE_CACHE: "1" } });
}

function initializeFixtureGit(directory: string): void {
  execFileSync("git", ["init", "--quiet"], { cwd: directory, encoding: "utf8" });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: directory, encoding: "utf8" });
}

test("stable release versions reject coercion, prefixes, leading zeros, and prerelease metadata", () => {
  for (const version of ["0.0.0", "0.1.0", "1.20.300", "9007199254740991.0.0"]) {
    assert.equal(parseReleaseVersion(version), version);
  }
  for (const invalid of [undefined, null, 1, {}, "", "1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.03",
    "v1.2.3", "=1.2.3", " 1.2.3", "1.2.3\n", "-1.2.3", "1.2.3-beta.1", "1.2.3+build", "9007199254740992.0.0"]) {
    assert.throws(() => parseReleaseVersion(invalid), /Release version/);
  }
});

test("release versions compare numerically, not lexically", () => {
  assert.equal(compareReleaseVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareReleaseVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareReleaseVersions("1.10.0", "1.2.99"), 1);
  assert.equal(compareReleaseVersions("1.2.10", "1.2.9"), 1);
  assert.throws(() => compareReleaseVersions("1.2.3-beta", "1.2.3"), /stable/);
});

test("release metadata requires synchronized identity, version, license, dependencies, and engines", () => {
  const { manifest, lock } = fixture();
  assert.deepEqual(getReleaseMetadata(manifest, lock, releasedChangelog), {
    version: "0.1.0", tag: "v0.1.0", packageName: "themer-lab",
    extensionId: "themer-local.themer-lab", notes: "- Initial theme builder."
  });
  for (const value of [null, [], 1]) {
    assert.throws(() => getReleaseMetadata(value, lock, releasedChangelog), /Manifest/);
    assert.throws(() => getReleaseMetadata(manifest, value, releasedChangelog), /Lockfile/);
  }
  for (const changed of [
    { ...lock, name: "other" }, { ...lock, version: "0.1.1" }, { ...lock, version: "0.1.0-beta" },
    { ...lock, lockfileVersion: 1 }, { ...lock, packages: {} }, { ...lock, license: "MIT" }
  ]) {
    assert.throws(() => getReleaseMetadata(manifest, changed, releasedChangelog));
  }
  for (const changed of [
    { name: "other" }, { version: "0.1.1" }, { license: "MIT" }, { license: undefined },
    { dependencies: { culori: "^4.0.1", "jsonc-parser": "^3.3.1" } }, { dependencies: {} },
    { devDependencies: { tsx: "^4.20.0" } }, { engines: { vscode: "^1.142.0" } },
    { optionalDependencies: { missing: "^1.0.0" } }, { peerDependencies: { missing: "^1.0.0" } },
    { peerDependenciesMeta: { missing: { optional: true } } }
  ]) {
    const changedLock = { ...lock, packages: { ...lock.packages, "": { ...lock.packages[""], ...changed } } };
    assert.throws(() => getReleaseMetadata(manifest, changedLock, releasedChangelog));
  }
  for (const changed of [{ name: "" }, { name: "scoped/name" }, { publisher: "" }, { publisher: "local.publisher" }, { license: " " }]) {
    assert.throws(() => getReleaseMetadata({ ...manifest, ...changed }, lock, releasedChangelog));
  }
  const reordered = { ...lock, packages: { ...lock.packages, "": {
    ...lock.packages[""], dependencies: { "jsonc-parser": "^3.3.1", culori: "^4.0.2" }
  } } };
  assert.equal(getReleaseMetadata(manifest, reordered, releasedChangelog).version, "0.1.0");
});

test("dependency metadata maps reject invalid shapes and optional peer metadata", () => {
  const { manifest, lock } = fixture();
  for (const invalid of [null, [], "dependency", { culori: 4 }, { culori: " " }]) {
    const changed = { ...lock, packages: { ...lock.packages, "": { ...lock.packages[""], dependencies: invalid } } };
    assert.throws(() => getReleaseMetadata(manifest, changed, releasedChangelog));
  }
  const invalidPeer = { example: { optional: "yes" } };
  assert.throws(() => getReleaseMetadata({ ...manifest, peerDependenciesMeta: invalidPeer },
    { ...lock, packages: { ...lock.packages, "": { ...lock.packages[""], peerDependenciesMeta: invalidPeer } } },
    releasedChangelog), /boolean/);
});

test("Unreleased metadata is opt-in for review and never hides an empty exact release", () => {
  const { manifest, lock } = fixture();
  assert.throws(() => getReleaseMetadata(manifest, lock, initialChangelog), /exact 0\.1\.0/);
  assert.equal(getReleaseMetadata(manifest, lock, initialChangelog, { allowUnreleased: true }).notes, "- Initial theme builder.");
  assert.equal(getReleaseMetadata(manifest, lock, releasedChangelog, { allowUnreleased: true }).notes, "- Initial theme builder.");
  assert.throws(() => getReleaseMetadata(manifest, lock, `${initialChangelog}\n## [0.1.0]\n\n`, { allowUnreleased: true }), /nonempty/);
});

test("changelog notes match exact headings, retain subheadings, and ignore fenced or commented headings", () => {
  const { manifest, lock } = fixture();
  const changelog = "# Changelog\r\n\r\n## [0.1.0] - 2026-11-07\r\n\r\n### Added\r\n\r\n- Themes.\r\n\r\n```md\r\n## [0.1.0]\r\n```\r\n\r\n## Other notes\r\n\r\nDo not include.\r\n";
  const notes = getReleaseMetadata(manifest, lock, changelog).notes;
  assert.match(notes, /^### Added\r\n/);
  assert.match(notes, /```md\r\n## \[0\.1\.0\]/);
  assert.doesNotMatch(notes, /Do not include/);
  assert.equal(getReleaseMetadata(manifest, lock,
    "<!--\n## [0.1.0]\n\n- Hidden.\n-->\n## [0.1.0]\n\n- Real notes.\n").notes, "- Real notes.");
  for (const heading of ["0.1.00", "0.1.01", "0.1.0-beta", "v0.1.0", "0.1.0+build", "0.1.01 - 2026-11-07"]) {
    assert.throws(() => getReleaseMetadata(manifest, lock, `## [${heading}]\n\n- Wrong version.\n`), /exact/);
  }
  assert.equal(getReleaseMetadata(manifest, lock, "## 0.1.0\n\n- Plain heading.\n").notes, "- Plain heading.");
});

test("duplicate headings and notes containing only headings, comments, or references are rejected", () => {
  const { manifest, lock } = fixture();
  assert.throws(() => getReleaseMetadata(manifest, lock, `${releasedChangelog}\n## 0.1.0\n\n- Duplicate.\n`), /duplicate/);
  assert.throws(() => getReleaseMetadata(manifest, lock, `${initialChangelog}\n## [Unreleased]\n\n- Duplicate.\n`, { allowUnreleased: true }), /duplicate/);
  for (const notes of ["", "  ", "### Added\n", "<!-- Write notes here. -->\n", "<!-- Unfinished template",
    "[Unreleased]: https://example.invalid\n", "-\n"]) {
    assert.throws(() => getReleaseMetadata(manifest, lock, `## [0.1.0]\n\n${notes}`), /nonempty/);
  }
});

test("patch, minor, and major follow stable next-version rules; exact versions are confirmation only", () => {
  assert.equal(nextReleaseVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextReleaseVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextReleaseVersion("1.2.3", "major"), "2.0.0");
  assert.equal(nextReleaseVersion("0.1.0", "initial", "0.1.0"), "0.1.0");
  assert.equal(nextReleaseVersion("0.1.0", "patch", "0.1.1"), "0.1.1");
  for (const version of ["0.1.0", "0.1.2", "0.2.0", "1.0.0"]) {
    assert.throws(() => nextReleaseVersion("0.1.0", "patch", version), /must match/);
  }
  assert.throws(() => nextReleaseVersion("0.1.0", "patch", "0.1.1-beta"), /stable/);
  assert.throws(() => nextReleaseVersion("9007199254740991.0.0", "major"), /safe integers/);
});

test("initial finalizes 0.1.0 without a bump, duplicate release, or input mutation", () => {
  const { manifest, lock } = fixture();
  const before = structuredClone({ manifest, lock });
  const plan = createReleasePlan(manifest, lock, initialChangelog, { bump: "initial", date: "2026-11-07" });
  assert.equal(plan.version, "0.1.0");
  assert.equal(plan.tag, "v0.1.0");
  assert.deepEqual(plan.manifest, manifest);
  assert.deepEqual(plan.lock, lock);
  assert.match(plan.changelog, /## Unreleased\n\n## \[0\.1\.0\] - 2026-11-07\n\n- Initial/);
  assert.equal(plan.changelog.match(/^## \[0\.1\.0\]/gm)?.length, 1);
  assert.deepEqual({ manifest, lock }, before);
  assert.throws(() => createReleasePlan(plan.manifest, plan.lock, plan.changelog, { bump: "initial" }), /Initial.*duplicate/);
});

test("preparation changes only synchronized versions and moves Unreleased notes while retaining all other sections", () => {
  const { manifest, lock } = fixture();
  for (const [bump, version] of [["patch", "0.1.1"], ["minor", "0.2.0"], ["major", "1.0.0"]] as const) {
    const plan = createReleasePlan(manifest, lock, releasedChangelog, { bump, date: "2026-11-07" });
    assert.equal(plan.version, version);
    assert.deepEqual(plan.manifest, { ...manifest, version });
    assert.deepEqual(plan.lock, { ...lock, version, packages: { ...lock.packages, "": { ...lock.packages[""], version } } });
    assert.ok(plan.changelog.startsWith("# Changelog\n\n## Unreleased\n\n"));
    assert.ok(plan.changelog.endsWith(releasedChangelog.slice(releasedChangelog.indexOf("## [0.1.0]"))));
    assert.equal(plan.notes, "### Fixed\n\n- Preview recovery.");
    assert.equal(getReleaseMetadata(plan.manifest, plan.lock, plan.changelog).version, version);
    assert.throws(() => createReleasePlan(plan.manifest, plan.lock, plan.changelog, { bump: "patch" }), /nonempty/);
  }
});

test("release planning preserves CRLF and rejects empty notes, missing Unreleased, future versions, and invalid dates", () => {
  const { manifest, lock } = fixture();
  const crlf = releasedChangelog.replaceAll("\n", "\r\n").replace("## Unreleased", "## [Unreleased]");
  const plan = createReleasePlan(manifest, lock, crlf, { bump: "patch", date: "2026-11-07" });
  assert.doesNotMatch(plan.changelog, /(?<!\r)\n/);
  assert.ok(plan.changelog.startsWith("# Changelog\r\n\r\n## [Unreleased]\r\n\r\n"));
  assert.throws(() => createReleasePlan(manifest, lock, "## Unreleased\n\n<!-- TODO -->\n", { bump: "patch" }), /nonempty/);
  assert.throws(() => createReleasePlan(manifest, lock, "## [0.1.0]\n\n- Notes.\n", { bump: "patch" }), /Unreleased/);
  assert.throws(() => createReleasePlan(manifest, lock, `${releasedChangelog}\n## [0.2.0]\n\n- Future.\n`, { bump: "patch" }), /newer/);
  for (const date of ["not-a-date", "2026-02-30", "2026-13-01", "2026-1-1"]) {
    assert.throws(() => createReleasePlan(manifest, lock, initialChangelog, { bump: "initial", date }));
  }
});

test("CLI arguments default to review and reject unknown, missing, duplicated, or conflicting flags", () => {
  assert.deepEqual(parsePrepareReleaseArguments([]), { bump: "patch", dryRun: true });
  assert.deepEqual(parsePrepareReleaseArguments(["--bump=initial", "--version", "0.1.0", "--dry-run"]),
    { bump: "initial", version: "0.1.0", dryRun: true });
  assert.equal(parsePrepareReleaseArguments(["--write"]).dryRun, false);
  assert.equal(parsePrepareReleaseArguments(["--dry-run=false"]).dryRun, false);
  for (const args of [
    ["--bump"], ["--bump", "beta"], ["--version"], ["--version=0.1.0-beta"], ["--unknown"],
    ["--bump", "patch", "--bump=minor"], ["--version=0.1.0", "--version=0.1.1"],
    ["--dry-run", "--write"], ["--write", "--dry-run=false"], ["--dry-run=maybe"], ["--write=true"]
  ]) {
    assert.throws(() => parsePrepareReleaseArguments(args));
  }
});

test("CLI dry run writes only review artifacts and its patch can be applied to the fixture", async () => {
  for (const bump of ["initial", "patch"]) await withFixture(async (directory) => {
    const names = ["package.json", "package-lock.json", "CHANGELOG.md"];
    const before = await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")));
    const result = runCli(directory, ["--bump", bump]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run; no tracked files changed/);
    assert.match(result.stdout, /suppress CI or leave PR runs awaiting approval/);
    assert.deepEqual(await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8"))), before);
    assert.deepEqual((await readdir(directory)).sort(), ["CHANGELOG.md", "artifacts", "package-lock.json", "package.json"]);
    const output = path.join(directory, "artifacts", "release-plan");
    assert.deepEqual((await readdir(output)).sort(), ["plan.json", "release.patch", "summary.md"]);
    const plan = JSON.parse(await readFile(path.join(output, "plan.json"), "utf8"));
    assert.equal(plan.version, bump === "initial" ? "0.1.0" : "0.1.1");
    assert.equal(plan.dryRun, true);
    const patch = await readFile(path.join(output, "release.patch"), "utf8");
    assert.match(patch, /diff --git a\/CHANGELOG\.md b\/CHANGELOG\.md/);
    if (bump === "initial") assert.doesNotMatch(patch, /diff --git a\/package/);
    else {
      assert.match(patch, /diff --git a\/package\.json/);
      assert.match(patch, /diff --git a\/package-lock\.json/);
    }
    initializeFixtureGit(directory);
    execFileSync("git", ["apply", "--check", path.join(output, "release.patch")], { cwd: directory, encoding: "utf8" });
    execFileSync("git", ["apply", path.join(output, "release.patch")], { cwd: directory, encoding: "utf8" });
    assert.equal(getReleaseMetadata(
      JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")),
      JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8")),
      await readFile(path.join(directory, "CHANGELOG.md"), "utf8")).version, plan.version);
  });
});

test("CLI write changes only fixture metadata, preserves JSON formatting, and refuses duplicate initial preparation", async () => {
  await withFixture(async (directory) => {
    const original = await readFile(path.join(directory, "package.json"), "utf8");
    const result = runCli(directory, ["--bump=patch", "--version=0.1.1", "--write"]);
    assert.equal(result.status, 0, result.stderr);
    const manifestText = await readFile(path.join(directory, "package.json"), "utf8");
    assert.equal(manifestText, original.replace('"version": "0.1.0"', '"version": "0.1.1"'));
    const manifest = JSON.parse(manifestText);
    const lock = JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8"));
    const changelog = await readFile(path.join(directory, "CHANGELOG.md"), "utf8");
    assert.equal(getReleaseMetadata(manifest, lock, changelog).version, "0.1.1");
    const before = [manifestText, JSON.stringify(lock), changelog];
    const repeated = runCli(directory, ["--bump=initial", "--write"]);
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /Initial.*duplicate/);
    assert.deepEqual([await readFile(path.join(directory, "package.json"), "utf8"),
      JSON.stringify(JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8"))),
      await readFile(path.join(directory, "CHANGELOG.md"), "utf8")], before);
  });
});

test("invalid CLI plans fail before writing artifacts or source changes", async () => {
  await withFixture(async (directory) => {
    const before = await readFile(path.join(directory, "CHANGELOG.md"), "utf8");
    for (const args of [["--version=0.2.0", "--write"], ["--bump=beta"], ["--dry-run=maybe"]]) {
      const result = runCli(directory, args);
      assert.notEqual(result.status, 0);
      assert.equal(await readFile(path.join(directory, "CHANGELOG.md"), "utf8"), before);
      assert.deepEqual((await readdir(directory)).sort(), ["CHANGELOG.md", "package-lock.json", "package.json"]);
    }
  });
});

test("review patches apply with CRLF and files without a final newline", async () => {
  await withFixture(async (directory) => {
    initializeFixtureGit(directory);
    for (const [before, after] of [["one\r\ntwo\r\nthree\r\n", "one\r\nchanged\r\nthree\r\n"],
      ["one\ntwo", "one\nchanged"], ["one\n", "one\nnew\n"], ["one\ntwo\n", "one\n"],
      ["one", "one\n"], ["one\n", "one"], ["one\ntwo", "changed\ntwo\n"],
      ["", "new\n"], ["old\n", ""]] as const) {
      const file = path.join(directory, "review.txt");
      const patch = path.join(directory, "review.patch");
      await writeFile(file, before);
      await writeFile(patch, createReleasePatch([{ name: "review.txt", before, after }]));
      execFileSync("git", ["apply", patch], { cwd: directory, encoding: "utf8" });
      assert.equal(await readFile(file, "utf8"), after);
    }
  });
});

test("manual workflow is dry-run-first, job-scoped, pinned, duplicate-safe, and explicitly dispatches bot CI", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  const ci = await readFile(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /^name: Prepare release\r?$/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|release):/m);
  assert.match(workflow, /dry_run:[\s\S]*?default: true/);
  assert.match(workflow, /options: \[patch, minor, major, initial\]/);
  assert.match(workflow, /concurrency:\r?\n  group: release-preparation\r?\n  cancel-in-progress: false/);
  assert.match(workflow, /^permissions:\r?\n  contents: read\r?\n/m);
  assert.match(workflow, /^    permissions:\r?\n      contents: write\r?\n      pull-requests: write\r?\n      actions: write/m);
  for (const pin of ci.matchAll(/actions\/(?:checkout|setup-node)@[a-f0-9]{40}/g)) assert.ok(workflow.includes(pin[0]));
  const preview = workflow.slice(workflow.indexOf("  preview:"), workflow.indexOf("  prepare:"));
  assert.match(preview, /persist-credentials: false/);
  assert.match(preview, /"--dry-run"/);
  assert.doesNotMatch(preview, /\bgh\b|git push|upload-artifact|GITHUB_TOKEN|GH_TOKEN/);
  assert.doesNotMatch(workflow, /gh api/);
  assert.match(workflow, /This job does not query or change it; gh pr create will fail explicitly/);
  assert.match(workflow, /a maintainer must deliberately enable 'Allow GitHub Actions to create and approve pull requests'/);
  assert.match(workflow, /open release PR already exists/);
  assert.match(workflow, /already exists; it will not be overwritten/);
  assert.match(workflow, /gh workflow run ci\.yml --ref \$branch/);
  assert.match(workflow, /suppress CI or leave PR runs awaiting approval/);
  assert.ok(workflow.indexOf("\n          gh pr create ") < workflow.indexOf("\n          gh workflow run ci.yml"));
  assert.match(workflow, /-f "release_pr=\$\(\$pr.number\)" -f "expected_sha=\$sha"/);
  assert.match(workflow, /Release branch no longer points to the prepared commit/);
  assert.doesNotMatch(workflow, /--force(?:-with-lease)?\b|git tag\b|gh release create|vsce publish|secrets\./);
});

test("Windows bot workflow handles permission, duplicate, and CI failures with mocked GitHub commands",
  { skip: process.platform !== "win32" }, async () => {
    const workflow = await readFile(path.join(root, ".github", "workflows", "release.yml"), "utf8");
    const scripts = [...workflow.matchAll(/^        run: \|\r?\n((?:          [^\r\n]*(?:\r?\n|$))*)/gm)]
      .map((match) => (match[1] ?? "").replace(/^          /gm, ""));
    assert.equal(scripts.length, 4);
    const harness = String.raw`
$ErrorActionPreference = "Stop"
$global:Calls = [System.Collections.Generic.List[string]]::new()
function gh {
  $arguments = @($args)
  [void]$global:Calls.Add("gh $($arguments -join ' ')")
  $global:LASTEXITCODE = 0
  if ($arguments[0] -eq "pr" -and $arguments[1] -eq "list") {
    if ($env:MOCK_MODE -eq "open-pr") { '[{"number":1,"headRefName":"release/v0.1.0","url":"https://example.invalid/pull/1"}]' }
    else { "[]" }
  } elseif ($arguments[0] -eq "workflow") {
    if ($env:MOCK_MODE -eq "ci-failure") { $global:LASTEXITCODE = 1 }
  } elseif ($arguments[0] -eq "pr" -and $arguments[1] -eq "create") {
    if ($env:MOCK_MODE -in @("permission", "pr-failure")) { $global:LASTEXITCODE = 1 }
  } elseif ($arguments[0] -eq "pr" -and $arguments[1] -eq "view") {
    if ($env:MOCK_MODE -eq "head-change") { '{"number":20,"headRefOid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}' }
    else { '{"number":20,"headRefOid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' }
  } else { throw "Unexpected mocked gh command." }
}
function git {
  $arguments = @($args)
  [void]$global:Calls.Add("git $($arguments -join ' ')")
  $global:LASTEXITCODE = 0
  if ($arguments[0] -eq "ls-remote") {
    if ($arguments -contains "--exit-code") {
      if (($env:MOCK_MODE -eq "branch" -and $arguments -contains "--heads") -or
          ($env:MOCK_MODE -eq "tag" -and $arguments -contains "--tags")) {
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/release/v0.1.0"
      } else { $global:LASTEXITCODE = 2 }
    } elseif ($env:MOCK_MODE -eq "moved") { "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb refs/heads/release/v0.1.0" }
    else { "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/release/v0.1.0" }
  } elseif ($arguments[0] -eq "diff") {
    if ($env:MOCK_MODE -eq "unexpected") { "src/extension.ts" }
    else { "CHANGELOG.md" }
  } elseif ($arguments[0] -eq "rev-parse") { "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  elseif ($arguments[0] -notin @("switch", "config", "add", "commit", "push")) { throw "Unexpected mocked git command." }
}
$failed = $false
$message = ""
try {
  $output = @(& {
`;
    await withFixture(async (directory) => {
      const preview = runCli(directory, ["--bump=initial"]);
      assert.equal(preview.status, 0, preview.stderr);
      for (const mode of ["permission", "non-main", "open-pr", "branch", "tag", "unexpected", "moved", "ci-failure", "pr-failure", "head-change", "success"]) {
        const script = `${harness}\n${scripts[1]}\n${scripts[3]}\n` + String.raw`
  } 3>&1)
} catch { $failed = $true; $message = $_.Exception.Message }
[pscustomobject]@{ failed = $failed; message = $message; calls = @($global:Calls) } | ConvertTo-Json -Depth 4 -Compress
`;
        const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            MOCK_MODE: mode,
            SOURCE_REF: mode === "non-main" ? "refs/heads/other" : "refs/heads/main",
            GH_REPO: "fixture/repository",
            GH_TOKEN: "fixture-only"
          }
        });
        assert.equal(result.status, 0, result.stderr);
        const outcome = JSON.parse(result.stdout) as { failed: boolean; message: string; calls: string[] };
        assert.equal(outcome.failed, mode !== "success", `${mode}: ${outcome.message}`);
        const pushed = outcome.calls.some((call) => call.startsWith("git push "));
        const dispatched = outcome.calls.findIndex((call) => call === "gh workflow run ci.yml --ref release/v0.1.0 -f release_pr=20 -f expected_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        const opened = outcome.calls.findIndex((call) => call.startsWith("gh pr create "));
        assert.equal(pushed, ["permission", "moved", "ci-failure", "pr-failure", "head-change", "success"].includes(mode), mode);
        assert.equal(dispatched >= 0, ["ci-failure", "success"].includes(mode), mode);
        assert.equal(opened >= 0, ["permission", "ci-failure", "pr-failure", "head-change", "success"].includes(mode), mode);
        if (dispatched >= 0) assert.ok(opened < dispatched);
        if (mode === "permission") assert.match(outcome.message, /a maintainer must deliberately enable 'Allow GitHub Actions to create and approve pull requests'/);
        if (mode === "ci-failure") assert.match(outcome.message, /PR exists but required CI is NOT verified/);
      }
    });
  });

test("repository metadata supports manual review without weakening exact release validation", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  assert.equal(getReleaseMetadata(manifest, lock, changelog, { allowUnreleased: true }).version, manifest.version);
  if (getChangelogSections(changelog).some((section) => section.version === manifest.version)) {
    assert.equal(getReleaseMetadata(manifest, lock, changelog).version, manifest.version);
  } else {
    assert.throws(() => getReleaseMetadata(manifest, lock, changelog), /exact/);
    const plan = createReleasePlan(manifest, lock, changelog, { bump: "initial", date: "2026-11-07" });
    assert.equal(plan.version, manifest.version);
  }
});
