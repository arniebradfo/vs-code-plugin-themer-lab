import assert from "node:assert/strict";
import { access, appendFile, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { downloadAndUnzipVSCode, type DownloadOptions } from "@vscode/test-electron";
import { references } from "../src/shared/reference";
import type { ReferenceTheme } from "../src/shared/types";
import { requireRecord, requireString } from "../src/shared/validation";
import { captureTheme } from "./capture";

interface PrepareOptions {
  download: boolean;
  version?: string;
  verifyNativeSources?: boolean;
}

interface PrepareServices {
  root?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  download?: (options: Partial<DownloadOptions>) => Promise<string>;
}

function exactVersion(value: string): number[] {
  if (value !== value.trim() || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error("Choose an exact stable VS Code version, such as 1.143.0. Aliases, commits, prereleases, and version ranges are not allowed.");
  }
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) {
    throw new Error("VS Code version components must be safe integers.");
  }
  return parts;
}

export function selectEditorVersion(requested: string | undefined, engine: string): string {
  const match = /^\^(\d+\.\d+\.\d+)$/.exec(engine);
  if (!match?.[1] || match[0] !== engine) {
    throw new Error("Expected an exact caret minimum in package.json engines.vscode; review the acceptance version policy before changing that range.");
  }
  const minimum = match[1];
  const lower = exactVersion(minimum);
  const version = requested ?? minimum;
  const selected = exactVersion(version);
  const firstDifference = selected.findIndex((part, index) => part !== lower[index]);
  if (selected[0] !== lower[0] || (firstDifference >= 0 && selected[firstDifference]! < lower[firstDifference]!)) {
    throw new Error(`VS Code ${version} is outside the manifest acceptance range ${engine}; select ${minimum} or a later exact stable version in the same major.`);
  }
  return version;
}

export function editorAppDirectory(executable: string, platform = process.platform): string {
  return platform === "darwin"
    ? path.resolve(path.dirname(executable), "..", "Resources", "app")
    : path.join(path.dirname(executable), "resources", "app");
}

export async function resolveEditorAppDirectory(executable: string, platform = process.platform): Promise<string> {
  const archive = await realpath(platform === "darwin"
    ? path.resolve(path.dirname(executable), "..", "..")
    : path.dirname(executable));
  const candidates = [editorAppDirectory(executable, platform)];
  if (platform === "win32") {
    for (const entry of await readdir(archive, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9]{10}$/.test(entry.name)) {
        candidates.push(path.join(archive, entry.name, "resources", "app"));
      }
    }
  }
  const found: string[] = [];
  for (const candidate of candidates) {
    try {
      const app = await realpath(candidate);
      const relative = path.relative(archive, app);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("Editor resources must stay inside the isolated downloaded archive.");
      }
      await access(path.join(app, "package.json"));
      await access(path.join(app, "product.json"));
      found.push(app);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  if (found.length !== 1) {
    throw new Error(`Expected one isolated editor resources directory; found ${found.length}. Windows archives may use a ten-character commit directory. No editor path was exported.`);
  }
  return found[0]!;
}

export function assertNativeSources(actual: ReferenceTheme, pinned: ReferenceTheme): void {
  assert.deepEqual(actual.theme, pinned.theme, `${pinned.theme.id} theme metadata must match the pinned fixture.`);
  assert.deepEqual(actual.sources, pinned.sources,
    `${pinned.theme.id} source mismatch: fixture ${pinned.vscode.version}, runtime ${actual.vscode.version}. Do not loosen the check or replace the fixture to hide this failure.`);
}

export async function prepareTestEditor(options: PrepareOptions, services: PrepareServices = {}): Promise<string> {
  const env = services.env ?? process.env;
  if (!options.download || env.GITHUB_ACTIONS !== "true" || !env.GITHUB_ENV) {
    throw new Error("Editor downloads are CI-only and require --download, GITHUB_ACTIONS=true, and GITHUB_ENV. Developer test commands still require an existing isolated editor executable.");
  }
  const root = path.resolve(services.root ?? path.join(__dirname, ".."));
  const manifest = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Extension manifest");
  const engine = requireString(requireRecord(manifest.engines, "Extension engines").vscode, "VS Code engine");
  const version = selectEditorVersion(options.version, engine);
  const cachePath = path.join(root, ".vscode-test", "acceptance-editors");
  await mkdir(cachePath, { recursive: true });
  const executable = await (services.download ?? downloadAndUnzipVSCode)({
    version,
    cachePath,
    timeout: 120_000
  });
  const actualExecutable = await realpath(executable);
  const relative = path.relative(await realpath(cachePath), actualExecutable);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The downloaded editor must stay inside the isolated acceptance cache; a normal editor installation cannot be reused.");
  }
  if (/[\r\n\0]/.test(actualExecutable)) {
    throw new Error("The editor executable path cannot contain environment-file control characters.");
  }
  const app = await resolveEditorAppDirectory(actualExecutable, services.platform);
  const appPackage = requireRecord(JSON.parse(await readFile(path.join(app, "package.json"), "utf8")), "Editor package");
  const product = requireRecord(JSON.parse(await readFile(path.join(app, "product.json"), "utf8")), "Editor product");
  const actualVersion = requireString(product.version ?? appPackage.version, "Downloaded editor version");
  if (actualVersion !== version || appPackage.version !== version || product.quality !== "stable") {
    throw new Error(`Requested stable VS Code ${version}, but the downloaded editor reports ${actualVersion} (${String(product.quality)}). No editor path was exported.`);
  }
  const commit = requireString(product.commit, "Downloaded editor commit");
  if (options.verifyNativeSources) {
    for (const pinned of Object.values(references)) {
      const actual = await captureTheme(app, pinned.theme.id);
      assertNativeSources(actual, pinned);
      console.log(`Verified ${pinned.theme.id} source hashes: fixture ${pinned.vscode.version}; actual runtime ${version} (${commit}).`);
    }
  }
  await appendFile(env.GITHUB_ENV, `VSCODE_EXECUTABLE_PATH=${actualExecutable}\n`, "utf8");
  console.log(`Prepared isolated stable VS Code ${version} (${commit}): ${actualExecutable}`);
  return actualExecutable;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    download: { type: "boolean", default: false },
    version: { type: "string" },
    "verify-native-sources": { type: "boolean", default: false }
  } });
  await prepareTestEditor({
    download: values.download,
    version: values.version,
    verifyNativeSources: values["verify-native-sources"]
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
