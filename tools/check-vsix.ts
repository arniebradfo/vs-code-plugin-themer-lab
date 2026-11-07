import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import { parse, ParseError } from "jsonc-parser";
import { lexer, walkTokens } from "marked";
import { DefaultTreeAdapterMap, parseFragment } from "parse5";
import { parseStringPromise } from "xml2js";
import { fromBufferPromise, getFileNameLowLevel, parseExtraFields } from "yauzl";
import { editorSamples } from "../src/shared/samples";
import { isRecord, requireRecord, requireString } from "../src/shared/validation";

export interface CheckVsixOptions {
  vsix: string;
  commit: string;
  output: string;
  root?: string;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  commit: string;
  version: string;
  extensionId: string;
  packageName: string;
  sha256: string;
  files: string[];
}

const usage = "Usage: npm run check:vsix -- --vsix <path.vsix> --commit <40hex SHA> --output <path.json>";
const maxArchiveBytes = 128 * 1024 * 1024;
const maxEntryBytes = 32 * 1024 * 1024;
const maxExpandedBytes = 128 * 1024 * 1024;
const maxEntries = 1024;
const rasterExtensions = new Set([".png", ".gif", ".jpg", ".jpeg"]);
const developmentDocs = [
  "extension/docs/development/README.md",
  "extension/docs/development/publishing.md",
  "extension/docs/development/reference.md"
];
const blockedDirectories = new Set([
  ".git", ".github", ".vscode", ".vscode-test", ".ssh", ".aws", ".azure",
  "node_modules", "src", "test", "tests", "tools", "fixtures", "reports", "out", "artifacts"
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|npm_[A-Za-z0-9]{36,})\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:VSCE_PAT|NODE_AUTH_TOKEN|NPM_TOKEN|GITHUB_TOKEN)["']?\s*[:=]\s*["']?[A-Za-z0-9_./+-]{16,}/
];

function validateOptions(options: CheckVsixOptions): void {
  for (const field of ["vsix", "commit", "output"] as const) {
    const value = requireString(options[field], `--${field}`);
    if (!value.trim() || value.includes("\0")) throw new Error(`Invalid --${field}. ${usage}`);
  }
  if (!/^[a-f0-9]{40}(?![\s\S])/i.test(options.commit)) throw new Error(`--commit must be a full 40hex SHA. ${usage}`);
  if (path.extname(options.vsix).toLowerCase() !== ".vsix") throw new Error(`--vsix must name a .vsix file. ${usage}`);
  if (path.extname(options.output).toLowerCase() !== ".json") throw new Error(`--output must name a .json file. ${usage}`);
}

export function parseCheckVsixArgs(args: readonly string[]): CheckVsixOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (flag !== "--vsix" && flag !== "--commit" && flag !== "--output") {
      throw new Error(`Unknown argument ${flag ?? ""}. ${usage}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument ${flag}. ${usage}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}. ${usage}`);
    values.set(flag, value);
  }
  const options = {
    vsix: values.get("--vsix") ?? "",
    commit: values.get("--commit") ?? "",
    output: values.get("--output") ?? ""
  };
  validateOptions(options);
  return options;
}

function validateZipPath(name: string): void {
  const segments = (name.endsWith("/") ? name.slice(0, -1) : name).split("/");
  if (
    !name || name.startsWith("/") || /[\\:\u0000-\u001f\u007f\u2028\u2029]/.test(name) ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.endsWith(".") || segment.trim() !== segment)
  ) {
    throw new Error(`Unsafe VSIX ZIP path: ${JSON.stringify(name)}.`);
  }
  if (
    segments.some((segment) => blockedDirectories.has(segment.toLowerCase())) ||
    /(?:^|\/)(?:user[-_]?notes\.md|\.env(?:\.[^/]*)?|\.npmrc|\.vsce)(?![\s\S])/i.test(name) ||
    /\.(?:map|log|pem|key|pfx|p12)(?![\s\S])/i.test(name)
  ) {
    throw new Error(`Disallowed VSIX entry: ${name}.`);
  }
}

function extensionPath(value: unknown, label: string): string {
  const relative = requireString(value, label).replace(/^\.\//, "");
  const name = `extension/${relative}`;
  validateZipPath(name);
  return name;
}

function isRasterAsset(name: string): boolean {
  return name.startsWith("extension/assets/") && rasterExtensions.has(path.posix.extname(name).toLowerCase());
}

function validateRasterAsset(name: string, content: Buffer): void {
  const extension = path.posix.extname(name).toLowerCase();
  const png = extension === ".png" && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const gif = extension === ".gif" && ["GIF87a", "GIF89a"].includes(content.subarray(0, 6).toString("ascii"));
  const jpeg = (extension === ".jpg" || extension === ".jpeg") && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (!png && !gif && !jpeg) throw new Error(`Invalid raster image signature in VSIX asset: ${name}.`);
}

function requiredFile(files: Map<string, Buffer>, name: string): Buffer {
  const content = files.get(name);
  if (!content) throw new Error(`Missing required VSIX file: ${name}.`);
  if (!content.toString("utf8").trim()) throw new Error(`Empty required VSIX file: ${name}.`);
  return content;
}

function singleElement(value: unknown, label: string): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1) throw new Error(`${label} must occur exactly once.`);
  return requireRecord(value[0], label);
}

async function xmlDocument(content: Buffer, label: string): Promise<Record<string, unknown>> {
  const text = content.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`${label} must not contain DTDs or entity declarations.`);
  const parsed: unknown = await parseStringPromise(text, { strict: true, explicitArray: true });
  return requireRecord(parsed, label);
}

async function validateXml(files: Map<string, Buffer>, expected: Record<string, unknown>, readme: string, icon: string | undefined): Promise<void> {
  const document = await xmlDocument(requiredFile(files, "extension.vsixmanifest"), "VSIX XML manifest");
  const manifest = requireRecord(document.PackageManifest, "PackageManifest");
  const manifestAttributes = requireRecord(manifest.$, "PackageManifest attributes");
  if (manifestAttributes.xmlns !== "http://schemas.microsoft.com/developer/vsx-schema/2011" || manifestAttributes.Version !== "2.0.0") {
    throw new Error("Invalid VSIX XML manifest schema.");
  }
  const metadata = singleElement(manifest.Metadata, "VSIX Metadata");
  const identity = requireRecord(singleElement(metadata.Identity, "VSIX Identity").$, "VSIX Identity attributes");
  for (const [xmlKey, jsonKey] of [["Id", "name"], ["Publisher", "publisher"], ["Version", "version"]] as const) {
    if (identity[xmlKey] !== expected[jsonKey]) throw new Error(`VSIX XML ${xmlKey} does not match source package.json ${jsonKey}.`);
  }
  const assets = singleElement(manifest.Assets, "VSIX Assets");
  if (!Array.isArray(assets.Asset)) throw new Error("VSIX XML manifest must declare packaged assets.");
  const assetPaths = new Map<string, string>();
  for (const value of assets.Asset) {
    const asset = requireRecord(requireRecord(value, "VSIX Asset").$, "VSIX Asset attributes");
    const type = requireString(asset.Type, "VSIX Asset Type");
    const name = requireString(asset.Path, "VSIX Asset Path");
    validateZipPath(name);
    requiredFile(files, name);
    if (assetPaths.has(type)) throw new Error(`Duplicate VSIX XML asset type: ${type}.`);
    assetPaths.set(type, name);
  }
  if (assetPaths.get("Microsoft.VisualStudio.Code.Manifest") !== "extension/package.json") {
    throw new Error("VSIX XML manifest asset must point to extension/package.json.");
  }
  if (assetPaths.get("Microsoft.VisualStudio.Services.Content.Details") !== readme) {
    throw new Error("VSIX XML README asset does not point to the packaged README.");
  }
  if (assetPaths.get("Microsoft.VisualStudio.Services.Icons.Default") !== icon) {
    throw new Error("VSIX XML icon asset does not point to the declared packaged icon.");
  }
  const contentTypes = await xmlDocument(requiredFile(files, "[Content_Types].xml"), "VSIX content types");
  const types = requireRecord(contentTypes.Types, "VSIX content Types");
  if (requireRecord(types.$, "VSIX content Types attributes").xmlns !== "http://schemas.openxmlformats.org/package/2006/content-types") {
    throw new Error("Invalid VSIX content types schema.");
  }
}

interface ReadmeLink {
  destination: string;
  image: boolean;
}

function htmlLinks(node: DefaultTreeAdapterMap["node"], destinations: ReadmeLink[]): void {
  if ("attrs" in node) {
    for (const attribute of node.attrs) {
      if (attribute.name === "href" || attribute.name === "src") {
        destinations.push({ destination: attribute.value, image: node.tagName === "img" && attribute.name === "src" });
      }
    }
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) htmlLinks(child, destinations);
  }
}

function rewrittenAssetPath(destination: string, expected: Record<string, unknown>): string | undefined {
  const repository = typeof expected.repository === "string" ? expected.repository : isRecord(expected.repository) ? expected.repository.url : undefined;
  if (typeof repository !== "string" || !/^(?:git\+)?https:\/\//i.test(repository)) return undefined;
  if (/[\u0000-\u0020\u007f]/.test(repository)) throw new Error("Invalid source repository URL.");
  const source = new URL(repository.replace(/^git\+/i, ""));
  if (source.hostname !== "github.com") return undefined;
  const repositoryPath = source.pathname.endsWith(".git") ? source.pathname.slice(0, -4) : source.pathname;
  const [owner, repo] = repositoryPath.slice(1).split("/");
  if (!owner || !repo) return undefined;
  const url = new URL(destination.startsWith("//") ? `https:${destination}` : destination);
  if (url.protocol !== "https:") return undefined;
  const segments = url.pathname.slice(1).split("/");
  if (segments[0]?.toLowerCase() !== owner.toLowerCase() || segments[1]?.toLowerCase() !== repo.toLowerCase()) return undefined;
  let relative: string;
  if (url.hostname === "raw.githubusercontent.com" && segments[2]) relative = segments.slice(3).join("/");
  else if (url.hostname === "github.com" && (segments[2] === "raw" || segments[2] === "blob") && segments[3]) relative = segments.slice(4).join("/");
  else return undefined;
  relative = decodeURIComponent(relative);
  if (!relative.startsWith("assets/")) return undefined;
  return extensionPath(relative, "Rewritten README asset");
}

function validateReadme(content: Buffer, files: Map<string, Buffer>, expected: Record<string, unknown>): Set<string> {
  const destinations: ReadmeLink[] = [];
  walkTokens(lexer(content.toString("utf8")), (token) => {
    if (token.type === "link" || token.type === "image") {
      if (typeof token.href !== "string") throw new Error("Invalid packaged README link.");
      destinations.push({ destination: token.href, image: token.type === "image" });
    }
    if (token.type === "html") htmlLinks(parseFragment(requireString(token.text, "README HTML")), destinations);
  });
  const referencedAssets = new Set<string>();
  for (const { destination, image } of destinations) {
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(destination)) throw new Error("Invalid control character in packaged README link.");
    if (!destination || destination.startsWith("#")) continue;
    if (/^(?:https?:\/\/|\/\/)/i.test(destination)) {
      const url = new URL(destination.startsWith("//") ? `https:${destination}` : destination);
      if (url.username || url.password) throw new Error("Packaged README URLs must not contain credentials.");
      if (image && path.posix.extname(decodeURIComponent(url.pathname)).toLowerCase() === ".svg") {
        throw new Error("SVG Marketplace image assets are not allowed.");
      }
      const name = rewrittenAssetPath(destination, expected);
      if (name && files.has(name)) referencedAssets.add(name);
      continue;
    }
    if (/^mailto:/i.test(destination)) continue;
    const local = decodeURIComponent(destination.split(/[?#]/, 1)[0] ?? "");
    if (!local || local.startsWith("/") || /[\\:\u0000-\u001f\u007f\u2028\u2029]/.test(local)) {
      throw new Error(`Invalid packaged README local link: ${destination}.`);
    }
    const name = path.posix.normalize(path.posix.join("extension", local));
    if (!name.startsWith("extension/") || !files.has(name)) {
      throw new Error(`Packaged README local link does not resolve: ${destination}.`);
    }
    if (isRasterAsset(name)) referencedAssets.add(name);
  }
  return referencedAssets;
}

export async function checkVsix(options: CheckVsixOptions): Promise<ReleaseManifest> {
  validateOptions(options);
  const root = path.resolve(options.root ?? path.resolve(__dirname, ".."));
  const output = path.resolve(options.output);
  const sourceManifest = path.join(root, "package.json");
  if (output === sourceManifest || (process.platform === "win32" && output.toLowerCase() === sourceManifest.toLowerCase())) {
    throw new Error("--output must not overwrite source package.json.");
  }
  const expected = requireRecord(JSON.parse(await readFile(sourceManifest, "utf8")), "Source package.json");
  const name = requireString(expected.name, "Source package name");
  const publisher = requireString(expected.publisher, "Source publisher");
  const version = requireString(expected.version, "Source version");
  if (!/^[a-z0-9][a-z0-9-]*(?![\s\S])/i.test(name) || !/^[a-z0-9][a-z0-9-]*(?![\s\S])/i.test(publisher)) {
    throw new Error("Source extension name and publisher must be valid identifiers.");
  }
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][A-Za-z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][A-Za-z0-9-]*))*)?(?:\+[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?(?![\s\S])/.test(version)) {
    throw new Error("Source extension version must be a semantic version.");
  }
  const main = extensionPath(expected.main, "Source main");
  if (main !== "extension/dist/extension.cjs") throw new Error("Source main must point to the runtime extension bundle.");
  const icon = expected.icon === undefined ? undefined : extensionPath(expected.icon, "Source icon");
  if (icon && !isRasterAsset(icon)) throw new Error("Declared icon must be a PNG, GIF, or JPEG image under assets/.");
  const themes = requireRecord(expected.contributes, "Source contributes").themes;
  if (!Array.isArray(themes) || themes.length === 0) throw new Error("Source package.json must contribute themes.");
  const themePaths = themes.map((value: unknown) => {
    const name = extensionPath(requireRecord(value, "Source theme").path, "Source theme path");
    if (!name.startsWith("extension/themes/") || !name.endsWith(".json")) throw new Error(`Invalid source theme path: ${name}.`);
    return name;
  });
  const required = new Set([
    "extension.vsixmanifest", "[Content_Types].xml", "extension/package.json", main,
    "extension/dist/webview.js", "extension/dist/webview.css",
    "extension/dist/THIRD_PARTY_LICENSES.txt", "extension/THIRD_PARTY_NOTICES.md",
    ...developmentDocs, ...themePaths,
    ...editorSamples.map((sample) => `extension/samples/${sample.file}`), "extension/samples/tsconfig.json"
  ]);
  if (icon) required.add(icon);
  const allowed = new Set([
    ...required, "extension/readme.md", "extension/changelog.md", "extension/PLAN.md", "extension/SECURITY.md",
    "extension/docs/development/acceptance.md",
    "extension/LICENSE", "extension/LICENSE.md", "extension/LICENSE.txt",
    "extension/dist/extension.cjs.LEGAL.txt", "extension/dist/webview.js.LEGAL.txt"
  ].map((name) => name.toLowerCase()));
  const directories = new Set<string>();
  for (const name of allowed) {
    for (let parent = path.posix.dirname(name); parent !== "."; parent = path.posix.dirname(parent)) directories.add(`${parent}/`);
  }
  const archiveStat = await stat(options.vsix);
  if (!archiveStat.isFile() || archiveStat.size > maxArchiveBytes) throw new Error("VSIX must be a file no larger than 128 MiB.");
  const archive = await readFile(options.vsix);
  if (archive.length > maxArchiveBytes) throw new Error("VSIX exceeds the 128 MiB archive limit.");
  const zip = await fromBufferPromise(archive, { autoClose: false, strictFileNames: true, validateEntrySizes: true });
  const files = new Map<string, Buffer>();
  const seen = new Set<string>();
  let expandedBytes = 0;
  try {
    if (zip.entryCount > maxEntries) throw new Error("VSIX exceeds the 1024 ZIP entry limit.");
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      validateZipPath(name);
      const rawName = getFileNameLowLevel(entry.generalPurposeBitFlag, entry.fileNameRaw, [], true);
      validateZipPath(rawName);
      if (rawName !== name) throw new Error(`VSIX ZIP filename aliases are not permitted: ${name}.`);
      const directory = name.endsWith("/");
      const key = (directory ? name.slice(0, -1) : name).toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate VSIX ZIP entry: ${name}.`);
      seen.add(key);
      if (!(directory ? directories.has(`${key}/`) || name.startsWith("extension/assets/") : allowed.has(key) || isRasterAsset(name))) {
        throw new Error(`Unexpected VSIX file: ${name}.`);
      }
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((fileType !== 0 && fileType !== (directory ? 0o040000 : 0o100000)) || (!directory && (entry.externalFileAttributes & 0x10) !== 0)) {
        throw new Error(`VSIX must not contain symlinks or special files: ${name}.`);
      }
      if (entry.isEncrypted() || (entry.generalPurposeBitFlag & 0x40) !== 0) throw new Error(`Encrypted VSIX entry: ${name}.`);
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new Error(`Unsupported VSIX compression: ${name}.`);
      expandedBytes += entry.uncompressedSize;
      if (entry.uncompressedSize > maxEntryBytes || expandedBytes > maxExpandedBytes) throw new Error(`VSIX expanded size limit exceeded: ${name}.`);
      const local = await zip.readLocalFileHeaderPromise(entry);
      const localName = getFileNameLowLevel(local.generalPurposeBitFlag, local.fileName, parseExtraFields(local.extraField), true);
      validateZipPath(localName);
      if (
        localName !== name || !local.fileName.equals(entry.fileNameRaw) ||
        local.compressionMethod !== entry.compressionMethod || local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        ((entry.generalPurposeBitFlag & 0x08) === 0 && (
          local.crc32 !== entry.crc32 ||
          (local.compressedSize !== 0xffffffff && local.compressedSize !== entry.compressedSize) ||
          (local.uncompressedSize !== 0xffffffff && local.uncompressedSize !== entry.uncompressedSize)
        ))
      ) {
        throw new Error(`VSIX local and central ZIP headers disagree: ${name}.`);
      }
      if (directory) {
        if (entry.uncompressedSize !== 0 || entry.compressedSize !== 0 || entry.crc32 !== 0) throw new Error(`Nonempty VSIX directory entry: ${name}.`);
        continue;
      }
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let bytes = 0;
      let checksum = 0;
      try {
        for await (const chunk of stream) {
          if (!Buffer.isBuffer(chunk)) throw new Error(`Invalid VSIX data stream: ${name}.`);
          bytes += chunk.length;
          if (bytes > maxEntryBytes) throw new Error(`VSIX entry exceeds 32 MiB: ${name}.`);
          checksum = crc32(chunk, checksum);
          chunks.push(chunk);
        }
      } finally {
        stream.destroy();
      }
      if (bytes !== entry.uncompressedSize || checksum !== entry.crc32) throw new Error(`VSIX ZIP size or CRC-32 mismatch: ${name}.`);
      const content = Buffer.concat(chunks);
      if (secretPatterns.some((pattern) => pattern.test(content.toString("utf8")))) throw new Error(`Secret-like content in VSIX file: ${name}.`);
      if (isRasterAsset(name)) validateRasterAsset(name, content);
      files.set(name, content);
    }
  } finally {
    zip.close();
  }
  for (const name of required) requiredFile(files, name);
  const readme = [...files.keys()].find((name) => name.toLowerCase() === "extension/readme.md");
  if (!readme) throw new Error("Missing required VSIX file: extension/readme.md.");
  requiredFile(files, readme);
  const packaged = requireRecord(JSON.parse(requiredFile(files, "extension/package.json").toString("utf8")), "Packaged package.json");
  for (const field of ["name", "publisher", "version", "main", "license", "icon"] as const) {
    if (packaged[field] !== expected[field]) throw new Error(`Packaged package.json ${field} does not match source package.json.`);
  }
  if (requireRecord(packaged.engines, "Packaged engines").vscode !== requireRecord(expected.engines, "Source engines").vscode) {
    throw new Error("Packaged package.json VS Code engine does not match source package.json.");
  }
  const packagedThemes = requireRecord(packaged.contributes, "Packaged contributes").themes;
  if (!Array.isArray(packagedThemes) || packagedThemes.length !== themes.length) throw new Error("Packaged theme contributions do not match source package.json.");
  for (let index = 0; index < themes.length; index++) {
    const expectedTheme = requireRecord(themes[index], "Source theme");
    const packagedTheme = requireRecord(packagedThemes[index], "Packaged theme");
    for (const field of ["id", "label", "uiTheme", "path"] as const) {
      if (packagedTheme[field] !== expectedTheme[field]) throw new Error(`Packaged theme ${field} does not match source package.json.`);
    }
    const themePath = extensionPath(packagedTheme.path, "Packaged theme path");
    const errors: ParseError[] = [];
    const theme: unknown = parse(requiredFile(files, themePath).toString("utf8"), errors, { allowTrailingComma: true });
    if (errors.length > 0) throw new Error(`Invalid packaged theme JSON: ${themePath}.`);
    const document = requireRecord(theme, `Packaged theme ${themePath}`);
    if (document.include !== undefined) {
      const include = requireString(document.include, `Theme include in ${themePath}`).replace(/^\.\//, "");
      const includedPath = `${path.posix.dirname(themePath)}/${include}`;
      validateZipPath(includedPath);
      requiredFile(files, includedPath);
    }
  }
  if (existsSync(path.join(root, "LICENSE"))) {
    const expectedLicense = await readFile(path.join(root, "LICENSE"));
    if (!expectedLicense.toString("utf8").trim()) throw new Error("Source LICENSE must be nonempty.");
    const license = [...files.keys()].find((name) => name.toLowerCase() === "extension/license");
    if (!license || !requiredFile(files, license).equals(expectedLicense)) throw new Error("Packaged LICENSE must match the nonempty source LICENSE exactly.");
  }
  await validateXml(files, expected, readme, icon);
  const referencedAssets = validateReadme(requiredFile(files, readme), files, expected);
  if (icon) referencedAssets.add(icon);
  for (const name of files.keys()) {
    if (isRasterAsset(name) && !referencedAssets.has(name)) throw new Error(`Unreferenced VSIX image asset: ${name}.`);
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    commit: options.commit.toLowerCase(),
    version,
    extensionId: `${publisher}.${name}`,
    packageName: `${name}-${version}.vsix`,
    sha256: createHash("sha256").update(archive).digest("hex"),
    files: [...files.keys()].sort()
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function main(): Promise<void> {
  const manifest = await checkVsix(parseCheckVsixArgs(process.argv.slice(2)));
  console.log(`Verified ${manifest.extensionId}@${manifest.version}: ${manifest.files.length} ZIP files, SHA-256 ${manifest.sha256}.`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
