import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireRecord } from "../src/shared/validation";
import { getReleaseMetadata } from "./release";

export function releaseBlockers(manifest: Record<string, unknown>, licenseFilePresent: boolean): string[] {
  const blockers: string[] = [];
  if (typeof manifest.publisher !== "string" || !manifest.publisher.trim() || manifest.publisher.trim() === "themer-local") {
    blockers.push("Choose a real Marketplace publisher and update package.json.");
  }
  if (typeof manifest.license !== "string" || !manifest.license.trim() || manifest.license.trim().toUpperCase() === "UNLICENSED") {
    blockers.push("Approve the project license and update package.json.");
  }
  if (!licenseFilePresent) {
    blockers.push("Add the approved project license as LICENSE.");
  }
  return blockers;
}

export async function assertReleaseReady(root: string): Promise<void> {
  const manifest = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Manifest");
  const licensePath = path.join(root, "LICENSE");
  const licensePresent = existsSync(licensePath) && (await readFile(licensePath, "utf8")).trim().length > 0;
  const blockers = releaseBlockers(manifest, licensePresent);
  if (blockers.length > 0) {
    throw new Error(`Marketplace publication is blocked:\n${blockers.map((blocker) => `- ${blocker}`).join("\n")}`);
  }
  const [lock, changelog] = await Promise.all([
    readFile(path.join(root, "package-lock.json"), "utf8"),
    readFile(path.join(root, "CHANGELOG.md"), "utf8")
  ]);
  getReleaseMetadata(manifest, JSON.parse(lock), changelog);
}

async function main(): Promise<void> {
  await assertReleaseReady(path.resolve(__dirname, ".."));
  console.log("Publisher, license, version, lockfile, and release notes are present. Owner acceptance is still required.");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
