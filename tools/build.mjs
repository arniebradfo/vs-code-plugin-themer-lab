import { build } from "esbuild";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await mkdir(path.join(root, ".vscode-test", "manual-workspace"), { recursive: true });
await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ["src/extension/index.ts"],
    outfile: path.join(dist, "extension.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["vscode"],
    sourcemap: true,
    legalComments: "external"
  }),
  build({
    absWorkingDir: root,
    entryPoints: ["src/webview/index.ts"],
    outfile: path.join(dist, "webview.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
    legalComments: "external"
  }),
  copyFile(path.join(root, "src", "webview", "styles.css"), path.join(dist, "webview.css"))
]);
const licenses = [];
for (const name of ["culori", "jsonc-parser"]) {
  const directory = path.join(root, "node_modules", name);
  const license = (await readdir(directory)).find((entry) => /^license(?:\.(?:md|txt))?$/i.test(entry));
  if (!license) {
    throw new Error(`Cannot package ${name} without its license.`);
  }
  licenses.push(`${name}\n${"=".repeat(name.length)}\n${await readFile(path.join(directory, license), "utf8")}`);
}
licenses.push(await readFile(path.join(root, "src", "webview", "codicons-LICENSE.txt"), "utf8"));
await writeFile(path.join(dist, "THIRD_PARTY_LICENSES.txt"), licenses.join("\n\n"));
console.log("Built extension, webview, stylesheet, and third-party notices.");
