import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { reference } from "../src/shared/reference";

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, ".vscode-test");
  await mkdir(directory, { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: ["test/browser-host.ts"],
    outfile: path.join(directory, "browser-host.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    legalComments: "inline"
  });
  const file = path.join(directory, "browser-preview.html");
  const stylesheet = pathToFileURL(path.join(root, "dist", "webview.css")).href;
  const host = pathToFileURL(path.join(directory, "browser-host.js")).href;
  const webview = pathToFileURL(path.join(root, "dist", "webview.js")).href;
  const nativeColors = Object.entries(reference.colors)
    .filter((entry): entry is [string, { value: string; source: string }] => entry[1].value !== null)
    .map(([id, entry]) => `--vscode-${id.replaceAll(".", "-")}:${entry.value};`).join("");
  await writeFile(file, `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Themer Lab - browser test harness</title>
<style>:root{${nativeColors}color-scheme:dark}body{color:var(--vscode-editor-foreground)}</style>
<link rel="stylesheet" href="${stylesheet}">
</head><body><aside role="note">Browser test harness only. No VS Code settings are changed.</aside>
<div id="app" data-development-preview="true"></div><script src="${host}"></script><script src="${webview}"></script></body></html>`);
  console.log(pathToFileURL(file).href);
  console.log("Development-only mock host. Use extension-host tests for actual workspace persistence.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
