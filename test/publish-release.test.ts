import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GalleryVersion, marketplaceDecision, parseGalleryVersions, reconcileMarketplace, requireGalleryUrl
} from "../tools/publish-release";

const version: GalleryVersion = {
  version: "0.1.0", preRelease: false, target: undefined,
  packageUrl: "https://example.gallery.vsassets.io/package"
};
const hash = "a".repeat(64);

function gallery(properties: unknown[] = [], files: unknown[] = [
  { assetType: "Microsoft.VisualStudio.Services.VSIXPackage", source: version.packageUrl }
]) {
  return { results: [{ extensions: [{
    extensionName: "themer-lab", publisher: { publisherName: "example" },
    versions: [{ version: "0.1.0", properties, files }]
  }] }] };
}

test("public gallery parsing distinguishes absence, stable publications, and pre-releases", () => {
  assert.deepEqual(parseGalleryVersions({ results: [{ extensions: [] }] }, "example.themer-lab"), []);
  assert.deepEqual(parseGalleryVersions(gallery(), "EXAMPLE.themer-lab"), [version]);
  assert.equal(parseGalleryVersions(gallery([
    { key: "Microsoft.VisualStudio.Code.PreRelease", value: "true" }
  ]), "example.themer-lab")[0]?.preRelease, true);
  assert.throws(() => parseGalleryVersions({ results: [{}] }, "example.themer-lab"), /extensions/);
  assert.throws(() => parseGalleryVersions(gallery([], [
    { assetType: "Microsoft.VisualStudio.Services.VSIXPackage", source: "https://untrusted.example/package" }
  ]), "example.themer-lab"), /trusted HTTPS/);
});

test("gallery downloads cannot use plaintext, embedded credentials, or untrusted hosts", () => {
  for (const url of [
    "http://example.gallery.vsassets.io/package", "https://user:password@marketplace.visualstudio.com/package",
    "https://vsassets.io.attacker.example/package", "https://other.example/package", "file:///C:/package"
  ]) assert.throws(() => requireGalleryUrl(url));
  assert.equal(requireGalleryUrl("https://marketplace.visualstudio.com/package").protocol, "https:");
});

test("new stable publications must advance; existing versions must be universal and unambiguous", () => {
  assert.equal(marketplaceDecision([], "0.1.0"), undefined);
  assert.equal(marketplaceDecision([version], "0.1.0"), version);
  assert.equal(marketplaceDecision([version], "0.1.1"), undefined);
  assert.throws(() => marketplaceDecision([version], "0.0.9"), /higher/);
  assert.throws(() => marketplaceDecision([version, version], "0.1.0"), /already/);
  assert.throws(() => marketplaceDecision([{ ...version, preRelease: true }], "0.1.0"), /pre-release/);
  assert.throws(() => marketplaceDecision([{ ...version, target: "win32-x64" }], "0.1.0"), /platform-specific/);
});

test("matching existing bytes reconcile a retry without uploading again", async () => {
  let uploads = 0;
  const state = await reconcileMarketplace({ version: "0.1.0", sha256: hash }, {
    versions: async () => [version], hash: async () => hash,
    upload: () => { uploads++; return 0; }, wait: async () => {}
  }, true);
  assert.equal(state, "verified");
  assert.equal(uploads, 0);
});

test("a read-only absent check performs no upload", async () => {
  let uploads = 0;
  assert.equal(await reconcileMarketplace({ version: "0.1.0", sha256: hash }, {
    versions: async () => [], hash: async () => hash,
    upload: () => { uploads++; return 0; }, wait: async () => {}
  }, false), "absent");
  assert.equal(uploads, 0);
});

test("an uncertain upload is sent once and reconciled only after exact bytes are visible", async () => {
  let uploads = 0;
  let queries = 0;
  let waits = 0;
  assert.equal(await reconcileMarketplace({ version: "0.1.0", sha256: hash }, {
    versions: async () => ++queries < 4 ? [] : [version], hash: async () => hash,
    upload: () => { uploads++; return 1; }, wait: async () => { waits++; }
  }, true), "verified");
  assert.equal(uploads, 1);
  assert.equal(queries, 4);
  assert.equal(waits, 2);
});

test("duplicate versions with different bytes fail instead of skipping or clobbering", async () => {
  let uploads = 0;
  await assert.rejects(reconcileMarketplace({ version: "0.1.0", sha256: hash }, {
    versions: async () => [version], hash: async () => "b".repeat(64),
    upload: () => { uploads++; return 0; }, wait: async () => {}
  }, true), /different VSIX bytes/);
  assert.equal(uploads, 0);
});

test("unverified Marketplace processing fails after a bounded wait without repeated uploads", async () => {
  let uploads = 0;
  let waits = 0;
  await assert.rejects(reconcileMarketplace({ version: "0.1.0", sha256: hash }, {
    versions: async () => [], hash: async () => hash,
    upload: () => { uploads++; return 1; }, wait: async () => { waits++; }
  }, true), /same candidate_run/);
  assert.equal(uploads, 1);
  assert.equal(waits, 19);
});
