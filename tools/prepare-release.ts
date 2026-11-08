import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import { requireRecord } from "../src/shared/validation";
import {
  compareReleaseVersions,
  getChangelogNotes,
  getChangelogSections,
  getReleaseMetadata,
  parseReleaseVersion,
  type ReleaseMetadata
} from "./release";

export type ReleaseBump = "patch" | "minor" | "major" | "initial";

export interface ReleasePlanOptions {
  bump: ReleaseBump;
  version?: string;
  date?: string;
}

export interface PrepareReleaseOptions extends ReleasePlanOptions {
  dryRun: boolean;
}

export interface ReleasePlan extends ReleaseMetadata {
  previousVersion: string;
  bump: ReleaseBump;
  manifest: Record<string, unknown>;
  lock: Record<string, unknown>;
  changelog: string;
}

function parseBump(value: unknown): ReleaseBump {
  if (value !== "patch" && value !== "minor" && value !== "major" && value !== "initial") {
    throw new Error("Release bump must be patch, minor, major, or initial.");
  }
  return value;
}

export function nextReleaseVersion(current: string, bump: ReleaseBump, exact?: string): string {
  const [major, minor, patch] = parseReleaseVersion(current).split(".").map(Number) as [number, number, number];
  const kind = parseBump(bump);
  const version = parseReleaseVersion(kind === "major" ? `${major + 1}.0.0` :
    kind === "minor" ? `${major}.${minor + 1}.0` :
      kind === "patch" ? `${major}.${minor}.${patch + 1}` : current);
  if (exact !== undefined && parseReleaseVersion(exact) !== version) {
    throw new Error(`Exact version must match the ${kind} result ${version}; arbitrary jumps or downgrades are not allowed.`);
  }
  return version;
}

export function createReleasePlan(
  manifest: unknown,
  lock: unknown,
  changelog: string,
  options: ReleasePlanOptions
): ReleasePlan {
  const current = getReleaseMetadata(manifest, lock, changelog, { allowUnreleased: true });
  const version = nextReleaseVersion(current.version, options.bump, options.version);
  const sections = getChangelogSections(changelog);
  const released = sections.filter((section) => section.version !== undefined);
  if (options.bump === "initial" && released.length > 0) {
    throw new Error("Initial is only for a changelog with no finalized versions; it must not duplicate a release.");
  }
  if (released.some((section) => compareReleaseVersions(section.version ?? "", current.version) > 0)) {
    throw new Error("Changelog contains a release newer than the manifest.");
  }
  if (released.some((section) => section.version === version)) {
    throw new Error(`Changelog already contains release ${version}.`);
  }
  const unreleased = sections.find((section) => section.unreleased);
  if (!unreleased) throw new Error("Changelog must retain an Unreleased section for release preparation.");
  const notes = getChangelogNotes(changelog, unreleased);
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Release date must be a valid YYYY-MM-DD date.");
  }
  const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
  const remaining = changelog.slice(unreleased.end);
  const nextChangelog = changelog.slice(0, unreleased.contentStart) +
    `${eol}## [${version}] - ${date}${eol}${eol}${notes}${eol}${remaining ? eol : ""}` +
    remaining;
  const nextManifest = structuredClone(requireRecord(manifest, "Manifest"));
  const nextLock = structuredClone(requireRecord(lock, "Lockfile"));
  nextManifest.version = version;
  nextLock.version = version;
  requireRecord(requireRecord(nextLock.packages, "Locked packages")[""], "Locked root package").version = version;
  return {
    ...getReleaseMetadata(nextManifest, nextLock, nextChangelog),
    previousVersion: current.version,
    bump: options.bump,
    manifest: nextManifest,
    lock: nextLock,
    changelog: nextChangelog
  };
}

export function parsePrepareReleaseArguments(args: string[]): PrepareReleaseOptions {
  const result: PrepareReleaseOptions = { bump: "patch", dryRun: true };
  const supplied = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index] ?? "";
    const [name] = argument.split("=", 1);
    const flag = name === "--write" ? "--dry-run" : name ?? "";
    if (!["--bump", "--version", "--dry-run"].includes(flag)) {
      throw new Error(`Unknown release argument: ${argument}. Use --bump patch|minor|major|initial [--version X.Y.Z] [--dry-run|--write].`);
    }
    if (supplied.has(flag)) throw new Error(`${flag} may only be supplied once.`);
    supplied.add(flag);
    const value = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) :
      flag === "--dry-run" ? undefined : args[++index];
    if (name === "--write") {
      if (value !== undefined) throw new Error("--write does not take a value.");
      result.dryRun = false;
    } else if (flag === "--dry-run") {
      if (value !== undefined && value !== "true" && value !== "false") {
        throw new Error("--dry-run must be true or false.");
      }
      result.dryRun = value !== "false";
    } else if (flag === "--bump") {
      result.bump = parseBump(value);
    } else {
      result.version = parseReleaseVersion(value);
    }
  }
  return result;
}

function updateJsonVersion(text: string, keys: (string | number)[], version: string): string {
  return applyEdits(text, modify(text, keys, version, {}));
}

export function createReleasePatch(files: { name: string; before: string; after: string }[]): string {
  let patch = "";
  for (const file of files) {
    if (file.before === file.after) continue;
    const before = file.before.split("\n");
    const after = file.after.split("\n");
    const beforeNewline = before.at(-1) === "";
    const afterNewline = after.at(-1) === "";
    if (beforeNewline) before.pop();
    if (afterNewline) after.pop();
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix] &&
      (beforeNewline === afterNewline || prefix !== before.length - 1 || prefix !== after.length - 1)) prefix++;
    let suffix = 0;
    while (beforeNewline === afterNewline && suffix < before.length - prefix && suffix < after.length - prefix &&
      before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
    const start = Math.max(0, prefix - 3);
    const oldEnd = Math.min(before.length, before.length - suffix + 3);
    const newEnd = Math.min(after.length, after.length - suffix + 3);
    patch += `diff --git a/${file.name} b/${file.name}\n--- a/${file.name}\n+++ b/${file.name}\n`;
    patch += `@@ -${oldEnd === start ? start : start + 1},${oldEnd - start} +${newEnd === start ? start : start + 1},${newEnd - start} @@\n`;
    const append = (marker: string, line: string, lastWithoutNewline: boolean): void => {
      patch += `${marker}${line}\n`;
      if (lastWithoutNewline) patch += "\\ No newline at end of file\n";
    };
    for (let index = start; index < prefix; index++) append(" ", before[index] ?? "", !beforeNewline && index === before.length - 1);
    for (let index = prefix; index < before.length - suffix; index++) append("-", before[index] ?? "", !beforeNewline && index === before.length - 1);
    for (let index = prefix; index < after.length - suffix; index++) append("+", after[index] ?? "", !afterNewline && index === after.length - 1);
    for (let index = before.length - suffix; index < oldEnd; index++) append(" ", before[index] ?? "", !beforeNewline && index === before.length - 1);
  }
  return patch;
}

export async function prepareRelease(root: string, options: PrepareReleaseOptions): Promise<ReleasePlan> {
  const names = ["package.json", "package-lock.json", "CHANGELOG.md"] as const;
  const [manifest, lock, changelog] = await Promise.all(names.map((name) => readFile(path.join(root, name), "utf8")));
  if (manifest === undefined || lock === undefined || changelog === undefined) throw new Error("Release source files are missing.");
  const plan = createReleasePlan(JSON.parse(manifest), JSON.parse(lock), changelog, options);
  const files = [
    { name: names[0], before: manifest, after: updateJsonVersion(manifest, ["version"], plan.version) },
    { name: names[1], before: lock, after: updateJsonVersion(updateJsonVersion(lock, ["version"], plan.version), ["packages", "", "version"], plan.version) },
    { name: names[2], before: changelog, after: plan.changelog }
  ];
  const summary = [
    `# Release plan: ${plan.tag}`,
    "",
    `- Mode: ${options.dryRun ? "dry run; no tracked files changed" : "release PR metadata preparation"}.`,
    `- Version: ${plan.previousVersion} → ${plan.version} (${plan.bump}).`,
    `- Extension: ${plan.extensionId}.`,
    "- Changes: package.json, package-lock.json, CHANGELOG.md only.",
    "- Publisher, license, dependencies, and the Unreleased heading are unchanged.",
    "- No tag, GitHub release, or Marketplace publication is created by this preparation.",
    "- Bot events can suppress CI or leave PR runs awaiting approval. The workflow creates the PR, then explicitly dispatches ci.yml with its exact head.",
    "- A successful dispatched run alone does not satisfy required PR checks. CI reports verified native results through the Checks API and verifies their PR rollup.",
    "- Review the version, notes, and both actual app-bound required checks at the latest PR head before merging.",
    "",
    "## Release notes",
    "",
    plan.notes,
    ""
  ].join("\n");
  const output = path.join(root, "artifacts", "release-plan");
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, "release.patch"), createReleasePatch(files)),
    writeFile(path.join(output, "summary.md"), summary),
    writeFile(path.join(output, "plan.json"), `${JSON.stringify({
      previousVersion: plan.previousVersion,
      version: plan.version,
      tag: plan.tag,
      packageName: plan.packageName,
      extensionId: plan.extensionId,
      bump: plan.bump,
      dryRun: options.dryRun
    }, null, 2)}\n`)
  ]);
  if (!options.dryRun) {
    await Promise.all(files.filter((file) => file.before !== file.after).map((file) => writeFile(path.join(root, file.name), file.after)));
  }
  console.log(summary);
  console.log("Review patch and plan: artifacts/release-plan/");
  return plan;
}

async function main(): Promise<void> {
  await prepareRelease(process.cwd(), parsePrepareReleaseArguments(process.argv.slice(2)));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
