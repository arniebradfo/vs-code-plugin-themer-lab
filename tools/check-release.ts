import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireRecord } from "../src/shared/validation";

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

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const manifest = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Manifest");
  const blockers = releaseBlockers(manifest, existsSync(path.join(root, "LICENSE")));
  if (blockers.length > 0) {
    throw new Error(`Marketplace publication is blocked:\n${blockers.map((blocker) => `- ${blocker}`).join("\n")}`);
  }
  console.log("Publisher and license prerequisites are present. Complete the documented release review before publishing.");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
