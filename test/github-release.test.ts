import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTagCommit, validateGitHubRelease } from "../tools/github-release";

const commit = "a".repeat(40);
const expected = { tag: "v0.1.0", commit, notes: "- Release notes.\n" };
const release = {
  tag_name: expected.tag, target_commitish: commit, prerelease: false, draft: true,
  body: expected.notes, assets: [{ name: "themer-lab-0.1.0.vsix", state: "uploaded", digest: `sha256:${"b".repeat(64)}` }]
};

test("release retries accept only the exact stable source and changelog", () => {
  assert.equal(validateGitHubRelease(release, expected).draft, true);
  assert.equal(validateGitHubRelease({ ...release, draft: false }, expected).draft, false);
  for (const change of [
    { tag_name: "v0.1.1" }, { target_commitish: "main" }, { target_commitish: "b".repeat(40) },
    { prerelease: true }, { draft: "false" }, { body: "different notes" }, { assets: null }
  ]) assert.throws(() => validateGitHubRelease({ ...release, ...change }, expected));
});

test("existing release assets require unique names and valid server digests", () => {
  assert.throws(() => validateGitHubRelease({ ...release, assets: [...release.assets, ...release.assets] }, expected), /duplicate/);
  assert.throws(() => validateGitHubRelease({
    ...release, assets: [{ ...release.assets[0], digest: "different" }]
  }, expected), /digest/);
  assert.equal(validateGitHubRelease({
    ...release, assets: [{ ...release.assets[0], digest: null }]
  }, expected).assets[0]?.digest, null);
});

test("release completion never moves an existing version tag to different code", () => {
  assertTagCommit(commit, commit);
  assert.throws(() => assertTagCommit("b".repeat(40), commit), /Do not move/);
  assert.throws(() => assertTagCommit("main", commit), /full lowercase/);
});
