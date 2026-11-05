import { build } from "esbuild";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    vscode: { type: "string" },
    "empty-window": { type: "boolean", default: false }
  } });
  const executable = values.vscode ?? process.env.VSCODE_EXECUTABLE_PATH;
  if (!executable) {
    throw new Error("Set VSCODE_EXECUTABLE_PATH or pass --vscode with an existing Code.exe. This test does not download or install VS Code.");
  }
  await access(executable);
  const root = path.resolve(__dirname, "..");
  const tests = path.join(root, "dist", "extension-host.test.cjs");
  await build({
    absWorkingDir: root,
    entryPoints: ["test/extension-host.ts"],
    outfile: tests,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["vscode"]
  });
  const temporary = await mkdtemp(path.join(os.tmpdir(), "themer-host-"));
  const profile = path.join(temporary, "profile");
  const workspace = path.join(temporary, "workspace");
  const extensions = path.join(temporary, "extensions");
  await Promise.all([
    mkdir(path.join(profile, "User"), { recursive: true }),
    mkdir(workspace),
    mkdir(extensions)
  ]);
  await writeFile(path.join(profile, "User", "settings.json"), JSON.stringify({
    "telemetry.telemetryLevel": "off",
    "extensions.autoCheckUpdates": false,
    "extensions.autoUpdate": false,
    "update.mode": "none",
    "workbench.startupEditor": "none",
    "workbench.colorTheme": "Dark 2026",
    "security.workspace.trust.enabled": false,
    "window.restoreWindows": "none",
    "chat.disableAIFeatures": true
  }, null, 2));
  try {
    console.log("Launching an isolated VS Code profile and temporary workspace. Current editor settings are not used.");
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: root,
      extensionTestsPath: tests,
      reuseMachineInstall: false,
      extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined, THEMER_EMPTY_WINDOW: values["empty-window"] ? "1" : "0" },
      launchArgs: [
        ...(values["empty-window"] ? [] : [workspace]),
        `--user-data-dir=${profile}`,
        `--extensions-dir=${extensions}`,
        "--new-window",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        "--disable-telemetry",
        "--disable-updates",
        "--disable-gpu"
      ]
    });
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
