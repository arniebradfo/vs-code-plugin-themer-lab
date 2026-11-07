import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireRecord, requireString } from "../src/shared/validation";
import { assertReleaseReady } from "./check-release";
import { compareReleaseVersions } from "./release";
import { galleryPackageHash, galleryVersions, reconcileMarketplace } from "./publish-release";
import { publicationContext, releaseRepository, requireCommit, verifyCandidate } from "./release-workflow";

interface ReleaseAsset {
  name: string;
  state: string;
  digest: string | null;
}

export interface GitHubRelease {
  draft: boolean;
  assets: ReleaseAsset[];
}

export function validateGitHubRelease(
  value: unknown,
  expected: { tag: string; commit: string; notes: string }
): GitHubRelease {
  const release = requireRecord(value, "GitHub release");
  if (release.tag_name !== expected.tag || release.target_commitish !== expected.commit || release.prerelease !== false) {
    throw new Error("Existing GitHub release does not identify the exact stable candidate source.");
  }
  if (typeof release.draft !== "boolean" || !Array.isArray(release.assets)) throw new Error("GitHub release state is malformed.");
  if (typeof release.body !== "string" ||
      release.body.replace(/\r\n/g, "\n").trim() !== expected.notes.replace(/\r\n/g, "\n").trim()) {
    throw new Error("Existing GitHub release notes do not match the candidate changelog.");
  }
  const assets = release.assets.map((value) => {
    const asset = requireRecord(value, "Release asset");
    if (asset.digest !== null && (typeof asset.digest !== "string" || asset.digest.length !== 71 ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest))) {
      throw new Error("Release asset digest is invalid.");
    }
    return {
      name: requireString(asset.name, "Release asset name"),
      state: requireString(asset.state, "Release asset state"), digest: asset.digest
    };
  });
  if (new Set(assets.map((asset) => asset.name)).size !== assets.length) throw new Error("GitHub release has duplicate asset names.");
  return { draft: release.draft, assets };
}

export function assertTagCommit(actual: unknown, expected: string): void {
  if (requireCommit(actual) !== requireCommit(expected)) {
    throw new Error("The version tag points to different source. Do not move or overwrite an existing release tag.");
  }
}

function optionalGitHubJson(endpoint: string): unknown | undefined {
  const result = spawnSync("gh", ["api", endpoint, "--include"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (/^HTTP\/[\d.]+ 404\b/m.test(result.stdout)) return undefined;
    throw new Error(`GitHub lookup failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  const separator = /\r?\n\r?\n/.exec(result.stdout);
  if (!separator || separator.index === undefined) throw new Error("GitHub API response headers are malformed.");
  return JSON.parse(result.stdout.slice(separator.index + separator[0].length));
}

function gh(...args: string[]): void {
  execFileSync("gh", args, { stdio: "inherit" });
}

function tagCommit(tag: string): string | undefined {
  let value = optionalGitHubJson(`repos/${releaseRepository}/git/ref/tags/${tag}`);
  if (value === undefined) return undefined;
  for (let depth = 0; depth < 5; depth++) {
    const object = requireRecord(requireRecord(value, "Git tag").object, "Tag object");
    const sha = requireCommit(object.sha);
    if (object.type === "commit") return sha;
    if (object.type !== "tag") throw new Error("Version tag does not refer to a commit.");
    value = optionalGitHubJson(`repos/${releaseRepository}/git/tags/${sha}`);
    if (value === undefined) throw new Error("Annotated version tag is unavailable.");
  }
  throw new Error("Version tag exceeds the annotation limit.");
}

async function verifyAsset(tag: string, asset: ReleaseAsset, filename: string): Promise<void> {
  if (asset.state !== "uploaded") throw new Error(`GitHub asset ${asset.name} has not finished uploading.`);
  const expected = createHash("sha256").update(await readFile(filename)).digest("hex");
  if (asset.digest !== null) {
    if (asset.digest !== `sha256:${expected}`) throw new Error(`Existing GitHub asset ${asset.name} has different bytes. It will not be overwritten.`);
    return;
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "themer-release-asset-"));
  try {
    gh("release", "download", tag, "--repo", releaseRepository, "--pattern", asset.name, "--dir", directory);
    const actual = createHash("sha256").update(await readFile(path.join(directory, asset.name))).digest("hex");
    if (actual !== expected) throw new Error(`Existing GitHub asset ${asset.name} has different bytes. It will not be overwritten.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (mode !== "--complete" || !directory || extra.length) {
    throw new Error("Usage: github-release.ts --complete <candidate-directory> (protected, explicitly enabled GitHub Actions only)");
  }
  const candidateDirectory = path.resolve(directory);
  const candidate = await verifyCandidate(candidateDirectory, false);
  publicationContext(candidate.commit);
  await assertReleaseReady(path.resolve(__dirname, ".."));
  const versions = await galleryVersions(candidate.extensionId);
  const marketplace = await reconcileMarketplace(candidate, {
    versions: async () => versions, hash: galleryPackageHash,
    upload: () => { throw new Error("GitHub release completion cannot upload to Marketplace."); },
    wait: async () => { throw new Error("GitHub release completion cannot wait for an unverified upload."); }
  }, false);
  if (marketplace !== "verified") throw new Error("The exact Marketplace package must be verified before a GitHub release.");
  const tag = `v${candidate.version}`;
  const notes = await readFile(path.join(candidateDirectory, "release-notes.md"), "utf8");
  const expected = { tag, commit: candidate.commit, notes };
  const existingTag = tagCommit(tag);
  if (existingTag) assertTagCommit(existingTag, candidate.commit);
  const endpoint = `repos/${releaseRepository}/releases/tags/${tag}`;
  let releaseValue = optionalGitHubJson(endpoint);
  if (releaseValue === undefined) {
    gh("release", "create", tag, "--repo", releaseRepository, "--target", candidate.commit,
      "--draft", "--title", `Themer Lab ${candidate.version}`, "--notes-file", path.join(candidateDirectory, "release-notes.md"));
    releaseValue = optionalGitHubJson(endpoint);
    if (releaseValue === undefined) throw new Error("The draft GitHub release was not saved.");
  }
  const release = validateGitHubRelease(releaseValue, expected);
  const filenames = [candidate.packageName, "release-manifest.json", "SHA256SUMS.txt"];
  for (const name of filenames) {
    const filename = path.join(candidateDirectory, name);
    const asset = release.assets.find((asset) => asset.name === name);
    if (asset) await verifyAsset(tag, asset, filename);
    else gh("release", "upload", tag, filename, "--repo", releaseRepository);
  }
  const uploaded = validateGitHubRelease(optionalGitHubJson(endpoint), expected);
  for (const name of filenames) {
    const asset = uploaded.assets.find((asset) => asset.name === name);
    if (!asset) throw new Error(`GitHub release asset ${name} is missing.`);
    await verifyAsset(tag, asset, path.join(candidateDirectory, name));
  }
  if (uploaded.draft) {
    const latest = !versions.some((version) => compareReleaseVersions(version.version, candidate.version) > 0);
    gh("release", "edit", tag, "--repo", releaseRepository, "--draft=false", `--latest=${latest}`);
  }
  const final = validateGitHubRelease(optionalGitHubJson(endpoint), expected);
  if (final.draft) throw new Error("The GitHub release is still a draft.");
  assertTagCommit(tagCommit(tag), candidate.commit);
  console.log(`Verified GitHub release ${tag} at ${candidate.commit} with the exact Marketplace VSIX.`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
