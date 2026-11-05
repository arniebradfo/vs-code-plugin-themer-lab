import { build } from "esbuild";
import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { runTests } from "@vscode/test-electron";
import { validateTolerance } from "../src/model/evaluation";
import { references } from "../src/shared/reference";
import { parseThemeMode } from "../src/shared/validation";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a loopback debugging port for the isolated syntax test.");
  }
  return address.port;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      vscode: { type: "string" },
      tolerance: { type: "string", default: "3" },
      mode: { type: "string", default: "dark" },
      "capture-only": { type: "boolean", default: false },
      "brackets-only": { type: "boolean", default: false },
      "ui-colors-only": { type: "boolean", default: false }
    }
  });
  const mode = parseThemeMode(values.mode);
  const reference = references[mode];
  if ([values["capture-only"], values["brackets-only"], values["ui-colors-only"]].filter(Boolean).length > 1) {
    throw new Error("Choose only one focused native capture, bracket, or UI color test.");
  }
  if (!values.tolerance?.trim()) {
    throw new Error("--tolerance requires a finite nonnegative number.");
  }
  const tolerance = validateTolerance(Number(values.tolerance));
  const executable = values.vscode ?? process.env.VSCODE_EXECUTABLE_PATH;
  if (!executable) {
    throw new Error("Set VSCODE_EXECUTABLE_PATH or pass --vscode with an existing Code.exe. No editor is downloaded or installed.");
  }
  await access(executable);
  const root = path.resolve(__dirname, "..");
  const tests = path.join(root, "dist", "native-syntax.test.cjs");
  await build({
    absWorkingDir: root,
    entryPoints: [values["ui-colors-only"] ? "test/native-ui-host.ts" : "test/native-syntax-host.ts"],
    outfile: tests,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["vscode"]
  });
  const temporary = await mkdtemp(path.join(os.tmpdir(), "themer-syntax-"));
  const profile = path.join(temporary, "profile");
  const workspace = path.join(temporary, "workspace");
  const extensions = path.join(temporary, "extensions");
  try {
    await Promise.all([
      mkdir(path.join(profile, "User"), { recursive: true }),
      mkdir(workspace),
      mkdir(extensions)
    ]);
    await cp(path.join(root, "samples"), path.join(workspace, "samples"), { recursive: true });
    await writeFile(path.join(profile, "User", "settings.json"), JSON.stringify({
      "telemetry.telemetryLevel": "off",
      "extensions.autoCheckUpdates": false,
      "extensions.autoUpdate": false,
      "extensions.ignoreRecommendations": true,
      "update.mode": "none",
      "workbench.startupEditor": "none",
      "workbench.colorTheme": reference.theme.id,
      "workbench.editor.enablePreview": false,
      "security.workspace.trust.enabled": false,
      "window.restoreWindows": "none",
      "chat.disableAIFeatures": true,
      "editor.fontSize": 12,
      "editor.lineHeight": 18,
      "editor.fontLigatures": false,
      "editor.wordWrap": "off",
      "editor.tabSize": 4,
      "editor.detectIndentation": false,
      "editor.folding": false,
      "editor.stickyScroll.enabled": false,
      "editor.minimap.enabled": false,
      "editor.codeLens": false,
      "editor.colorDecorators": false,
      "editor.inlayHints.enabled": "off",
      "editor.renderWhitespace": "none",
      "editor.renderValidationDecorations": "off",
      "editor.showUnused": false,
      "editor.showDeprecated": false,
      "editor.bracketPairColorization.enabled": false,
      "editor.guides.bracketPairs": false,
      "editor.matchBrackets": "never",
      "editor.semanticHighlighting.enabled": false
    }, null, 2));
    const port = await availablePort();
    console.log("Capturing actual editor text colors in a temporary VS Code profile; debugging is loopback-only.");
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: root,
      extensionTestsPath: tests,
      reuseMachineInstall: false,
      extensionTestsEnv: {
        ELECTRON_RUN_AS_NODE: undefined,
        THEMER_SYNTAX_ISOLATED: "1",
        THEMER_THEME_MODE: mode,
        THEMER_SYNTAX_DEBUG_PORT: String(port),
        THEMER_SYNTAX_TOLERANCE: String(tolerance),
        THEMER_SYNTAX_CAPTURE_ONLY: values["capture-only"] ? "1" : "0",
        THEMER_SYNTAX_BRACKETS_ONLY: values["brackets-only"] ? "1" : "0",
        THEMER_SYNTAX_REPORT_ROOT: path.join(root, "reports")
      },
      launchArgs: [
        workspace,
        `--user-data-dir=${profile}`,
        `--extensions-dir=${extensions}`,
        `--remote-debugging-port=${port}`,
        "--remote-debugging-address=127.0.0.1",
        "--new-window",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-workspace-trust",
        "--disable-telemetry",
        "--disable-updates",
        "--disable-extensions",
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
