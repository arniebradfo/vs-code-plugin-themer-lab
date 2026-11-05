import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse, ParseError, printParseErrorCode } from "jsonc-parser";
import { ReferenceTheme, previewThemeNames } from "../src/shared/types";
import {
  isThemeColor,
  parseSemanticColors,
  parseTokenRules,
  requireRecord,
  requireString
} from "../src/shared/validation";

function parseJsonc(text: string, label: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`${label}: ${errors.map((error) => `${printParseErrorCode(error.error)} at ${error.offset}`).join(", ")}`);
  }
  return requireRecord(value, label);
}

export async function captureTheme(appDirectory: string, themeId = "Dark 2026"): Promise<ReferenceTheme> {
  const app = await realpath(appDirectory);
  const themeRoot = await realpath(path.join(app, "extensions", "theme-defaults"));
  const metadata = parseJsonc(await readFile(path.join(app, "product.json"), "utf8"), "product.json");
  const appPackage = parseJsonc(await readFile(path.join(app, "package.json"), "utf8"), "app package.json");
  const extension = parseJsonc(await readFile(path.join(themeRoot, "package.json"), "utf8"), "theme package.json");
  const contributes = requireRecord(extension.contributes, "Theme contributions");
  if (!Array.isArray(contributes.themes)) {
    throw new Error("The default theme extension does not contribute a theme list.");
  }
  const selected = contributes.themes
    .map((entry) => requireRecord(entry, "Theme contribution"))
    .find((entry) => entry.id === themeId);
  if (!selected) {
    throw new Error(`Theme ${themeId} was not found in the supplied installation.`);
  }
  if (selected.uiTheme !== "vs-dark" && selected.uiTheme !== "vs") {
    throw new Error("Capture supports standard dark and light themes, not high-contrast themes.");
  }
  const colors: ReferenceTheme["colors"] = {};
  const sources: ReferenceTheme["sources"] = [];
  const tokenColors: ReferenceTheme["tokenColors"] = [];
  const semanticTokenColors: ReferenceTheme["semanticTokenColors"] = {};
  const visiting = new Set<string>();
  let semanticHighlighting = false;

  async function visit(filename: string): Promise<Record<string, unknown>> {
    const actual = await realpath(filename);
    const relative = path.relative(themeRoot, actual);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Theme include escapes the default-theme directory: ${filename}`);
    }
    if (visiting.has(actual)) {
      throw new Error(`Theme include cycle: ${relative}`);
    }
    visiting.add(actual);
    const text = await readFile(actual, "utf8");
    const document = parseJsonc(text, relative);
    if (document.include !== undefined) {
      await visit(path.resolve(path.dirname(actual), requireString(document.include, "Theme include")));
    }
    const source = path.relative(app, actual).split(path.sep).join("/");
    sources.push({ path: source, sha256: createHash("sha256").update(text).digest("hex") });
    if (document.colors !== undefined) {
      for (const [id, value] of Object.entries(requireRecord(document.colors, `Colors in ${relative}`))) {
        if (value !== null && !isThemeColor(value)) {
          throw new Error(`Invalid color ${id} in ${relative}.`);
        }
        colors[id] = { value, source };
      }
    }
    tokenColors.push(...parseTokenRules(document.tokenColors, `Tokens in ${relative}`));
    Object.assign(semanticTokenColors, parseSemanticColors(document.semanticTokenColors));
    if (document.semanticHighlighting !== undefined) {
      if (typeof document.semanticHighlighting !== "boolean") {
        throw new Error(`Invalid semanticHighlighting in ${relative}.`);
      }
      semanticHighlighting = document.semanticHighlighting;
    }
    visiting.delete(actual);
    return document;
  }

  const leaf = await visit(path.resolve(themeRoot, requireString(selected.path, "Theme path")));
  return {
    schemaVersion: 1,
    vscode: {
      version: requireString(metadata.version ?? appPackage.version, "VS Code version"),
      commit: requireString(metadata.commit, "VS Code commit")
    },
    theme: {
      id: themeId,
      name: requireString(leaf.name ?? themeId, "Theme name"),
      type: selected.uiTheme === "vs" ? "light" : "dark"
    },
    sources,
    coverage: {
      kind: "explicit-theme-chain",
      registeredDefaultsIncluded: false,
      runtimeResolved: false,
      limitations: [
        "Only explicit values in the bundled theme include chain are captured.",
        "Registered VS Code defaults, extension-contributed defaults, and user customizations are not captured.",
        "Alpha values are source colors, not runtime-composited pixels.",
        "Missing and null colors are not replaced with invented defaults."
      ]
    },
    colors: Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b, "en"))),
    tokenColors,
    semanticHighlighting,
    semanticTokenColors: Object.fromEntries(Object.entries(semanticTokenColors).sort(([a], [b]) => a.localeCompare(b, "en")))
  };
}

export function baselineThemeDocument(reference: ReferenceTheme): Record<string, unknown> {
  return {
    $schema: "vscode://schemas/color-theme",
    name: previewThemeNames[reference.theme.type],
    type: reference.theme.type,
    colors: Object.fromEntries(Object.entries(reference.colors).map(([id, entry]) => [id, entry.value])),
    tokenColors: reference.tokenColors,
    semanticHighlighting: reference.semanticHighlighting,
    semanticTokenColors: reference.semanticTokenColors
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      app: { type: "string" },
      theme: { type: "string" },
      out: { type: "string" },
      "write-theme": { type: "string" }
    }
  });
  const app = values.app ?? process.env.VSCODE_APP_PATH;
  if (!app) {
    throw new Error("Supply --app with the installed VS Code resources\\app directory, or set VSCODE_APP_PATH.");
  }
  const reference = await captureTheme(app, values.theme ?? "Dark 2026");
  const slug = reference.theme.id.toLowerCase().replaceAll("+", "-plus").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const output = path.resolve(values.out ?? path.join("fixtures", `vscode-${reference.vscode.version}`, `${slug}.json`));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(reference, null, 2)}\n`);
  const themePath = values["write-theme"];
  if (themePath) {
    await mkdir(path.dirname(path.resolve(themePath)), { recursive: true });
    await writeFile(themePath, `${JSON.stringify(baselineThemeDocument(reference), null, 2)}\n`);
  }
  console.log(`Captured ${Object.keys(reference.colors).length} explicit workbench colors, ${reference.tokenColors.length} token rules, ${reference.sources.length} source files.`);
  console.log(`VS Code ${reference.vscode.version} (${reference.vscode.commit}); ${output}`);
  console.log("Coverage: explicit theme chain only; registered defaults and runtime values are not included.");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
