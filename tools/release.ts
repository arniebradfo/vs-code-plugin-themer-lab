import { isDeepStrictEqual } from "node:util";
import { requireRecord, requireString } from "../src/shared/validation";

export interface ReleaseMetadata {
  version: string;
  tag: string;
  packageName: string;
  extensionId: string;
  notes: string;
}

export interface ChangelogSection {
  heading: string;
  start: number;
  contentStart: number;
  end: number;
  version?: string;
  unreleased: boolean;
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseReleaseVersion(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !stableVersion.test(value)) {
    throw new Error("Release version must be stable X.Y.Z, without leading zeros, a prefix, or prerelease/build metadata.");
  }
  if (value.split(".").some((part) => !Number.isSafeInteger(Number(part)))) {
    throw new Error("Release version components must be safe integers.");
  }
  return value;
}

export function compareReleaseVersions(a: string, b: string): number {
  const left = parseReleaseVersion(a).split(".").map(Number);
  const right = parseReleaseVersion(b).split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function getChangelogSections(changelog: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let offset = 0;
  let fence: { marker: string; length: number } | undefined;
  let comment = false;
  for (const line of changelog.split(/(?<=\n)/)) {
    let text = line.replace(/\r?\n$/, "");
    if (!fence) {
      let visible = "";
      let cursor = 0;
      while (cursor < text.length) {
        const marker = text.indexOf(comment ? "-->" : "<!--", cursor);
        if (marker < 0) {
          if (!comment) visible += text.slice(cursor);
          break;
        }
        if (!comment) visible += text.slice(cursor, marker);
        cursor = marker + (comment ? 3 : 4);
        comment = !comment;
      }
      text = visible;
    }
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (delimiter?.[1]?.[0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2]?.trim()) {
        fence = undefined;
      }
    } else if (delimiter?.[1]) {
      fence = { marker: delimiter[1][0] ?? "", length: delimiter[1].length };
    } else {
      const heading = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(text)?.[1];
      if (heading) {
        const previous = sections.at(-1);
        if (previous) previous.end = offset;
        const label = /^(?:\[([^\]]+)\]|(\S+))(?:[ \t]+-[ \t]+\d{4}-\d{2}-\d{2})?$/.exec(heading);
        const candidate = label?.[1] ?? label?.[2];
        const version = candidate && stableVersion.test(candidate) ? parseReleaseVersion(candidate) : undefined;
        sections.push({
          heading,
          start: offset,
          contentStart: offset + line.length,
          end: changelog.length,
          version,
          unreleased: /^(?:Unreleased|\[Unreleased\])$/i.test(heading)
        });
      }
    }
    offset += line.length;
  }
  const seen = new Set<string>();
  for (const section of sections) {
    const key = section.unreleased ? "Unreleased" : section.version;
    if (!key) continue;
    if (seen.has(key)) throw new Error(`Changelog contains duplicate ${key} headings.`);
    seen.add(key);
  }
  return sections;
}

export function getChangelogNotes(changelog: string, section: ChangelogSection): string {
  const notes = changelog.slice(section.contentStart, section.end).trim();
  const content = notes.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/^ {0,3}#{1,6}[ \t]+.*$/gm, "")
    .replace(/^ {0,3}\[[^\]]+\]:.*$/gm, "")
    .replace(/[\s\-*+_#`~>\[\]()]/g, "");
  if (!content) throw new Error(`Changelog ${section.heading} must contain nonempty release notes.`);
  return notes;
}

function requireIdentity(value: unknown, label: string): string {
  const identity = requireString(value, label);
  if (identity.trim() !== identity || !/^[a-z0-9][a-z0-9-]*$/i.test(identity)) {
    throw new Error(`${label} must contain only letters, numbers, and hyphens.`);
  }
  return identity;
}

function stringMap(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  const map = requireRecord(value, label);
  for (const [key, entry] of Object.entries(map)) {
    if (!key.trim() || !requireString(entry, `${label}.${key}`).trim()) {
      throw new Error(`${label} must contain nonempty names and values.`);
    }
  }
  return map;
}

export function getReleaseMetadata(
  manifest: unknown,
  lock: unknown,
  changelog: string,
  options: { allowUnreleased?: boolean } = {}
): ReleaseMetadata {
  const pkg = requireRecord(manifest, "Manifest");
  const locked = requireRecord(lock, "Lockfile");
  const root = requireRecord(requireRecord(locked.packages, "Locked packages")[""], "Locked root package");
  if (locked.lockfileVersion !== 2 && locked.lockfileVersion !== 3) {
    throw new Error("Release metadata requires lockfileVersion 2 or 3.");
  }
  const version = parseReleaseVersion(pkg.version);
  const packageName = requireIdentity(pkg.name, "Package name");
  const publisher = requireIdentity(pkg.publisher, "Publisher");
  for (const [label, entry] of [["Lockfile", locked], ["Locked root package", root]] as const) {
    if (entry.name !== packageName || parseReleaseVersion(entry.version) !== version) {
      throw new Error(`${label} name/version must match the manifest.`);
    }
  }
  const license = requireString(pkg.license, "Manifest license");
  if (license.trim() !== license || !license.trim() || root.license !== license) {
    throw new Error("Locked root package license must match the nonempty manifest license.");
  }
  if (locked.license !== undefined && locked.license !== license) {
    throw new Error("Lockfile license must match the manifest when present.");
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "engines"] as const) {
    if (!isDeepStrictEqual(stringMap(pkg[field], `Manifest ${field}`), stringMap(root[field], `Locked root ${field}`))) {
      throw new Error(`Locked root package ${field} must match the manifest.`);
    }
  }
  for (const entry of [pkg, root]) {
    if (entry.peerDependenciesMeta !== undefined) {
      const meta = requireRecord(entry.peerDependenciesMeta, "Peer dependency metadata");
      for (const value of Object.values(meta)) {
        const peer = requireRecord(value, "Peer dependency metadata entry");
        if (peer.optional !== undefined && typeof peer.optional !== "boolean") {
          throw new Error("Peer dependency optional metadata must be boolean.");
        }
      }
    }
  }
  if (!isDeepStrictEqual(pkg.peerDependenciesMeta ?? {}, root.peerDependenciesMeta ?? {})) {
    throw new Error("Locked root package peerDependenciesMeta must match the manifest.");
  }
  const sections = getChangelogSections(changelog);
  // Unreleased is only a review fallback. Publication must use the default exact-version check.
  const section = sections.find((entry) => entry.version === version) ??
    (options.allowUnreleased ? sections.find((entry) => entry.unreleased) : undefined);
  if (!section) throw new Error(`Changelog must contain an exact ${version} release heading with notes.`);
  return {
    version,
    tag: `v${version}`,
    packageName,
    extensionId: `${publisher}.${packageName}`,
    notes: getChangelogNotes(changelog, section)
  };
}
