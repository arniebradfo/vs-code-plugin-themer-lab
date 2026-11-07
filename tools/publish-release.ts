import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { requireRecord, requireString } from "../src/shared/validation";
import { assertReleaseReady } from "./check-release";
import { compareReleaseVersions, parseReleaseVersion } from "./release";
import { publicationContext, verifyCandidate } from "./release-workflow";

export interface GalleryVersion {
  version: string;
  preRelease: boolean;
  target: string | undefined;
  packageUrl: string | undefined;
}

export function parseGalleryVersions(value: unknown, extensionId: string): GalleryVersion[] {
  const response = requireRecord(value, "Marketplace response");
  if (!Array.isArray(response.results)) throw new Error("Marketplace results must be an array.");
  const extensions = response.results.flatMap((result) => {
    const group = requireRecord(result, "Marketplace result");
    if (!Array.isArray(group.extensions)) throw new Error("Marketplace extensions must be an array.");
    return group.extensions.map((entry) => requireRecord(entry, "Marketplace extension"));
  }).filter((extension) => {
    const publisher = requireRecord(extension.publisher, "Marketplace publisher");
    const identity = `${requireString(publisher.publisherName, "Publisher name")}.${requireString(extension.extensionName, "Extension name")}`;
    return identity.toLowerCase() === extensionId.toLowerCase();
  });
  if (extensions.length === 0) return [];
  if (extensions.length !== 1) throw new Error("Marketplace returned duplicate extension identities.");
  const extension = extensions[0];
  if (!extension || !Array.isArray(extension.versions)) throw new Error("Marketplace versions must be an array.");
  return extension.versions.map((entry) => {
    const version = requireRecord(entry, "Marketplace version");
    if (!Array.isArray(version.properties) || !Array.isArray(version.files)) {
      throw new Error("Marketplace version properties and files are required.");
    }
    const properties = version.properties.map((entry) => requireRecord(entry, "Version property"));
    const preRelease = properties.some((property) =>
      property.key === "Microsoft.VisualStudio.Code.PreRelease" && property.value === "true");
    const files = version.files.map((entry) => requireRecord(entry, "Version asset"));
    const packages = files.filter((file) => file.assetType === "Microsoft.VisualStudio.Services.VSIXPackage");
    if (packages.length > 1) throw new Error("Marketplace returned duplicate VSIX assets.");
    if (version.targetPlatform !== undefined && typeof version.targetPlatform !== "string") {
      throw new Error("Marketplace target platform is invalid.");
    }
    const packageUrl = packages[0] ? requireString(packages[0].source, "Marketplace VSIX URL") : undefined;
    if (packageUrl) requireGalleryUrl(packageUrl);
    return {
      version: parseReleaseVersion(version.version), preRelease,
      target: version.targetPlatform || undefined, packageUrl
    };
  });
}

export function requireGalleryUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.hostname !== "marketplace.visualstudio.com" && !url.hostname.endsWith(".vsassets.io"))) {
    throw new Error("Marketplace package URL must use a trusted HTTPS gallery host.");
  }
  return url;
}

export function marketplaceDecision(versions: GalleryVersion[], version: string): GalleryVersion | undefined {
  parseReleaseVersion(version);
  const matches = versions.filter((entry) => entry.version === version);
  if (matches.length > 0) {
    const existing = matches[0];
    if (matches.length !== 1 || !existing || existing.preRelease || existing.target) {
      throw new Error("This version already has a pre-release or platform-specific publication. Choose a new stable version.");
    }
    return existing;
  }
  if (versions.some((entry) => compareReleaseVersions(entry.version, version) >= 0)) {
    throw new Error("The new extension version must be higher than every existing Marketplace version.");
  }
  return undefined;
}

export async function galleryVersions(extensionId: string): Promise<GalleryVersion[]> {
  if (extensionId.trim() !== extensionId || !/^[a-z0-9][a-z0-9-]*\.themer-lab$/i.test(extensionId)) {
    throw new Error("Unexpected extension identity.");
  }
  const response = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=3.0-preview.1" },
    body: JSON.stringify({
      filters: [{ pageNumber: 1, pageSize: 1, criteria: [{ filterType: 7, value: extensionId }] }],
      assetTypes: ["Microsoft.VisualStudio.Services.VSIXPackage"], flags: 147
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Marketplace query failed: HTTP ${response.status} ${response.statusText}.`);
  return parseGalleryVersions(await response.json(), extensionId);
}

export async function galleryPackageHash(version: GalleryVersion): Promise<string> {
  if (!version.packageUrl) throw new Error("The Marketplace package is still unavailable. Retry with the retained candidate run.");
  let url = requireGalleryUrl(version.packageUrl);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Marketplace download redirect has no location.");
      url = requireGalleryUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Marketplace VSIX download failed: HTTP ${response.status}.`);
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 50_000_000)) {
      throw new Error("Marketplace package size is invalid or exceeds the release limit.");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 50_000_000) throw new Error("Marketplace package exceeds the release limit.");
    return createHash("sha256").update(bytes).digest("hex");
  }
  throw new Error("Marketplace download exceeded the redirect limit.");
}

export async function reconcileMarketplace(
  candidate: { version: string; sha256: string },
  transport: {
    versions: () => Promise<GalleryVersion[]>;
    hash: (version: GalleryVersion) => Promise<string>;
    upload: () => number;
    wait: () => Promise<void>;
  },
  publish: boolean
): Promise<"verified" | "absent"> {
  const verify = async (version: GalleryVersion): Promise<"verified"> => {
    if (await transport.hash(version) !== candidate.sha256) {
      throw new Error("The published version has different VSIX bytes. Never overwrite it; investigate or publish a higher version.");
    }
    return "verified";
  };
  const existing = marketplaceDecision(await transport.versions(), candidate.version);
  if (existing) return verify(existing);
  if (!publish) return "absent";
  const status = transport.upload();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt > 0) await transport.wait();
    const published = marketplaceDecision(await transport.versions(), candidate.version);
    if (published) {
      const result = await verify(published);
      if (status !== 0) console.log(`Upload exited with code ${status}, but the public gallery verifies this exact VSIX.`);
      return result;
    }
    console.log(`Waiting for Marketplace processing (${attempt + 1}/20); the upload will not be repeated.`);
  }
  throw new Error(`Upload exited with code ${status}; Marketplace acceptance is not verified. Retry with the same candidate_run, not a rebuilt package.`);
}

async function main(): Promise<void> {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!["--check", "--publish", "--verify-published"].includes(mode || "") || !directory || extra.length) {
    throw new Error("Usage: publish-release.ts --check|--publish|--verify-published <candidate-directory>");
  }
  const root = path.resolve(__dirname, "..");
  const candidateDirectory = path.resolve(directory);
  const candidate = await verifyCandidate(candidateDirectory, mode === "--check");
  if (mode === "--publish") {
    publicationContext(candidate.commit);
    await assertReleaseReady(root);
  }
  const status = await reconcileMarketplace(candidate, {
    versions: () => galleryVersions(candidate.extensionId),
    hash: galleryPackageHash,
    upload: () => {
      const result = spawnSync(process.execPath, [
        path.join(root, "node_modules", "@vscode", "vsce", "vsce"),
        "publish", "--oidc", "--packagePath", path.join(candidateDirectory, candidate.packageName)
      ], { cwd: root, stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status === null) throw new Error(`Publishing was terminated by ${result.signal || "an unknown signal"}. Reconcile before retrying.`);
      return result.status;
    },
    wait: () => delay(15_000)
  }, mode === "--publish");
  if (mode === "--verify-published" && status !== "verified") {
    throw new Error("Marketplace publication is not verified. A GitHub release must not be completed.");
  }
  console.log(`Marketplace state: ${status}. ${mode === "--check" ? "Read-only check; nothing was uploaded." : ""}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
