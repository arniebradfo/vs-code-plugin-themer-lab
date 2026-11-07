import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireRecord, requireString } from "../src/shared/validation";
import { compareReleaseVersions, getReleaseMetadata, parseReleaseVersion } from "./release";

export const releaseRepository = "arniebradfo/vs-code-plugin-themer-lab";
const root = path.resolve(__dirname, "..");

export function requireCommit(value: unknown): string {
  const commit = requireString(value, "Source commit");
  if (commit.length !== 40 || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Source commit must be a full lowercase Git SHA.");
  return commit;
}

export function requireRunId(value: unknown): string {
  const id = requireString(value, "Candidate run ID");
  if (id.trim() !== id || !/^[1-9]\d*$/.test(id)) throw new Error("Candidate run ID must be a positive integer.");
  return id;
}

export function assertCleanSource(status: string): void {
  if (status.trim()) throw new Error("Release verification requires a clean source checkout. Commit and check the actual candidate source first.");
}

export interface ReleasePlanInput {
  event: string;
  ref: string;
  source: string;
  mode: string;
  enabled: boolean;
  version: string;
  beforeVersion?: string;
}

export function planRelease(input: ReleasePlanInput): { build: boolean; publish: boolean; allowUnreleased: boolean } {
  requireCommit(input.source);
  parseReleaseVersion(input.version);
  if (input.event !== "push" && input.event !== "workflow_dispatch") {
    throw new Error("Only main pushes and explicit workflow dispatches can prepare a release candidate.");
  }
  if (input.mode !== "review" && input.mode !== "publish") throw new Error("Release mode must be review or publish.");
  if (input.event === "push") {
    if (input.ref !== "refs/heads/main") throw new Error("Automatic release preparation must use main.");
    if (input.beforeVersion === undefined) throw new Error("The previous main version is required.");
    const difference = compareReleaseVersions(input.version, input.beforeVersion);
    if (difference < 0) throw new Error("The extension version must not decrease.");
    return { build: difference > 0, publish: difference > 0 && input.enabled, allowUnreleased: difference === 0 };
  }
  if (input.mode === "publish") {
    if (input.ref !== "refs/heads/main") throw new Error("Marketplace publication must use main.");
    if (!input.enabled) throw new Error("Marketplace publishing is disabled. Use review mode until the owner enables it.");
  }
  return { build: true, publish: input.mode === "publish", allowUnreleased: input.mode === "review" };
}

export function candidateArtifact(
  runValue: unknown,
  workflowValue: unknown,
  artifactsValue: unknown,
  requireMain: boolean
): { source: string; artifactId: string } {
  const run = requireRecord(runValue, "Candidate workflow run");
  const workflow = requireRecord(workflowValue, "Publishing workflow");
  const repository = requireRecord(run.repository, "Candidate repository");
  if (repository.full_name !== releaseRepository || run.workflow_id !== workflow.id ||
      workflow.path !== ".github/workflows/publish.yml") {
    throw new Error("The candidate must come from this repository's publishing workflow.");
  }
  if (run.event !== "push" && run.event !== "workflow_dispatch") throw new Error("A PR run is not a release candidate.");
  if (requireMain && run.head_branch !== "main") throw new Error("Publication can only reuse a candidate built on main.");
  const source = requireCommit(run.head_sha);
  const data = requireRecord(artifactsValue, "Candidate artifacts");
  if (!Array.isArray(data.artifacts)) throw new Error("Candidate artifacts must be an array.");
  const matches = data.artifacts.map((value) => requireRecord(value, "Artifact"))
    .filter((artifact) => artifact.name === `release-candidate-${source}`);
  if (matches.length !== 1 || matches[0]?.expired !== false) {
    throw new Error("One retained, immutable candidate artifact is required. Do not rebuild an already published version.");
  }
  const artifact = matches[0];
  if (typeof artifact.id !== "number" || !Number.isSafeInteger(artifact.id) || artifact.id <= 0) {
    throw new Error("Candidate artifact ID is invalid.");
  }
  return { source, artifactId: String(artifact.id) };
}

export interface CandidateManifest {
  schemaVersion: 1;
  commit: string;
  version: string;
  extensionId: string;
  packageName: string;
  sha256: string;
  files: string[];
}

export function parseCandidateManifest(value: unknown): CandidateManifest {
  const data = requireRecord(value, "Candidate manifest");
  if (data.schemaVersion !== 1) throw new Error("Unsupported candidate manifest schema.");
  const commit = requireCommit(data.commit);
  const version = parseReleaseVersion(data.version);
  const extensionId = requireString(data.extensionId, "Extension identity");
  if (extensionId.trim() !== extensionId || !/^[a-z0-9][a-z0-9-]*\.themer-lab$/i.test(extensionId)) {
    throw new Error("Unexpected candidate extension identity.");
  }
  const packageName = requireString(data.packageName, "Candidate filename");
  if (packageName !== `themer-lab-${version}.vsix`) throw new Error("Candidate filename must match its version.");
  const sha256 = requireString(data.sha256, "Candidate SHA-256");
  if (sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Candidate SHA-256 is invalid.");
  if (!Array.isArray(data.files) || data.files.length === 0 ||
      !data.files.every((file): file is string => typeof file === "string" && file.length > 0) ||
      new Set(data.files).size !== data.files.length) {
    throw new Error("Candidate file inventory is invalid.");
  }
  return { schemaVersion: 1, commit, version, extensionId, packageName, sha256, files: data.files };
}

export function assertCandidateMatches(actual: CandidateManifest, expected: CandidateManifest): void {
  for (const key of ["commit", "version", "extensionId", "packageName", "sha256"] as const) {
    if (actual[key] !== expected[key]) throw new Error(`Candidate ${key} does not match the verified source/package.`);
  }
  if (JSON.stringify([...actual.files].sort()) !== JSON.stringify([...expected.files].sort())) {
    throw new Error("Candidate file inventory does not match the inspected VSIX.");
  }
}

export function assertPublicationContext(input: {
  actions: string | undefined;
  enabled: string | undefined;
  repository: string | undefined;
  ref: string | undefined;
  commit: string;
  currentCommit: string;
  mainAncestor: boolean;
}): void {
  if (input.actions !== "true" || input.enabled !== "true") {
    throw new Error("Publication requires GitHub Actions and explicit owner enablement.");
  }
  if (input.repository !== releaseRepository || input.ref !== "refs/heads/main") {
    throw new Error("Publication requires this repository's protected main workflow.");
  }
  if (requireCommit(input.commit) !== requireCommit(input.currentCommit) || !input.mainAncestor) {
    throw new Error("The exact candidate source must be checked out and belong to approved main history.");
  }
}

export function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function ghJson(...args: string[]): unknown {
  return JSON.parse(execFileSync("gh", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

export function publicationContext(commit: string): void {
  assertCleanSource(git("status", "--porcelain", "--untracked-files=normal"));
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", commit, "origin/main"], { cwd: root });
  if (ancestor.error) throw ancestor.error;
  if (ancestor.status !== 0 && ancestor.status !== 1) throw new Error("Cannot verify the candidate's main ancestry.");
  assertPublicationContext({
    actions: process.env.GITHUB_ACTIONS,
    enabled: process.env.MARKETPLACE_PUBLISH_ENABLED,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    commit,
    currentCommit: git("rev-parse", "HEAD"),
    mainAncestor: ancestor.status === 0
  });
}

async function sourceMetadata(allowUnreleased: boolean) {
  const [manifest, lock, changelog] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "package-lock.json"), "utf8"),
    readFile(path.join(root, "CHANGELOG.md"), "utf8")
  ]);
  return getReleaseMetadata(JSON.parse(manifest), JSON.parse(lock), changelog, { allowUnreleased });
}

export async function verifyCandidate(directory: string, allowUnreleased: boolean): Promise<CandidateManifest> {
  assertCleanSource(git("status", "--porcelain", "--untracked-files=normal"));
  const metadata = await sourceMetadata(allowUnreleased);
  const stored = parseCandidateManifest(JSON.parse(await readFile(path.join(directory, "release-manifest.json"), "utf8")));
  if (stored.commit !== git("rev-parse", "HEAD") || stored.version !== metadata.version ||
      stored.extensionId !== metadata.extensionId || stored.packageName !== metadata.packageName) {
    throw new Error("Candidate metadata does not match the exact checked-out source.");
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "themer-vsix-check-"));
  try {
    const inspectedPath = path.join(temporary, "inspected.json");
    execFileSync(process.execPath, [
      "--import", "tsx", path.join(root, "tools", "check-vsix.ts"),
      "--vsix", path.join(directory, metadata.packageName), "--commit", stored.commit, "--output", inspectedPath
    ], { cwd: root, stdio: "inherit" });
    const inspected = parseCandidateManifest(JSON.parse(await readFile(inspectedPath, "utf8")));
    assertCandidateMatches(stored, inspected);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const notes = await readFile(path.join(directory, "release-notes.md"), "utf8");
  if (notes.replace(/\r\n/g, "\n").trim() !== metadata.notes.replace(/\r\n/g, "\n").trim()) {
    throw new Error("Candidate release notes do not match the source changelog.");
  }
  const checksum = await readFile(path.join(directory, "SHA256SUMS.txt"), "utf8");
  if (checksum.trim() !== `${stored.sha256}  ${stored.packageName}`) throw new Error("Candidate checksum file is inconsistent.");
  return stored;
}

async function writeOutputs(values: Record<string, string | boolean>): Promise<void> {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `${lines}\n`, { flag: "a" });
  console.log(JSON.stringify(values, null, 2));
}

async function workflowPlan(): Promise<void> {
  const eventName = requireString(process.env.GITHUB_EVENT_NAME, "Workflow event");
  const ref = requireString(process.env.GITHUB_REF, "Workflow ref");
  const mode = eventName === "push" ? "publish" : process.env.RELEASE_MODE || "review";
  const event = requireRecord(JSON.parse(await readFile(requireString(process.env.GITHUB_EVENT_PATH, "Event path"), "utf8")), "Event");
  let source = requireCommit(process.env.GITHUB_SHA);
  let artifactId = "";
  const artifactRun = requireRunId(process.env.CANDIDATE_RUN || process.env.GITHUB_RUN_ID);
  const explicitReuse = Boolean(process.env.CANDIDATE_RUN);
  if (explicitReuse && eventName !== "workflow_dispatch") throw new Error("Candidate reuse requires an explicit dispatch.");
  const artifacts = ghJson("api", `repos/${releaseRepository}/actions/runs/${artifactRun}/artifacts?per_page=100`);
  const listing = requireRecord(artifacts, "Run artifacts");
  if (!Array.isArray(listing.artifacts)) throw new Error("Run artifacts must be an array.");
  if (explicitReuse || listing.artifacts.some((value) => requireRecord(value, "Artifact").name === `release-candidate-${source}`)) {
    const candidate = candidateArtifact(
      ghJson("api", `repos/${releaseRepository}/actions/runs/${artifactRun}`),
      ghJson("api", `repos/${releaseRepository}/actions/workflows/publish.yml`), artifacts, mode === "publish"
    );
    source = candidate.source;
    artifactId = candidate.artifactId;
  }
  if (mode === "publish") {
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", source, "origin/main"], { cwd: root });
    if (ancestor.error) throw ancestor.error;
    if (ancestor.status !== 0) throw new Error("Release source is not in approved main history.");
  }
  const manifest = requireRecord(JSON.parse(git("show", `${source}:package.json`)), "Source manifest");
  const beforeVersion = eventName === "push"
    ? requireString(requireRecord(JSON.parse(git("show", `${requireCommit(event.before)}:package.json`)), "Previous manifest").version, "Previous version")
    : undefined;
  const decision = planRelease({
    event: eventName, ref, source, mode,
    enabled: process.env.MARKETPLACE_PUBLISH_ENABLED === "true",
    version: parseReleaseVersion(manifest.version), beforeVersion
  });
  const metadata = getReleaseMetadata(manifest, JSON.parse(git("show", `${source}:package-lock.json`)),
    git("show", `${source}:CHANGELOG.md`), { allowUnreleased: decision.allowUnreleased });
  if (decision.build && !decision.publish) {
    console.log("Review candidate only. Marketplace publication and GitHub release creation are disabled for this run.");
  }
  await writeOutputs({
    source, version: metadata.version, tag: metadata.tag, package_name: metadata.packageName,
    build: decision.build && !artifactId, publish: decision.publish,
    allow_unreleased: decision.allowUnreleased, artifact_id: artifactId, artifact_run: artifactRun
  });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "plan" && args.length === 0) return workflowPlan();
  if ((command === "notes" || command === "verify") &&
      (args.length === 1 || (args.length === 2 && args[1] === "--allow-unreleased"))) {
    const directory = path.resolve(requireString(args[0], "Candidate directory"));
    const allowUnreleased = args[1] === "--allow-unreleased";
    if (command === "verify") {
      console.log(`Verified candidate ${JSON.stringify(await verifyCandidate(directory, allowUnreleased))}`);
    } else {
      const metadata = await sourceMetadata(allowUnreleased);
      const candidate = parseCandidateManifest(JSON.parse(await readFile(path.join(directory, "release-manifest.json"), "utf8")));
      if (candidate.version !== metadata.version || candidate.extensionId !== metadata.extensionId) {
        throw new Error("Cannot write notes for a different candidate.");
      }
      await Promise.all([
        writeFile(path.join(directory, "release-notes.md"), `${metadata.notes.trim()}\n`),
        writeFile(path.join(directory, "SHA256SUMS.txt"), `${candidate.sha256}  ${candidate.packageName}\n`)
      ]);
    }
    return;
  }
  throw new Error("Usage: release-workflow.ts plan | notes <candidate-directory> [--allow-unreleased] | verify <candidate-directory> [--allow-unreleased]");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
