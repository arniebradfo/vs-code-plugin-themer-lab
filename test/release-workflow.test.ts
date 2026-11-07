import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCandidateMatches, assertCleanSource, assertPublicationContext, candidateArtifact, CandidateManifest,
  parseCandidateManifest, planRelease, releaseRepository, requireCommit, requireRunId
} from "../tools/release-workflow";

const commit = "a".repeat(40);
const manifest: CandidateManifest = {
  schemaVersion: 1, commit, version: "0.1.0", extensionId: "themer-local.themer-lab",
  packageName: "themer-lab-0.1.0.vsix", sha256: "b".repeat(64), files: ["extension/package.json"]
};

test("ordinary and dependency main merges never publish an unchanged extension version", () => {
  for (const enabled of [false, true]) {
    assert.deepEqual(planRelease({
      event: "push", ref: "refs/heads/main", source: commit, mode: "publish",
      enabled, version: "0.1.0", beforeVersion: "0.1.0"
    }), { build: false, publish: false, allowUnreleased: true });
  }
});

test("release PR merges require an advance and explicit publishing enablement", () => {
  const input = {
    event: "push", ref: "refs/heads/main", source: commit, mode: "publish",
    enabled: false, version: "0.1.1", beforeVersion: "0.1.0"
  };
  assert.deepEqual(planRelease(input), { build: true, publish: false, allowUnreleased: false });
  assert.deepEqual(planRelease({ ...input, enabled: true }), { build: true, publish: true, allowUnreleased: false });
  assert.throws(() => planRelease({ ...input, version: "0.0.9" }), /decrease/);
  assert.throws(() => planRelease({ ...input, ref: "refs/heads/feature" }), /main/);
  assert.throws(() => planRelease({ ...input, beforeVersion: undefined }), /previous main version/);
});

test("manual review is safe on a branch but publication is main-only and disabled by default", () => {
  const input = {
    event: "workflow_dispatch", ref: "refs/heads/feature", source: commit, mode: "review",
    enabled: false, version: "0.1.0"
  };
  assert.deepEqual(planRelease(input), { build: true, publish: false, allowUnreleased: true });
  assert.throws(() => planRelease({ ...input, mode: "publish" }), /main/);
  assert.throws(() => planRelease({ ...input, mode: "publish", ref: "refs/heads/main" }), /disabled/);
  assert.throws(() => planRelease({ ...input, event: "pull_request" }), /explicit workflow dispatches/);
  assert.throws(() => planRelease({ ...input, mode: "anything" }), /review or publish/);
});

test("reuse requires a retained artifact from the correct repository, workflow, event, and main source", () => {
  const run = {
    head_sha: commit, head_branch: "main", event: "workflow_dispatch", workflow_id: 42,
    repository: { full_name: releaseRepository }
  };
  const workflow = { id: 42, path: ".github/workflows/publish.yml" };
  const artifact = { id: 123, name: `release-candidate-${commit}`, expired: false };
  const artifacts = { artifacts: [artifact] };
  assert.deepEqual(candidateArtifact(run, workflow, artifacts, true), { source: commit, artifactId: "123" });
  assert.throws(() => candidateArtifact({ ...run, head_branch: "feature" }, workflow, artifacts, true), /main/);
  assert.throws(() => candidateArtifact({ ...run, event: "pull_request" }, workflow, artifacts, true), /PR run/);
  assert.throws(() => candidateArtifact({ ...run, workflow_id: 43 }, workflow, artifacts, true), /publishing workflow/);
  assert.throws(() => candidateArtifact(run, { ...workflow, path: ".github/workflows/ci.yml" }, artifacts, true), /publishing workflow/);
  assert.throws(() => candidateArtifact({ ...run, repository: { full_name: "other/repo" } }, workflow, artifacts, true), /repository/);
  for (const entries of [[], [artifact, artifact], [{ ...artifact, expired: true }], [{ ...artifact, name: "other" }]]) {
    assert.throws(() => candidateArtifact(run, workflow, { artifacts: entries }, true), /immutable candidate/);
  }
  assert.throws(() => candidateArtifact(run, workflow, { artifacts: [{ ...artifact, id: -1 }] }, true), /artifact ID/);
});

test("candidate manifests reject mismatched hashes, identities, source, version, filename, and inventories", () => {
  assert.deepEqual(parseCandidateManifest(manifest), manifest);
  assertCandidateMatches(manifest, { ...manifest, files: [...manifest.files].reverse() });
  for (const change of [
    { schemaVersion: 2 }, { commit: "main" }, { version: "0.01.0" }, { packageName: "wrong.vsix" },
    { sha256: "short" }, { sha256: `${manifest.sha256}\n` },
    { extensionId: "different.extension" }, { extensionId: `${manifest.extensionId}\n` }, { files: [] },
    { files: [manifest.files[0], manifest.files[0]] }
  ]) {
    assert.throws(() => parseCandidateManifest({ ...manifest, ...change }));
  }
  for (const change of [
    { commit: "c".repeat(40) }, { version: "0.1.1" }, { extensionId: "final-publisher.themer-lab" },
    { packageName: "themer-lab-0.1.1.vsix" }, { sha256: "d".repeat(64) }, { files: ["extension/README.md"] }
  ]) {
    assert.throws(() => assertCandidateMatches({ ...manifest, ...change }, manifest), /does not match/);
  }
});

test("publication cannot be invoked locally or from an unapproved source even with a publish flag", () => {
  const context = {
    actions: "true", enabled: "true", repository: releaseRepository, ref: "refs/heads/main",
    commit, currentCommit: commit, mainAncestor: true
  };
  assertPublicationContext(context);
  for (const change of [
    { actions: undefined }, { enabled: undefined }, { enabled: "false" },
    { repository: "other/repo" }, { ref: "refs/tags/v0.1.0" },
    { currentCommit: "b".repeat(40) }, { mainAncestor: false }
  ]) {
    assert.throws(() => assertPublicationContext({ ...context, ...change }));
  }
  for (const invalid of ["main", "ABC", "a".repeat(39), "a".repeat(41), `x\n${commit}`, `${commit}\n`]) {
    assert.throws(() => requireCommit(invalid));
  }
  for (const invalid of ["", "0", "-1", "1; echo unsafe", "1\n2", "123\n"]) {
    assert.throws(() => requireRunId(invalid));
  }
  assert.equal(requireRunId("42410817418"), "42410817418");
  assertCleanSource("");
  for (const dirty of [" M package.json", "?? unexpected.txt", "A  LICENSE"]) {
    assert.throws(() => assertCleanSource(dirty), /clean source checkout/);
  }
});
