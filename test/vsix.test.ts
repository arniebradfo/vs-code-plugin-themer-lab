import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { test } from "node:test";
import { createVSIX } from "@vscode/vsce";
import { fromBufferPromise } from "yauzl";
import { ZipFile } from "yazl";
import { editorSamples } from "../src/shared/samples";
import { requireRecord } from "../src/shared/validation";
import { CheckVsixOptions, checkVsix, parseCheckVsixArgs } from "../tools/check-vsix";

const root = path.resolve(__dirname, "..");
const commit = "f6b0bb18053515e9178642fc374b61f278f25059";
const namespace = "http://schemas.microsoft.com/developer/vsx-schema/2011";
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/></Types>';
const notice = "Third-party fixture notice.\n";
const runtime = "const fixtureRuntime = 'vsix-runtime-fixture';\n";
const pngFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC", "base64");
const gifFixture = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const jpegFixture = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9Uz/2Q==", "base64");

interface Fixture {
  files: Map<string, Buffer>;
  source: Record<string, unknown>;
  options: CheckVsixOptions;
  directory: string;
}

function xmlEscape(value: unknown): string {
  assert.equal(typeof value, "string");
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlManifest(source: Record<string, unknown>): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="${namespace}">
  <Metadata><Identity Id="${xmlEscape(source.name)}" Publisher="${xmlEscape(source.publisher)}" Version="${xmlEscape(source.version)}"/></Metadata>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/readme.md"/>
    ${typeof source.icon === "string" ? `<Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/${xmlEscape(source.icon.replace(/^\.\//, ""))}"/>` : ""}
  </Assets>
</PackageManifest>`;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const directory = path.join(root, "artifacts", `vsix-tests-${randomUUID()}`);
  const sourceRoot = path.join(directory, "source");
  await mkdir(sourceRoot, { recursive: true });
  const source = requireRecord(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")), "Test source manifest");
  const files = new Map<string, Buffer>();
  const put = (name: string, content: string) => files.set(name, Buffer.from(content));
  put("[Content_Types].xml", contentTypes);
  put("extension.vsixmanifest", xmlManifest(source));
  put("extension/package.json", JSON.stringify(source));
  put("extension/readme.md", "# Review build\n\n[Developer guide](docs/development/README.md)\n");
  put("extension/changelog.md", "# Changelog\n");
  put("extension/PLAN.md", "# Project plan\n");
  put("extension/SECURITY.md", "# Security reporting\n");
  put("extension/THIRD_PARTY_NOTICES.md", notice);
  put("extension/dist/extension.cjs", runtime);
  put("extension/dist/webview.js", runtime);
  put("extension/dist/webview.css", "body { color: white; }\n");
  put("extension/dist/THIRD_PARTY_LICENSES.txt", notice);
  if (typeof source.icon === "string") {
    const name = `extension/${source.icon.replace(/^\.\//, "")}`;
    const extension = path.posix.extname(name).toLowerCase();
    files.set(name, extension === ".gif" ? gifFixture : extension === ".jpg" || extension === ".jpeg" ? jpegFixture : pngFixture);
  }
  for (const name of ["README.md", "publishing.md", "reference.md"]) put(`extension/docs/development/${name}`, "# Developer guide\n");
  for (const sample of editorSamples) put(`extension/samples/${sample.file}`, `Sample ${sample.language}\n`);
  put("extension/samples/tsconfig.json", "{}\n");
  const themes = requireRecord(source.contributes, "Test contributions").themes;
  assert.ok(Array.isArray(themes));
  for (const value of themes) {
    const theme = requireRecord(value, "Test theme");
    assert.ok(typeof theme.path === "string");
    put(`extension/${theme.path.replace(/^\.\//, "")}`, JSON.stringify({ name: theme.label, colors: {}, tokenColors: [] }));
  }
  await writeFile(path.join(sourceRoot, "package.json"), JSON.stringify(source));
  const fixture: Fixture = {
    files, source, directory,
    options: { vsix: path.join(directory, "candidate.vsix"), commit, output: path.join(directory, "manifest.json"), root: sourceRoot }
  };
  try {
    await run(fixture);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeZip(
  fixture: Fixture,
  extra: readonly { name: string; content?: Buffer; mode?: number }[] = [],
  compress = true
): Promise<Buffer> {
  const zip = new ZipFile();
  const writing = pipeline(zip.outputStream, createWriteStream(fixture.options.vsix));
  for (const [name, content] of fixture.files) zip.addBuffer(content, name, { compress });
  for (const entry of extra) {
    if (entry.name.endsWith("/")) zip.addEmptyDirectory(entry.name, { mode: entry.mode });
    else zip.addBuffer(entry.content ?? Buffer.from("Extra fixture.\n"), entry.name, { compress, mode: entry.mode });
  }
  zip.end();
  await writing;
  return readFile(fixture.options.vsix);
}

function replaceBytes(archive: Buffer, before: string, after: string, occurrences: number): Buffer {
  assert.equal(Buffer.byteLength(before), Buffer.byteLength(after));
  const result = Buffer.from(archive);
  let count = 0;
  for (let index = result.indexOf(before); index !== -1; index = result.indexOf(before, index + Buffer.byteLength(after))) {
    result.write(after, index, "utf8");
    count++;
  }
  assert.equal(count, occurrences);
  return result;
}

test("VSIX checker reads compressed ZIP members and writes the exact release manifest schema", async () => {
  await withFixture(async (fixture) => {
    const archive = await writeZip(fixture, [{ name: "extension/samples/" }, { name: "extension/docs/development/" }]);
    const result = await checkVsix({ ...fixture.options, commit: commit.toUpperCase() });
    assert.deepEqual(result, {
      schemaVersion: 1,
      commit,
      version: fixture.source.version,
      extensionId: `${fixture.source.publisher}.${fixture.source.name}`,
      packageName: `${fixture.source.name}-${fixture.source.version}.vsix`,
      sha256: createHash("sha256").update(archive).digest("hex"),
      files: [...fixture.files.keys()].sort()
    });
    assert.equal(result.files.length, fixture.files.size);
    assert.deepEqual(JSON.parse(await readFile(fixture.options.output, "utf8")), result);
    assert.ok(!result.files.some((name) => name.endsWith("/")));
    assert.ok(!existsSync(path.join(fixture.options.root ?? "", "LICENSE")));
  });
});

test("VSIX review verification permits a local publisher and no project LICENSE", async () => {
  await withFixture(async (fixture) => {
    fixture.source.publisher = "themer-local";
    fixture.source.license = "UNLICENSED";
    await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify(fixture.source));
    fixture.files.set("extension/package.json", Buffer.from(JSON.stringify(fixture.source)));
    fixture.files.set("extension.vsixmanifest", Buffer.from(xmlManifest(fixture.source)));
    await writeZip(fixture);
    assert.equal((await checkVsix(fixture.options)).extensionId, "themer-local.themer-lab");
  });
});

test("VSIX permits the integrated acceptance guide and generated external legal notices", async () => {
  await withFixture(async (fixture) => {
    fixture.files.set("extension/docs/development/acceptance.md", Buffer.from("# Native acceptance guide\n"));
    fixture.files.set("extension/dist/extension.cjs.LEGAL.txt", Buffer.from(notice));
    fixture.files.set("extension/dist/webview.js.LEGAL.txt", Buffer.from(notice));
    fixture.files.set("extension/readme.md", Buffer.from("[Acceptance](docs/development/acceptance.md)\n"));
    await writeZip(fixture);
    const result = await checkVsix(fixture.options);
    assert.equal(result.files.length, fixture.files.size);
    assert.ok(result.files.includes("extension/docs/development/acceptance.md"));
  });
});

test("VSIX CLI accepts the parent workflow contract and reads root package.json", async () => {
  await withFixture(async (fixture) => {
    if (existsSync(path.join(root, "LICENSE"))) fixture.files.set("extension/LICENSE", await readFile(path.join(root, "LICENSE")));
    await writeZip(fixture);
    const result = spawnSync(process.execPath, [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "tools", "check-vsix.ts"),
      "--vsix", fixture.options.vsix, "--commit", commit, "--output", fixture.options.output
    ], { cwd: root, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`Verified .*${fixture.files.size} ZIP files`));
    assert.equal(requireRecord(JSON.parse(await readFile(fixture.options.output, "utf8")), "CLI manifest").commit, commit);
  });
});

test("VSIX CLI rejects missing, unknown, duplicate, malformed, and positional arguments", () => {
  const valid = ["--vsix", "candidate.vsix", "--commit", commit, "--output", "release-manifest.json"];
  assert.deepEqual(parseCheckVsixArgs(valid), { vsix: "candidate.vsix", commit, output: "release-manifest.json" });
  for (const args of [
    [], ["--help"], ["candidate.vsix"], ["--vsix"], valid.slice(0, 4),
    [...valid, "--commit", commit], [...valid, "--unknown", "x"],
    ["--vsix", "--commit", commit, "--output", "manifest.json"],
    ["--vsix", "", "--commit", commit, "--output", "manifest.json"],
    ["--vsix", "candidate.zip", "--commit", commit, "--output", "manifest.json"],
    ["--vsix", "candidate.vsix", "--commit", "abc123", "--output", "manifest.json"],
    ["--vsix", "candidate.vsix", "--commit", "g".repeat(40), "--output", "manifest.json"],
    ["--vsix", "candidate.vsix", "--commit", `${commit}\n`, "--output", "manifest.json"],
    ["--vsix", "candidate.vsix", "--commit", `${commit}\r\n`, "--output", "manifest.json"],
    ["--vsix", "candidate.vsix", "--commit", commit, "--output", "candidate.vsix"]
  ]) assert.throws(() => parseCheckVsixArgs(args), /argument|--vsix|--commit|--output/i);
});

for (const name of ["extension/readme.md", "extension/README.md"]) {
  test(`VSIX rejects duplicate ZIP filenames, including case collisions: ${name}`, async () => {
    await withFixture(async (fixture) => {
      await writeZip(fixture, [{ name }]);
      await assert.rejects(checkVsix(fixture.options), /Duplicate VSIX ZIP entry/);
      assert.ok(!existsSync(fixture.options.output));
    });
  });
}

for (const unsafe of [
  "../extension/readme.md", "/extension/readme.md", "C:/extension/readme.md", "C:extension/readme.md",
  "extension\\readme.md", "extension/../readme.md", "extension/./readme.md", "extension//readme.md",
  "extension/readme.md:stream", "extension/readme.md.", "extension/readme.md ", "extension/\0readme.md",
  "extension/readme.md\n", "extension/\u2028readme.md"
]) {
  test(`VSIX rejects unsafe ZIP paths: ${JSON.stringify(unsafe)}`, async () => {
    await withFixture(async (fixture) => {
      const placeholder = "safe" + "z".repeat(Buffer.byteLength(unsafe) - 4);
      const archive = await writeZip(fixture, [{ name: placeholder }]);
      // yazl rejects unsafe names; mutate equal-length local and central names in its actual ZIP.
      await writeFile(fixture.options.vsix, replaceBytes(archive, placeholder, unsafe, 2));
      await assert.rejects(checkVsix(fixture.options), /Unsafe|invalid.*(?:path|fileName)|absolute path|Disallowed/i);
    });
  });
}

for (const unwanted of [
  "src/extension/index.ts", "test/vsix.test.ts", "tools/check-vsix.ts", "reports/output.json", "fixtures/theme.json",
  ".github/workflows/ci.yml", ".vscode/settings.json", "node_modules/example/index.js", "artifacts/review.vsix",
  "USER-NOTES.md", ".env", ".env.production", ".npmrc", "credentials.json", "personal-notes.md",
  "private.key", "certificate.pem", "dist/webview.js.map", "dist/build.log", "dist/native-syntax.test.cjs",
  "dist/extension-host.test.cjs", "samples/private-notes.ts", "docs/development/notes.md", "docs/personal.md",
  "tsconfig.json", "package-lock.json"
]) {
  test(`VSIX rejects unintended packaged files: ${unwanted}`, async () => {
    await withFixture(async (fixture) => {
      await writeZip(fixture, [{ name: `extension/${unwanted}` }]);
      await assert.rejects(checkVsix(fixture.options), /Disallowed|Unexpected VSIX file/);
    });
  });
}

for (const missing of [
  "[Content_Types].xml", "extension.vsixmanifest", "extension/package.json", "extension/readme.md",
  "extension/dist/extension.cjs", "extension/dist/webview.js", "extension/dist/webview.css",
  "extension/THIRD_PARTY_NOTICES.md", "extension/dist/THIRD_PARTY_LICENSES.txt",
  "extension/themes/themer-base-color-theme.json", "extension/themes/themer-light-color-theme.json",
  "extension/samples/theme.ts", "extension/samples/Theme.cs", "extension/samples/tsconfig.json",
  "extension/docs/development/README.md", "extension/docs/development/publishing.md", "extension/docs/development/reference.md"
]) {
  test(`VSIX requires packaged runtime resources and documentation: ${missing}`, async () => {
    await withFixture(async (fixture) => {
      fixture.files.delete(missing);
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /Missing required VSIX file/);
      assert.ok(!existsSync(fixture.options.output));
    });
  });
}

test("VSIX rejects empty required files and malformed package/theme JSON", async () => {
  await withFixture(async (fixture) => {
    for (const [name, content, message] of [
      ["extension/dist/webview.css", "  \n", /Empty required VSIX file/],
      ["extension/package.json", "{", /JSON/],
      ["extension/themes/themer-base-color-theme.json", "{", /Invalid packaged theme JSON/],
      ["extension/themes/themer-base-color-theme.json", "[]", /must be an object/]
    ] as const) {
      const original = fixture.files.get(name);
      assert.ok(original);
      fixture.files.set(name, Buffer.from(content));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), message);
      fixture.files.set(name, original);
    }
  });
});

for (const field of ["name", "publisher", "version", "main", "license", "icon"] as const) {
  test(`VSIX JSON package ${field} must match source identity and metadata`, async () => {
    await withFixture(async (fixture) => {
      fixture.files.set("extension/package.json", Buffer.from(JSON.stringify({ ...fixture.source, [field]: "wrong" })));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), new RegExp(`package.json ${field} does not match`));
    });
  });
}

for (const field of ["Id", "Publisher", "Version"] as const) {
  test(`VSIX XML ${field} must match source identity`, async () => {
    await withFixture(async (fixture) => {
      const xml = xmlManifest(fixture.source).replace(new RegExp(`(<Identity\\b[^>]*\\b)${field}="[^"]*"`), `$1${field}="wrong"`);
      fixture.files.set("extension.vsixmanifest", Buffer.from(xml));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), new RegExp(`XML ${field} does not match`));
    });
  });
}

test("VSIX requires unambiguous XML identity, real XML documents, and resolving manifest assets", async () => {
  await withFixture(async (fixture) => {
    const original = xmlManifest(fixture.source);
    for (const xml of [
      "<PackageManifest>",
      original.replace(namespace, "https://example.com/not-vsix"),
      original.replace("</Metadata>", '<Identity Id="wrong" Publisher="wrong" Version="1.0.0"/></Metadata>'),
      original.replace("extension/package.json", "extension/missing.json"),
      original.replace("extension/readme.md", "extension/PLAN.md"),
      original.replace('Type="Microsoft.VisualStudio.Code.Manifest"', 'Type="Wrong.Manifest"'),
      `<!DOCTYPE PackageManifest [<!ENTITY injected "wrong">]>${original}`
    ]) {
      fixture.files.set("extension.vsixmanifest", Buffer.from(xml));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /XML|schema|exactly once|required VSIX file|README asset|manifest asset|DTD|Unclosed root tag/i);
    }
    fixture.files.set("extension.vsixmanifest", Buffer.from(original));
    fixture.files.set("[Content_Types].xml", Buffer.from("<not-content-types/>"));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /content Types/);
  });
});

test("VSIX packaged theme contributions and VS Code engine must match source", async () => {
  await withFixture(async (fixture) => {
    for (const change of ["missing", "path", "engine"]) {
      const packaged = structuredClone(fixture.source);
      const contributes = requireRecord(packaged.contributes, "Test contributions");
      const themes = contributes.themes;
      assert.ok(Array.isArray(themes));
      if (change === "missing") contributes.themes = [];
      if (change === "path") requireRecord(themes[0], "Test theme").path = "./themes/missing.json";
      if (change === "engine") requireRecord(packaged.engines, "Test engines").vscode = "^1.0.0";
      fixture.files.set("extension/package.json", Buffer.from(JSON.stringify(packaged)));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /theme.*match|engine.*match/);
    }
  });
});

test("VSIX README accepts packaged inline/reference/image/HTML links and HTTPS commit rewrites", async () => {
  await withFixture(async (fixture) => {
    fixture.files.set("extension/readme.md", Buffer.from(`# Review
[Guide](./docs/development/README.md#start)
[Reference][guide]

[guide]: docs/development/reference.md "Technical reference"

![Image syntax](samples/index.html)
<a href="docs/development/publishing.md?review=1&amp;build=2">Publishing</a>
<img src='samples/theme.json'/>
[Released commit](https://github.com/arniebradfo/vs-code-plugin-themer-lab/blob/${commit}/docs/development/README.md)
[External](https://example.com/missing.md)
[Mail](mailto:maintainer@example.com)
[Section](#review)
\`[Not a link](missing-inline.md)\`
\`\`\`markdown
[Example only](missing-example.md)
\`\`\`
`));
    await writeZip(fixture);
    await checkVsix(fixture.options);
  });
});

for (const link of [
  "[Missing](missing.md)", "![Missing](missing.png)", "[Ref][missing]\n\n[missing]: missing.md",
  '<a href="missing.html">Missing</a>', "<img src='missing.png'/>",
  "[Escapes](../outside.md)", "[Absolute](/outside.md)", "[Windows](C:\\outside.md)",
  "[Encoded traversal](%2e%2e/outside.md)", "[Wrong case](docs/development/readme.md)"
]) {
  test(`VSIX README local links must resolve: ${link}`, async () => {
    await withFixture(async (fixture) => {
      fixture.files.set("extension/readme.md", Buffer.from(link));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /README local link/);
    });
  });
}

test("VSIX requires an exact, nonempty packaged LICENSE when source LICENSE exists", async () => {
  await withFixture(async (fixture) => {
    const license = Buffer.from("Approved project license fixture.\r\n");
    await writeFile(path.join(fixture.options.root ?? "", "LICENSE"), license);
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Packaged LICENSE/);
    fixture.files.set("extension/LICENSE", Buffer.from("Different license.\n"));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Packaged LICENSE/);
    fixture.files.set("extension/LICENSE", Buffer.from("\n"));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Empty required VSIX file/);
    fixture.files.set("extension/LICENSE", license);
    await writeZip(fixture);
    const result = await checkVsix(fixture.options);
    assert.ok(result.files.includes("extension/LICENSE"));
    await writeFile(path.join(fixture.options.root ?? "", "LICENSE"), "");
    await assert.rejects(checkVsix(fixture.options), /Source LICENSE must be nonempty/);
  });
});

test("VSIX rejects symlinks, corrupted member data, invalid ZIPs, and truncated ZIPs", async () => {
  await withFixture(async (fixture) => {
    fixture.files.delete("extension/dist/webview.js");
    await writeZip(fixture, [{ name: "extension/dist/webview.js", mode: 0o120777 }]);
    await assert.rejects(checkVsix(fixture.options), /symlinks or special files/);
    fixture.files.set("extension/dist/webview.js", Buffer.from(runtime));
    const archive = await writeZip(fixture, [], false);
    await writeFile(fixture.options.vsix, replaceBytes(archive, runtime, runtime.replace("fixtureRuntime", "fixturERuntime"), 2));
    await assert.rejects(checkVsix(fixture.options), /CRC-32 mismatch/);
    await writeFile(fixture.options.vsix, "not a ZIP archive");
    await assert.rejects(checkVsix(fixture.options), /central directory|zipfile/i);
    await writeFile(fixture.options.vsix, archive.subarray(0, archive.length - 12));
    await assert.rejects(checkVsix(fixture.options), /central directory|comment length/i);
  });
});

test("VSIX checks local header paths rather than trusting central metadata alone", async () => {
  await withFixture(async (fixture) => {
    const archive = await writeZip(fixture);
    const result = Buffer.from(archive);
    const name = "extension/readme.md";
    const offset = result.indexOf(name);
    assert.ok(offset > 0);
    result.write(name.replace("/", "\\"), offset, "utf8");
    await writeFile(fixture.options.vsix, result);
    await assert.rejects(checkVsix(fixture.options), /Unsafe VSIX ZIP path/);
  });
});

test("VSIX rejects local/central checksum disagreement and encrypted entries", async () => {
  await withFixture(async (fixture) => {
    const archive = await writeZip(fixture);
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    const wrongChecksum = Buffer.from(archive);
    wrongChecksum.writeUInt32LE((wrongChecksum.readUInt32LE(14) ^ 1) >>> 0, 14);
    await writeFile(fixture.options.vsix, wrongChecksum);
    await assert.rejects(checkVsix(fixture.options), /local and central ZIP headers disagree/);
    const encrypted = Buffer.from(archive);
    const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(central > 0);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
    await writeFile(fixture.options.vsix, encrypted);
    await assert.rejects(checkVsix(fixture.options), /Encrypted VSIX entry/);
  });
});

test("VSIX enforces entry-count and expanded member size bounds before decompression", async () => {
  await withFixture(async (fixture) => {
    await writeZip(fixture, Array.from({ length: 1025 }, (_, index) => ({ name: `extra-${index}.txt` })));
    await assert.rejects(checkVsix(fixture.options), /1024 ZIP entry limit/);
    fixture.files.set("extension/dist/webview.js", Buffer.alloc(32 * 1024 * 1024 + 1, "x"));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /expanded size limit exceeded/);
    assert.ok(!existsSync(fixture.options.output));
  });
});

test("VSIX accepts JSONC theme documents and rejects dangling or unsafe theme includes", async () => {
  await withFixture(async (fixture) => {
    const theme = "extension/themes/themer-base-color-theme.json";
    fixture.files.set(theme, Buffer.from('{ // Accepted VS Code theme syntax.\n "colors": {}, "tokenColors": [], }'));
    await writeZip(fixture);
    await checkVsix(fixture.options);
    fixture.files.set(theme, Buffer.from('{"include":"./missing.json"}'));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Missing required VSIX file/);
    fixture.files.set(theme, Buffer.from('{"include":"../../package.json"}'));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Unsafe VSIX ZIP path/);
  });
});

test("VSIX checks obvious credential formats inside otherwise permitted documents", async () => {
  await withFixture(async (fixture) => {
    for (const secret of [
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      ["ghp", "a".repeat(36)].join("_"),
      ["github", "pat", "a".repeat(40)].join("_"),
      ["npm", "a".repeat(36)].join("_"),
      ["AKIA", "A".repeat(16)].join(""),
      `VSCE_PAT=${"a".repeat(32)}`
    ]) {
      fixture.files.set("extension/PLAN.md", Buffer.from(secret));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /Secret-like content in VSIX file: extension\/PLAN.md/);
    }
    assert.ok(!existsSync(fixture.options.output));
  });
});

test("VSIX API rejects invalid commits and refuses to overwrite source package.json", async () => {
  await withFixture(async (fixture) => {
    await writeZip(fixture);
    await assert.rejects(checkVsix({ ...fixture.options, commit: "short" }), /40hex/);
    await assert.rejects(checkVsix({ ...fixture.options, output: path.join(fixture.options.root ?? "", "package.json") }), /overwrite source/);
    if (process.platform === "win32") {
      await assert.rejects(checkVsix({ ...fixture.options, output: path.join(fixture.options.root ?? "", "PACKAGE.JSON") }), /overwrite source/);
    }
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.options.root ?? "", "package.json"), "utf8")), fixture.source);
  });
});

test("VSIX source identity requires a valid semantic version", async () => {
  await withFixture(async (fixture) => {
    await writeZip(fixture);
    for (const version of ["1.2", "01.2.3", "1.2.3-", "1.2.3-01", "1.2.3-..", "1.2.3+", "1.2.3\n", "1.2.3\r\n"]) {
      await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify({ ...fixture.source, version }));
      await assert.rejects(checkVsix(fixture.options), /must be a semantic version/);
    }
  });
});

test("VSIX source identifiers and API commits reject final-newline byte shapes", async () => {
  await withFixture(async (fixture) => {
    await writeZip(fixture);
    for (const sha of [`${commit}\n`, `${commit}\r\n`, `${commit}\u2028`]) {
      await assert.rejects(checkVsix({ ...fixture.options, commit: sha }), /40hex/);
    }
    for (const field of ["name", "publisher"] as const) {
      await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify({
        ...fixture.source, [field]: `${fixture.source[field]}\n`
      }));
      await assert.rejects(checkVsix(fixture.options), /valid identifiers/);
    }
  });
});

test("VSIX permits referenced PNG, GIF, JPG, and JPEG listing assets in safe nested paths", async () => {
  await withFixture(async (fixture) => {
    for (const [name, bytes] of [
      ["extension/assets/screenshots/dark.png", pngFixture],
      ["extension/assets/screenshots/preview.gif", gifFixture],
      ["extension/assets/screenshots/light.JPG", jpegFixture],
      ["extension/assets/screenshots/detail.jpeg", jpegFixture],
      ["extension/assets/screenshots/space name.png", pngFixture]
    ] as const) fixture.files.set(name, bytes);
    fixture.files.set("extension/readme.md", Buffer.from(`# Raster listing
![Dark](assets/screenshots/dark.png)
![Animated](assets/screenshots/preview.gif)
<img src="assets/screenshots/light.JPG"/>
[Detail](assets/screenshots/detail.jpeg)
![Space](assets/screenshots/space%20name.png)
`));
    await writeZip(fixture, [{ name: "extension/assets/" }, { name: "extension/assets/screenshots/" }]);
    assert.equal((await checkVsix(fixture.options)).files.length, fixture.files.size);
  });
});

test("VSIX permits raster listing assets referenced through VSCE HTTPS SHA or review-branch rewrites", async () => {
  await withFixture(async (fixture) => {
    const name = "extension/assets/screenshots/dark.png";
    fixture.files.set(name, pngFixture);
    for (const destination of [
      `https://raw.githubusercontent.com/arniebradfo/vs-code-plugin-themer-lab/${commit}/assets/screenshots/dark.png`,
      `https://github.com/arniebradfo/vs-code-plugin-themer-lab/raw/${commit}/assets/screenshots/dark.png`,
      `https://github.com/arniebradfo/vs-code-plugin-themer-lab/blob/${commit}/assets/screenshots/dark.png`,
      "https://github.com/arniebradfo/vs-code-plugin-themer-lab/raw/main/assets/screenshots/dark.png"
    ]) {
      fixture.files.set("extension/readme.md", Buffer.from(`![Dark](${destination})\n`));
      await writeZip(fixture);
      assert.ok((await checkVsix(fixture.options)).files.includes(name));
    }
  });
});

test("VSIX requires the source-declared icon file and its correct XML icon asset", async () => {
  await withFixture(async (fixture) => {
    const name = "extension/assets/icon.png";
    if (typeof fixture.source.icon === "string") fixture.files.delete(`extension/${fixture.source.icon.replace(/^\.\//, "")}`);
    fixture.source.icon = "./assets/icon.png";
    await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify(fixture.source));
    fixture.files.set("extension/package.json", Buffer.from(JSON.stringify(fixture.source)));
    fixture.files.set("extension.vsixmanifest", Buffer.from(xmlManifest(fixture.source)));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Missing required VSIX file: extension\/assets\/icon.png/);
    fixture.files.set(name, pngFixture);
    await writeZip(fixture);
    assert.ok((await checkVsix(fixture.options)).files.includes(name));
    fixture.files.set("extension.vsixmanifest", Buffer.from(xmlManifest(fixture.source).replace(
      'Type="Microsoft.VisualStudio.Services.Icons.Default"', 'Type="Wrong.Icon"'
    )));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /XML icon asset/);
  });
});

test("VSIX rejects unreferenced raster assets and unrelated remote-image references", async () => {
  await withFixture(async (fixture) => {
    fixture.files.set("extension/assets/unused.png", pngFixture);
    for (const readme of [
      "# No image references\n",
      `![Other repository](https://github.com/example/other/raw/${commit}/assets/unused.png)\n`,
      `![Other host](https://example.com/assets/unused.png)\n`
    ]) {
      fixture.files.set("extension/readme.md", Buffer.from(readme));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /Unreferenced VSIX image asset/);
    }
  });
});

for (const name of [
  "extension/assets/icon.svg", "extension/assets/icon.SVG", "extension/assets/source.ts",
  "extension/assets/source.js", "extension/assets/source.js.map", "extension/assets/build.log",
  "extension/assets/.env.png", "extension/assets/private.key", "extension/assets/src/preview.png",
  "extension/assets/reports/preview.png"
]) {
  test(`VSIX raster asset allowance still rejects SVG, source, maps, and secrets: ${name}`, async () => {
    await withFixture(async (fixture) => {
      await writeZip(fixture, [{ name, content: pngFixture }]);
      await assert.rejects(checkVsix(fixture.options), /Unexpected VSIX file|Disallowed VSIX entry/);
    });
  });
}

test("VSIX rejects SVG/source data disguised with raster extensions and embedded recognizable secrets", async () => {
  await withFixture(async (fixture) => {
    const name = "extension/assets/icon.png";
    fixture.files.set("extension/readme.md", Buffer.from("![Icon](assets/icon.png)\n"));
    for (const content of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), Buffer.from("export const source = true;")]) {
      fixture.files.set(name, content);
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /Invalid raster image signature/);
    }
    fixture.files.set(name, Buffer.concat([pngFixture, Buffer.from(["ghp", "a".repeat(36)].join("_"))]));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Secret-like content in VSIX file/);
  });
});

test("VSIX rejects SVG declared icons and SVG README image URLs", async () => {
  await withFixture(async (fixture) => {
    const originalIcon = fixture.source.icon;
    fixture.source.icon = "./assets/icon.svg";
    await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify(fixture.source));
    await writeZip(fixture);
    await assert.rejects(checkVsix(fixture.options), /Declared icon must be a PNG, GIF, or JPEG/);
    if (originalIcon === undefined) delete fixture.source.icon;
    else fixture.source.icon = originalIcon;
    await writeFile(path.join(fixture.options.root ?? "", "package.json"), JSON.stringify(fixture.source));
    fixture.files.set("extension/package.json", Buffer.from(JSON.stringify(fixture.source)));
    fixture.files.set("extension.vsixmanifest", Buffer.from(xmlManifest(fixture.source)));
    for (const destination of [
      "https://example.com/icon.svg", `https://github.com/arniebradfo/vs-code-plugin-themer-lab/raw/${commit}/assets/icon.svg`
    ]) {
      fixture.files.set("extension/readme.md", Buffer.from(`![SVG](${destination})\n`));
      await writeZip(fixture);
      await assert.rejects(checkVsix(fixture.options), /SVG Marketplace image assets/);
    }
  });
});

test("VSIX checker accepts actual VSCE icon metadata and full-SHA screenshot rewrites", async () => {
  await withFixture(async (fixture) => {
    if (typeof fixture.source.icon === "string") fixture.files.delete(`extension/${fixture.source.icon.replace(/^\.\//, "")}`);
    fixture.source.icon = "./assets/icon.png";
    fixture.source.scripts = {};
    fixture.files.set("extension/package.json", Buffer.from(JSON.stringify(fixture.source)));
    fixture.files.set("extension/assets/icon.png", pngFixture);
    fixture.files.set("extension/assets/screenshots/dark.png", pngFixture);
    fixture.files.set("extension/readme.md", Buffer.from("# Review\n\n![Dark screenshot](assets/screenshots/dark.png)\n"));
    const sourceRoot = fixture.options.root;
    assert.ok(sourceRoot);
    for (const [name, content] of fixture.files) {
      if (!name.startsWith("extension/")) continue;
      const destination = path.join(sourceRoot, name.slice("extension/".length));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    await createVSIX({
      cwd: sourceRoot, packagePath: fixture.options.vsix, dependencies: false, skipLicense: true, githubBranch: commit
    });
    const manifest = await checkVsix(fixture.options);
    assert.ok(manifest.files.includes("extension/assets/icon.png"));
    assert.ok(manifest.files.includes("extension/assets/screenshots/dark.png"));
    const zip = await fromBufferPromise(await readFile(fixture.options.vsix), { autoClose: false });
    try {
      let readme: Buffer | undefined;
      for await (const entry of zip.eachEntry()) {
        if (entry.fileName !== "extension/readme.md") continue;
        const chunks: Buffer[] = [];
        for await (const chunk of await zip.openReadStreamPromise(entry)) {
          assert.ok(Buffer.isBuffer(chunk));
          chunks.push(chunk);
        }
        readme = Buffer.concat(chunks);
      }
      assert.ok(readme);
      assert.ok(readme.toString("utf8").includes(`/${commit}/assets/screenshots/dark.png`));
    } finally {
      zip.close();
    }
  });
});
