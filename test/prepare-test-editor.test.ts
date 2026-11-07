import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { references } from "../src/shared/reference";
import { assertNativeSources, editorAppDirectory, prepareTestEditor, selectEditorVersion } from "../tools/prepare-test-editor";

test("acceptance editor selection defaults to the manifest minimum and allows later exact stable versions", () => {
  assert.equal(selectEditorVersion(undefined, "^1.143.0"), "1.143.0");
  for (const version of ["1.143.0", "1.143.1", "1.145.2", "1.200.0"]) {
    assert.equal(selectEditorVersion(version, "^1.143.0"), version);
  }
});

test("acceptance editor selection rejects aliases, malformed versions, and versions outside the manifest range", () => {
  for (const version of [
    "", "stable", "latest", "insiders", "1.143", "^1.143.0", "1.143.0-insider",
    "1.143.0+build", " 1.143.0", "1.143.0\n", "1.143.0\nINJECTED=1", "01.143.0",
    "1.0143.0", "1.143.00", "1.9007199254740992.0", "2d0b7506a36c1d6db9a466440131a8e01eab2289"
  ]) {
    assert.throws(() => selectEditorVersion(version, "^1.143.0"), /exact stable|safe integers/);
  }
  for (const version of ["1.142.99", "1.0.0", "0.143.0", "2.0.0"]) {
    assert.throws(() => selectEditorVersion(version, "^1.143.0"), /outside the manifest/);
  }
  for (const engine of ["*", ">=1.143.0", "^1.143", "1.143.0", "^01.143.0", "^1.143.0\n"]) {
    assert.throws(() => selectEditorVersion(undefined, engine), /caret minimum|exact stable/);
  }
});

test("editor application paths support Windows/Linux archives and macOS app bundles", () => {
  for (const platform of ["win32", "linux"] as const) {
    const executable = path.resolve("archive", platform === "win32" ? "Code.exe" : "code");
    assert.equal(editorAppDirectory(executable, platform), path.resolve("archive", "resources", "app"));
  }
  const executable = path.resolve("Visual Studio Code.app", "Contents", "MacOS", "Electron");
  assert.equal(editorAppDirectory(executable, "darwin"),
    path.resolve("Visual Studio Code.app", "Contents", "Resources", "app"));
});

test("editor preparation requires explicit CI opt-in before invoking the download API", async () => {
  for (const [download, env] of [
    [false, { GITHUB_ACTIONS: "true", GITHUB_ENV: "unused" }],
    [true, {}],
    [true, { GITHUB_ACTIONS: "false", GITHUB_ENV: "unused" }],
    [true, { GITHUB_ACTIONS: "true" }]
  ] as const) {
    await assert.rejects(prepareTestEditor({ download }, {
      env,
      download: async () => { throw new Error("The download API must not be called."); }
    }), /CI-only/);
  }
});

async function withEditor(run: (context: {
  root: string;
  executable: string;
  app: string;
  envFile: string;
  env: NodeJS.ProcessEnv;
}) => Promise<void>): Promise<void> {
  const scratch = path.resolve(__dirname, "..", ".vscode-test");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(path.join(scratch, "acceptance-helper-"));
  const archive = path.join(root, ".vscode-test", "acceptance-editors", "fake-editor");
  const executable = process.platform === "darwin"
    ? path.join(archive, "Visual Studio Code.app", "Contents", "MacOS", "Electron")
    : path.join(archive, process.platform === "win32" ? "Code.exe" : "code");
  const app = editorAppDirectory(executable);
  const envFile = path.join(root, "github-env");
  try {
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(app, { recursive: true });
    await writeFile(executable, "");
    await writeFile(path.join(root, "package.json"), JSON.stringify({ engines: { vscode: "^1.143.0" } }));
    await writeFile(path.join(app, "package.json"), JSON.stringify({ version: "1.143.0" }));
    await writeFile(path.join(app, "product.json"), JSON.stringify({ quality: "stable", commit: "test-commit" }));
    await writeFile(envFile, "EXISTING=preserved\n");
    await run({ root, executable, app, envFile, env: { GITHUB_ACTIONS: "true", GITHUB_ENV: envFile } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("editor preparation passes exact supported download options and appends the verified executable to GITHUB_ENV", async () => {
  await withEditor(async ({ root, executable, envFile, env }) => {
    let calls = 0;
    const result = await prepareTestEditor({ download: true }, {
      root,
      env,
      download: async (options) => {
        calls++;
        assert.deepEqual(options, {
          version: "1.143.0",
          cachePath: path.join(root, ".vscode-test", "acceptance-editors"),
          timeout: 120_000
        });
        return executable;
      }
    });
    assert.equal(calls, 1);
    assert.equal(result, executable);
    assert.equal(await readFile(envFile, "utf8"), `EXISTING=preserved\nVSCODE_EXECUTABLE_PATH=${executable}\n`);
  });
});

test("editor preparation honors a later exact stable version without substituting the manifest minimum", async () => {
  await withEditor(async ({ root, executable, app, envFile, env }) => {
    await writeFile(path.join(app, "package.json"), JSON.stringify({ version: "1.145.2" }));
    await prepareTestEditor({ download: true, version: "1.145.2" }, {
      root,
      env,
      download: async (options) => {
        assert.equal(options.version, "1.145.2");
        return executable;
      }
    });
    assert.equal(await readFile(envFile, "utf8"), `EXISTING=preserved\nVSCODE_EXECUTABLE_PATH=${executable}\n`);
  });
});

test("editor preparation rejects mismatched versions and nonstable builds without exporting an executable", async () => {
  for (const metadata of [
    { quality: "stable", version: "1.143.1", commit: "test-commit" },
    { quality: "insider", commit: "test-commit" },
    { commit: "test-commit" }
  ]) {
    await withEditor(async ({ root, executable, app, envFile, env }) => {
      await writeFile(path.join(app, "product.json"), JSON.stringify(metadata));
      await assert.rejects(prepareTestEditor({ download: true }, {
        root, env, download: async () => executable
      }), /Requested stable VS Code/);
      assert.equal(await readFile(envFile, "utf8"), "EXISTING=preserved\n");
    });
  }
  await withEditor(async ({ root, executable, app, envFile, env }) => {
    await writeFile(path.join(app, "package.json"), JSON.stringify({ version: "1.143.1" }));
    await assert.rejects(prepareTestEditor({ download: true }, {
      root, env, download: async () => executable
    }), /Requested stable VS Code/);
    assert.equal(await readFile(envFile, "utf8"), "EXISTING=preserved\n");
  });
});

test("editor preparation rejects editor paths outside its isolated cache", async () => {
  await withEditor(async ({ root, envFile, env }) => {
    const outside = path.join(root, "normal-Code.exe");
    await writeFile(outside, "");
    await assert.rejects(prepareTestEditor({ download: true }, {
      root, env, download: async () => outside
    }), /isolated acceptance cache/);
    assert.equal(await readFile(envFile, "utf8"), "EXISTING=preserved\n");
  });
});

test("native source verification preserves both pinned fixture versions and rejects hash, order, and path changes", () => {
  assert.equal(references.dark.vscode.version, "1.143.0");
  assert.equal(references.light.vscode.version, "1.143.1");
  for (const pinned of Object.values(references)) {
    const actual = { ...pinned, vscode: { version: "1.143.1", commit: "actual-runtime-commit" } };
    assert.doesNotThrow(() => assertNativeSources(actual, pinned));
    const changed = structuredClone(actual);
    changed.sources[0]!.sha256 = "0".repeat(64);
    assert.throws(() => assertNativeSources(changed, pinned), /source mismatch/);
    assert.throws(() => assertNativeSources({ ...actual, sources: [...actual.sources].reverse() }, pinned), /source mismatch/);
    const renamed = structuredClone(actual);
    renamed.sources[0]!.path = "extensions/theme-defaults/themes/replacement.json";
    assert.throws(() => assertNativeSources(renamed, pinned), /source mismatch/);
    assert.throws(() => assertNativeSources({ ...actual, theme: { ...actual.theme, name: "Changed theme" } }, pinned), /theme metadata/);
  }
});

test("native source failures prevent GITHUB_ENV export", async () => {
  await withEditor(async ({ root, executable, app, envFile, env }) => {
    const themes = path.join(app, "extensions", "theme-defaults", "themes");
    await mkdir(themes, { recursive: true });
    await writeFile(path.join(path.dirname(themes), "package.json"), JSON.stringify({
      contributes: { themes: [{ id: "Dark 2026", uiTheme: "vs-dark", path: "./themes/changed.json" }] }
    }));
    await writeFile(path.join(themes, "changed.json"), JSON.stringify({ name: references.dark.theme.name, colors: {} }));
    await assert.rejects(prepareTestEditor({ download: true, verifyNativeSources: true }, {
      root, env, download: async () => executable
    }), /source mismatch/);
    assert.equal(await readFile(envFile, "utf8"), "EXISTING=preserved\n");
  });
});
