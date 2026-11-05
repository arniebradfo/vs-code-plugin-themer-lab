import assert from "node:assert/strict";
import { test } from "node:test";
import { getDefaultParameters } from "../src/model";
import { references } from "../src/shared/reference";
import type { GeneratedSyntax, ThemeMode, ThemeParameters } from "../src/shared/types";
import { ThemeSettingsTarget, legacyPreviewThemeNames, previewThemeNames } from "../src/shared/types";
import { migrateThemeNames } from "../src/extension/theme-names";
import { getDefaultSyntaxParameters, getSyntaxModel } from "../src/syntax";
import { generateTheme, managedThemeColorIds, themeColors } from "../src/theme";
import {
  ColorCustomizations,
  PreviewAdapter,
  PreviewJournal,
  PreviewSession,
  ThemeSettings,
  parsePreviewJournal,
  previewConfirmation,
  legacyPairedPreviewScope,
  legacyPreviewScope,
  previewScope,
  previewThemeName
} from "../src/extension/preview";

class MemoryAdapter implements PreviewAdapter {
  constructor(readonly target: ThemeSettingsTarget = "workspace") {}
  settings: ThemeSettings = { theme: undefined, colors: undefined };
  journal: PreviewJournal | undefined;
  failColors: "before" | "after" | undefined;
  failTheme: boolean | "after" = false;
  failBracket: "before" | "after" | undefined;
  failSyntax: { setting: "tokens" | "semanticTokens"; timing: "before" | "after" } | undefined;
  failJournal: { phase: "prepare" | "complete" | "clear"; timing: "before" | "after" } | undefined;

  read(): ThemeSettings {
    return structuredClone(this.settings);
  }

  async writeColors(value: ColorCustomizations | undefined): Promise<void> {
    if (this.failColors === "before") {
      this.failColors = undefined;
      throw new Error("Color write failed before applying.");
    }
    this.settings.colors = structuredClone(value);
    if (this.failColors === "after") {
      this.failColors = undefined;
      throw new Error("Color write failed after applying.");
    }
  }

  async writeTheme(value: string | undefined): Promise<void> {
    const failure = this.failTheme;
    this.failTheme = false;
    if (failure === true) {
      throw new Error("Theme write failed.");
    }
    this.settings.theme = value;
    if (failure === "after") throw new Error("Theme write failed after applying.");
  }

  async writeTokens(value: ColorCustomizations | undefined): Promise<void> {
    this.writeSyntax("tokens", value);
  }

  async writeSemanticTokens(value: ColorCustomizations | undefined): Promise<void> {
    this.writeSyntax("semanticTokens", value);
  }

  async writeBracketColorization(value: boolean | undefined): Promise<void> {
    const failure = this.failBracket;
    this.failBracket = undefined;
    if (failure === "before") throw new Error("Bracket write failed before applying.");
    if (value === undefined) delete this.settings.bracketColorization;
    else this.settings.bracketColorization = value;
    if (failure === "after") throw new Error("Bracket write failed after applying.");
  }

  private writeSyntax(setting: "tokens" | "semanticTokens", value: ColorCustomizations | undefined): void {
    const failure = this.failSyntax?.setting === setting ? this.failSyntax : undefined;
    if (failure) this.failSyntax = undefined;
    if (failure?.timing === "before") throw new Error("Syntax write failed before applying.");
    if (value === undefined) delete this.settings[setting];
    else this.settings[setting] = structuredClone(value);
    if (failure?.timing === "after") throw new Error("Syntax write failed after applying.");
  }

  loadJournal(): unknown {
    return structuredClone(this.journal);
  }

  async saveJournal(value: PreviewJournal | undefined): Promise<void> {
    const phase = value === undefined ? "clear" : value.pendingColors !== null ? "prepare" : "complete";
    const failure = this.failJournal?.phase === phase ? this.failJournal : undefined;
    if (failure) this.failJournal = undefined;
    if (failure?.timing === "before") throw new Error("Journal write failed before applying.");
    this.journal = structuredClone(value);
    if (failure?.timing === "after") throw new Error("Journal write failed after applying.");
  }
}

const initial = { "editor.background": "#121314", "button.background": "#297aa0" };
const edited = { "editor.background": "#202020", "button.background": "#228844" };
const syntax: GeneratedSyntax = {
  editorForeground: "#c9d1d9",
  tokenColors: [{ scope: "keyword", settings: { foreground: "#ff7b72" } }],
  semanticHighlighting: true,
  semanticTokenColors: { newOperator: "#ff7b72" }
};
const editedSyntax: GeneratedSyntax = {
  ...syntax,
  tokenColors: [{ scope: "keyword", settings: { foreground: "#00ff00" } }],
  semanticTokenColors: { newOperator: "#00ff00" }
};

test("live preview confirmation stays concise and states scope, restore and save behavior", () => {
  assert.ok(previewConfirmation.length <= 160, `${previewConfirmation.length} characters`);
  assert.match(previewConfirmation, /workspace.*theme.*bracket/);
  assert.match(previewConfirmation, /Cancel or close Themer Lab to restore/);
  assert.match(previewConfirmation, /Apply saves to User settings/);
});

function generated(mode: ThemeMode, changes: Partial<ThemeParameters> = {}) {
  const reference = references[mode];
  const { palette, syntax } = generateTheme(reference, { ...getDefaultParameters(reference), ...changes },
    getDefaultSyntaxParameters(reference), getSyntaxModel(reference));
  return { colors: themeColors(palette, syntax.palette, syntax.brackets), syntax: syntax.palette };
}

for (const target of ["user", "workspace"] as const) {
  for (const mode of ["dark", "light"] as const) {
    test(`${target}/${mode}: legacy theme selection and all customization scopes migrate without changing values`, async () => {
      const adapter = new MemoryAdapter(target);
      adapter.settings = {
        theme: legacyPreviewThemeNames[mode],
        colors: {
          foreground: "#abcdef", "[Other]": { foreground: "#112233" },
          [legacyPreviewScope]: { "editor.background": "#123456" },
          [`[${legacyPreviewThemeNames.light}]`]: { "editor.background": "#eeeeee" },
          [legacyPairedPreviewScope]: { ...initial, "unknown.color": null },
          [`[Other]${legacyPreviewScope}`]: { foreground: "#445566" },
          "[Themer Lab*]": { "button.background": "#558899" }
        },
        tokens: { comments: "#778899", [legacyPairedPreviewScope]: { textMateRules: syntax.tokenColors } },
        semanticTokens: { enabled: false, [legacyPairedPreviewScope]: { enabled: true, rules: syntax.semanticTokenColors } },
        bracketColorization: false
      };
      const before = structuredClone(adapter.settings);
      assert.equal(await migrateThemeNames(adapter), true);
      assert.deepEqual(adapter.settings, {
        ...before, theme: previewThemeNames[mode],
        colors: {
          ...before.colors,
          [`[${previewThemeNames.dark}]`]: { "editor.background": "#123456" },
          [`[${previewThemeNames.light}]`]: { "editor.background": "#eeeeee" },
          [previewScope]: { ...initial, "unknown.color": null },
          [`[Other][${previewThemeNames.dark}]`]: { foreground: "#445566" }
        },
        tokens: { ...before.tokens, [previewScope]: { textMateRules: syntax.tokenColors } },
        semanticTokens: { ...before.semanticTokens, [previewScope]: { enabled: true, rules: syntax.semanticTokenColors } }
      });
      assert.equal(adapter.journal, undefined);
      const migrated = structuredClone(adapter.settings);
      assert.equal(await migrateThemeNames(adapter), false);
      assert.deepEqual(adapter.settings, migrated);
    });

    for (const action of ["keep", "restore"] as const) {
      test(`${target}/${mode}: legacy paired recovery ${action} finishes before migration`, async () => {
        const adapter = new MemoryAdapter(target);
        adapter.settings = {
          theme: "Dark 2026",
          colors: { [previewScope]: { "unowned.color": "#445566" } },
          bracketColorization: false
        };
        await new PreviewSession(adapter).start(initial, syntax, mode);
        assert.ok(adapter.journal);
        adapter.journal.scope = legacyPairedPreviewScope;
        adapter.settings.theme = legacyPreviewThemeNames[mode];
        for (const setting of ["colors", "tokens", "semanticTokens"] as const) {
          const root = adapter.settings[setting];
          assert.ok(root);
          root[legacyPairedPreviewScope] = root[previewScope];
          delete root[previewScope];
        }
        const before = structuredClone(adapter.settings);
        const journal = structuredClone(adapter.journal);
        assert.equal(await migrateThemeNames(adapter), false);
        assert.deepEqual(adapter.settings, before);
        assert.deepEqual(adapter.journal, journal);
        const recovered = new PreviewSession(adapter);
        await recovered[action]();
        assert.equal(adapter.journal, undefined);
        assert.equal(await migrateThemeNames(adapter), true);
        if (action === "keep") {
          assert.equal(adapter.settings.theme, previewThemeNames[mode]);
          assert.deepEqual(adapter.settings.colors?.[previewScope], { "unowned.color": "#445566", ...initial });
          assert.deepEqual(adapter.settings.tokens?.[previewScope], { textMateRules: syntax.tokenColors });
        } else {
          assert.deepEqual(adapter.settings, {
            theme: "Dark 2026",
            colors: {
              [legacyPairedPreviewScope]: { "unowned.color": "#445566" },
              [previewScope]: { "unowned.color": "#445566" }
            },
            bracketColorization: false
          });
        }
      });
    }

    test(`${target}/${mode}: interrupted legacy paired writes remain restorable under their original names`, async () => {
      const adapter = new MemoryAdapter(target);
      adapter.settings.theme = "Dark 2026";
      adapter.failTheme = "after";
      await assert.rejects(new PreviewSession(adapter).start(initial, syntax, mode), /Theme write failed/);
      assert.ok(adapter.journal);
      adapter.journal.scope = legacyPairedPreviewScope;
      adapter.settings.theme = legacyPreviewThemeNames[mode];
      for (const setting of ["colors", "tokens", "semanticTokens"] as const) {
        const root = adapter.settings[setting];
        assert.ok(root);
        root[legacyPairedPreviewScope] = root[previewScope];
        delete root[previewScope];
      }
      assert.equal(await migrateThemeNames(adapter), false);
      const recovered = new PreviewSession(adapter);
      assert.equal(recovered.canKeep, false);
      await assert.rejects(recovered.keep(), /interrupted/);
      assert.deepEqual(await recovered.restore(), { conflicts: [] });
      assert.deepEqual(adapter.settings, { theme: "Dark 2026", colors: undefined });
    });
  }

  for (const timing of ["before", "after"] as const) {
    for (const setting of ["colors", "tokens", "semanticTokens", "theme"] as const) {
      test(`${target}: legacy name migration retries a ${setting} failure ${timing} writing`, async () => {
        const adapter = new MemoryAdapter(target);
        adapter.settings = {
          theme: legacyPreviewThemeNames.dark,
          colors: { foreground: "#abcdef", [legacyPairedPreviewScope]: initial },
          tokens: { [legacyPairedPreviewScope]: { textMateRules: syntax.tokenColors } },
          semanticTokens: { [legacyPairedPreviewScope]: { enabled: true, rules: syntax.semanticTokenColors } }
        };
        const before = structuredClone(adapter.settings);
        if (setting === "colors") adapter.failColors = timing;
        else if (setting === "theme") adapter.failTheme = timing === "before" ? true : "after";
        else adapter.failSyntax = { setting, timing };
        await assert.rejects(migrateThemeNames(adapter), /write failed/);
        for (const key of ["colors", "tokens", "semanticTokens"] as const) {
          assert.deepEqual(adapter.settings[key]?.[legacyPairedPreviewScope], before[key]?.[legacyPairedPreviewScope]);
        }
        await migrateThemeNames(adapter);
        assert.deepEqual(adapter.settings, {
          theme: previewThemeNames.dark,
          colors: { ...before.colors, [previewScope]: initial },
          tokens: { ...before.tokens, [previewScope]: { textMateRules: syntax.tokenColors } },
          semanticTokens: { ...before.semanticTokens, [previewScope]: { enabled: true, rules: syntax.semanticTokenColors } }
        });
        assert.equal(adapter.journal, undefined);
      });
    }
  }
}

test("legacy name migration never overwrites existing new-name scopes or refills removed colors", async () => {
  const adapter = new MemoryAdapter("user");
  const dark = generated("dark");
  const light = generated("light");
  adapter.settings = {
    theme: legacyPreviewThemeNames.dark,
    colors: { [legacyPairedPreviewScope]: dark.colors },
    tokens: { [legacyPairedPreviewScope]: { textMateRules: [] }, [previewScope]: { textMateRules: syntax.tokenColors } },
    semanticTokens: {
      [legacyPairedPreviewScope]: { enabled: false, rules: {} },
      [previewScope]: { enabled: true, rules: syntax.semanticTokenColors }
    }
  };
  await migrateThemeNames(adapter);
  assert.deepEqual(adapter.settings.tokens?.[previewScope], { textMateRules: syntax.tokenColors });
  assert.deepEqual(adapter.settings.semanticTokens?.[previewScope], { enabled: true, rules: syntax.semanticTokenColors });
  await new PreviewSession(adapter, managedThemeColorIds).apply(light.colors, light.syntax, "light");
  const before = structuredClone(adapter.settings);
  assert.equal(await migrateThemeNames(adapter), false);
  assert.deepEqual(adapter.settings, before);
  assert.deepEqual(adapter.settings.colors?.[previewScope], light.colors);
  assert.deepEqual(adapter.settings.colors?.[legacyPairedPreviewScope], dark.colors,
    "Original legacy scopes remain intact as a backup.");
});

test("name migration does not touch unrelated themes, matching wildcards or absent settings", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings = {
    theme: "Other", colors: { "[Other]": { foreground: "#abcdef" }, "[Themer Lab*]": { foreground: "#123456" } },
    bracketColorization: false
  };
  const before = structuredClone(adapter.settings);
  assert.equal(await migrateThemeNames(adapter), false);
  assert.deepEqual(adapter.settings, before);
  adapter.settings = { theme: undefined, colors: undefined };
  assert.equal(await migrateThemeNames(adapter), false);
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
});

test("malformed migration scopes surface errors while keeping the legacy data and selection", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings = { theme: legacyPreviewThemeNames.dark, colors: { [legacyPairedPreviewScope]: "external invalid setting" } };
  const before = structuredClone(adapter.settings);
  await assert.rejects(migrateThemeNames(adapter), /Legacy theme settings.*must be an object/);
  assert.deepEqual(adapter.settings, before);
});

for (const target of ["user", "workspace"] as const) {
  test(`${target}: repeated Apply has exactly the current mode and Personality colors`, async () => {
    const adapter = new MemoryAdapter(target);
    const unrelated = { foreground: "#abcdef", "[Other]": { foreground: "#112233" } };
    adapter.settings.colors = { ...unrelated, [previewScope]: { "unowned.color": "#445566" } };
    const session = new PreviewSession(adapter, managedThemeColorIds);
    for (const [mode, statefulStatusBar] of [
      ["dark", false], ["light", false], ["dark", true], ["dark", false], ["light", true], ["light", false]
    ] as const) {
      const output = generated(mode, { statefulStatusBar });
      assert.ok(Object.keys(output.colors).every((id) => managedThemeColorIds.has(id)));
      await session.apply(output.colors, output.syntax, mode);
      assert.deepEqual(adapter.settings.colors, {
        ...unrelated, [previewScope]: { "unowned.color": "#445566", ...output.colors }
      });
      assert.equal(session.active, false);
      assert.equal(adapter.journal, undefined);
    }
  });

  for (const failure of [undefined, "before", "after"] as const) {
    test(`${target}: cleanup of prior generated keys restores exactly after ${failure ?? "successful preview"}`, async () => {
      const adapter = new MemoryAdapter(target);
      const dark = generated("dark");
      const light = generated("light");
      const session = new PreviewSession(adapter, managedThemeColorIds);
      await session.apply(dark.colors, dark.syntax, "dark");
      const before = structuredClone(adapter.settings);
      adapter.failColors = failure;
      if (failure) await assert.rejects(session.start(light.colors, light.syntax, "light"), /Color write failed/);
      else {
        await session.start(light.colors, light.syntax, "light");
        assert.equal(Object.hasOwn(adapter.read().colors?.[previewScope] ?? {}, "editorStickyScroll.background"), false);
      }
      const journal = parsePreviewJournal(adapter.loadJournal());
      assert.ok(journal?.clearedColors?.includes("editorStickyScroll.background"));
      assert.deepEqual(await new PreviewSession(adapter, managedThemeColorIds).restore(), { conflicts: [] });
      assert.deepEqual(adapter.settings, before);
    });
  }

  for (const timing of ["before", "after"] as const) {
    for (const setting of ["colors", "tokens", "semanticTokens", "brackets", "theme"] as const) {
      test(`${target}: a clear-after failure and ${setting} rollback failure ${timing} remain recoverable`, async () => {
        class CombinedFailureAdapter extends MemoryAdapter {
          private armed = true;
          override async saveJournal(value: PreviewJournal | undefined): Promise<void> {
            await super.saveJournal(value);
            if (value === undefined && this.armed) {
              this.armed = false;
              if (setting === "colors") this.failColors = timing;
              else if (setting === "tokens" || setting === "semanticTokens") this.failSyntax = { setting, timing };
              else if (setting === "brackets") this.failBracket = timing;
              else this.failTheme = timing === "before" ? true : "after";
              throw new Error("Journal clear failed after applying.");
            }
          }
        }
        const adapter = new CombinedFailureAdapter(target);
        const before = structuredClone(adapter.settings);
        const session = new PreviewSession(adapter);
        await assert.rejects(session.apply(initial, syntax, "dark"), /Restoration also failed.*journal was retained/);
        assert.equal(session.active, true);
        assert.ok(adapter.journal);
        assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
        assert.deepEqual(adapter.settings, before);
      });
    }
  }

  test(`${target}: direct Apply persists UI, both syntax systems and brackets without a live preview`, async () => {
    const adapter = new MemoryAdapter(target);
    adapter.settings = {
      theme: "Dark 2026",
      colors: { foreground: "#abcdef", "[Other]": { foreground: "#112233" }, [previewScope]: { "unowned.color": "#445566" } },
      tokens: { comments: "#778899", "[Other]": { strings: "#123456" }, [previewScope]: { numbers: "#abcdef" } },
      semanticTokens: { enabled: false, "[Other]": { rules: { variable: "#123456" } } },
      bracketColorization: false
    };
    const session = new PreviewSession(adapter);
    await session.apply(initial, syntax, "light");
    assert.equal(session.active, false);
    assert.equal(adapter.journal, undefined);
    assert.equal(adapter.settings.theme, previewThemeNames.light);
    assert.deepEqual(adapter.settings.colors, {
      foreground: "#abcdef", "[Other]": { foreground: "#112233" },
      [previewScope]: { "unowned.color": "#445566", ...initial }
    });
    assert.deepEqual(adapter.settings.tokens, {
      comments: "#778899", "[Other]": { strings: "#123456" },
      [previewScope]: { numbers: "#abcdef", textMateRules: syntax.tokenColors }
    });
    assert.deepEqual(adapter.settings.semanticTokens, {
      enabled: false, "[Other]": { rules: { variable: "#123456" } },
      [previewScope]: { enabled: true, rules: syntax.semanticTokenColors }
    });
    assert.equal(adapter.settings.bracketColorization, true);
    await assert.rejects(session.restore(), /No live preview/);
  });

  for (const timing of ["before", "after"] as const) {
    for (const setting of ["colors", "theme", "tokens", "semanticTokens", "brackets", "prepare", "complete", "clear"] as const) {
      test(`${target}: Apply rolls back a ${setting} failure ${timing} applying`, async () => {
        const adapter = new MemoryAdapter(target);
        adapter.settings = {
          theme: "Light 2026",
          colors: { [previewScope]: { "button.background": "#abcdef" } },
          tokens: { [previewScope]: { textMateRules: [] } },
          semanticTokens: { [previewScope]: { enabled: false, rules: {} } },
          bracketColorization: false
        };
        const before = structuredClone(adapter.settings);
        if (setting === "colors") adapter.failColors = timing;
        else if (setting === "theme") adapter.failTheme = timing === "before" ? true : "after";
        else if (setting === "tokens" || setting === "semanticTokens") adapter.failSyntax = { setting, timing };
        else if (setting === "brackets") adapter.failBracket = timing;
        else adapter.failJournal = { phase: setting, timing };
        const session = new PreviewSession(adapter);
        await assert.rejects(session.apply(initial, syntax, "dark"), /write failed/);
        assert.deepEqual(adapter.settings, before);
        assert.equal(adapter.journal, undefined);
        assert.equal(session.active, false);
      });
    }
  }
}

test("a failed clear and failed recovery storage do not claim durable recovery", async () => {
  class StorageFailureAdapter extends MemoryAdapter {
    failRecovery = true;
    private cleared = false;
    override async saveJournal(value: PreviewJournal | undefined): Promise<void> {
      if (this.cleared && this.failRecovery) throw new Error("Recovery storage unavailable.");
      await super.saveJournal(value);
      if (value === undefined && this.failRecovery) {
        this.cleared = true;
        throw new Error("Journal clear failed after applying.");
      }
    }
  }
  const adapter = new StorageFailureAdapter("user");
  const session = new PreviewSession(adapter);
  await assert.rejects(session.apply(initial, syntax, "dark"), (error: Error) =>
    /could not be saved.*Keep this window open/.test(error.message) && !/journal was retained/.test(error.message));
  assert.equal(adapter.journal, undefined);
  assert.equal(session.active, true);
  adapter.failRecovery = false;
  await session.restore();
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
});

for (const action of ["keep", "restore"] as const) {
  test(`${action}: failed clearing after deletion restores the recovery journal`, async () => {
    const adapter = new MemoryAdapter();
    const session = new PreviewSession(adapter);
    await session.start(initial, syntax);
    adapter.failJournal = { phase: "clear", timing: "after" };
    await assert.rejects(session[action](), /Journal write failed/);
    assert.ok(adapter.journal);
    await new PreviewSession(adapter).restore();
    assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
  });
}

test("recovery capabilities and operation identity reject stale Keep and Restore choices", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  assert.equal(session.recoveryToken, undefined);
  assert.equal(session.canKeep, false);
  await session.start(initial, syntax);
  const previousOperation = session.recoveryToken;
  assert.ok(previousOperation);
  assert.equal(session.canKeep, true);
  await session.update(edited, editedSyntax);
  assert.equal(session.recoveryToken, previousOperation);
  await session.restore(previousOperation);
  assert.equal(session.recoveryToken, undefined);
  await session.start(initial, syntax);
  assert.notEqual(session.recoveryToken, previousOperation);
  const before = structuredClone(adapter.settings);
  const journal = structuredClone(adapter.journal);
  await assert.rejects(session.keep(previousOperation), /recovery operation is no longer active/);
  await assert.rejects(session.restore(previousOperation), /recovery operation is no longer active/);
  assert.deepEqual(adapter.settings, before);
  assert.deepEqual(adapter.journal, journal);
  await session.keep(session.recoveryToken);
});

test("pending writes cannot be offered as keepable recovery", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  adapter.failTheme = true;
  await assert.rejects(session.start(initial, syntax), /Theme write failed/);
  assert.equal(session.active, true);
  assert.equal(session.canKeep, false);
  await session.restore();
});

test("mode expansion preserves an externally added formerly unowned color", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter, managedThemeColorIds);
  const light = generated("light");
  const dark = generated("dark");
  await session.start(light.colors, light.syntax, "light");
  const entry = adapter.settings.colors?.[previewScope];
  assert.ok(typeof entry === "object" && entry !== null);
  Object.assign(entry, { "debugToolBar.background": "#123456" });
  const before = structuredClone(adapter.settings);
  await assert.rejects(session.update(dark.colors, dark.syntax, "dark"), /outside Themer/);
  assert.deepEqual(adapter.settings, before);
  await session.restore();
  assert.deepEqual(adapter.settings.colors, { [previewScope]: { "debugToolBar.background": "#123456" } });
});

for (const failure of [undefined, "before", "after"] as const) {
  test(`actual mode changes journal removed keys through ${failure ?? "successful updates"}`, async () => {
    const adapter = new MemoryAdapter();
    adapter.settings.colors = { [previewScope]: { "terminal.background": "#556677", "unowned.color": "#445566" } };
    const before = structuredClone(adapter.settings);
    const session = new PreviewSession(adapter, managedThemeColorIds);
    const dark = generated("dark");
    const light = generated("light");
    await session.start(dark.colors, dark.syntax, "dark");
    adapter.failColors = failure;
    if (failure) await assert.rejects(session.update(light.colors, light.syntax, "light"), /Color write failed/);
    else {
      for (const [mode, output] of [["light", light], ["dark", dark], ["light", light]] as const) {
        await session.update(output.colors, output.syntax, mode);
        assert.deepEqual(adapter.settings.colors, { [previewScope]: { "unowned.color": "#445566", ...output.colors } });
      }
    }
    await new PreviewSession(adapter, managedThemeColorIds).restore();
    assert.deepEqual(adapter.settings, before);
  });
}

test("released keys are checked again before being reacquired", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  await session.update({ "editor.background": "#202020" });
  const entry = adapter.settings.colors?.[previewScope];
  assert.ok(typeof entry === "object" && entry !== null);
  Object.assign(entry, { "button.background": "#123456" });
  await assert.rejects(session.update(initial), /outside Themer/);
  await session.restore();
  assert.deepEqual(adapter.settings.colors, { [previewScope]: { "button.background": "#123456" } });
});

test("managed keys removed during a preview remain owned until Cancel or Keep", async () => {
  const adapter = new MemoryAdapter();
  const managed = new Set(Object.keys(initial));
  const session = new PreviewSession(adapter, managed);
  await session.start(initial);
  await session.update({ "editor.background": "#202020" });
  assert.ok(adapter.journal?.clearedColors?.includes("button.background"));
  const entry = adapter.settings.colors?.[previewScope];
  assert.ok(typeof entry === "object" && entry !== null);
  Object.assign(entry, { "button.background": "#123456" });
  await assert.rejects(session.keep(), /outside Themer/);
  assert.deepEqual((await session.restore()).conflicts, ["button.background"]);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: { "button.background": "#123456" } });
});

for (const key of ["unowned.invalid", "editor.background"]) {
  test(`Cancel preserves an invalid external ${key} value and restores other settings`, async () => {
    const adapter = new MemoryAdapter();
    const session = new PreviewSession(adapter);
    await session.start(initial, syntax);
    const entry = adapter.settings.colors?.[previewScope];
    assert.ok(typeof entry === "object" && entry !== null);
    Object.assign(entry, { [key]: false });
    const result = await session.restore();
    assert.deepEqual(result.conflicts, key === "editor.background" ? [key] : []);
    assert.deepEqual(adapter.settings, { theme: undefined, colors: { [previewScope]: { [key]: false } } });
    assert.equal(adapter.journal, undefined);
  });
}

test("invalid removal journals are surfaced without discarding recovery", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial);
  for (const clearedColors of [null, "foreground", [null], [1], [""], ["foreground", "foreground"]]) {
    assert.throws(() => parsePreviewJournal({ ...adapter.journal, clearedColors }), /invalid cleared colors/);
  }
  assert.ok(adapter.journal);
});

test("User Apply recovery is target-specific and never restores a workspace journal at User scope", async () => {
  const workspace = new MemoryAdapter();
  await new PreviewSession(workspace).start(initial, syntax);
  const user = new MemoryAdapter("user");
  user.journal = structuredClone(workspace.journal);
  assert.throws(() => new PreviewSession(user), /different settings target/);
  assert.ok(user.journal);
  user.journal = undefined;
  await new PreviewSession(user).start(initial, syntax, "light");
  const persisted = parsePreviewJournal(user.loadJournal());
  assert.ok(persisted);
  assert.equal(persisted.target, "user");
  assert.deepEqual(parsePreviewJournal(persisted), persisted);
  for (const target of ["global", null, 1, true, {}]) {
    assert.throws(() => parsePreviewJournal({ ...persisted, target }), /settings target/);
  }
  assert.throws(() => parsePreviewJournal({ ...persisted, scope: undefined }), /settings target/);
  assert.deepEqual(await new PreviewSession(user).restore(), { conflicts: [] });
  assert.deepEqual(user.settings, { theme: undefined, colors: undefined });
  assert.equal(workspace.settings.theme, previewThemeNames.dark);
});

test("Apply cannot roll back another instance's newly discovered recovery journal", async () => {
  const adapter = new MemoryAdapter("user");
  const stale = new PreviewSession(adapter);
  await new PreviewSession(adapter).start(initial, syntax);
  const before = structuredClone(adapter.settings);
  const journal = structuredClone(adapter.journal);
  await assert.rejects(stale.apply(edited, editedSyntax, "light"), /unfinished/);
  assert.deepEqual(adapter.settings, before);
  assert.deepEqual(adapter.journal, journal);
});

test("a failed Apply rollback retains a recoverable User journal instead of claiming success", async () => {
  class RollbackFailureAdapter extends MemoryAdapter {
    override async writeTheme(value: string | undefined): Promise<void> {
      if (value === previewThemeNames.dark) {
        this.failColors = "before";
        throw new Error("Theme save failed.");
      }
      await super.writeTheme(value);
    }
  }
  const adapter = new RollbackFailureAdapter("user");
  const session = new PreviewSession(adapter);
  await assert.rejects(session.apply(initial, syntax, "dark"), /Theme save failed.*Restoration also failed.*journal was retained/);
  assert.equal(session.active, true);
  assert.ok(adapter.journal);
  assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
});

test("preview writes scoped colors and restores absent workspace settings exactly", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  assert.equal(session.active, true);
  assert.equal(adapter.settings.theme, previewThemeName);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: initial });
  await session.update(edited);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: edited });
  assert.deepEqual(await session.restore(), { conflicts: [] });
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
  assert.equal(adapter.journal, undefined);
});

test("Light preview uses a native light theme and keeps that mode during ordinary updates", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax, "light");
  assert.equal(adapter.settings.theme, previewThemeNames.light);
  assert.equal(adapter.journal?.themeMode, "light");
  assert.equal(adapter.journal?.scope, previewScope);
  assert.equal(adapter.journal?.pendingMode, null);
  await session.update(edited, editedSyntax);
  assert.equal(adapter.settings.theme, previewThemeNames.light);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: edited });
  const kept = structuredClone(adapter.settings);
  await session.keep();
  assert.deepEqual(adapter.settings, kept);
  assert.equal(adapter.journal, undefined);
});

test("switching Dark and Light preserves the original session snapshot and both unrelated theme scopes", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings = {
    theme: "Light 2026",
    colors: {
      foreground: "#123456",
      [legacyPreviewScope]: { "editor.background": "#333333" },
      "[Other]": { foreground: "#111111" },
      [previewScope]: { "button.background": "#abcdef", "unowned.color": "#123456" }
    },
    tokens: { [previewScope]: { textMateRules: [] } },
    semanticTokens: { enabled: false },
    bracketColorization: false
  };
  const before = structuredClone(adapter.settings);
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax, "dark");
  for (const mode of ["light", "dark", "light"] as const) {
    await session.update(mode === "light" ? edited : initial, mode === "light" ? editedSyntax : syntax, mode);
    assert.equal(adapter.settings.theme, previewThemeNames[mode]);
    assert.equal(adapter.journal?.previousTheme, before.theme);
    assert.deepEqual(adapter.settings.colors?.[legacyPreviewScope], before.colors?.[legacyPreviewScope]);
  }
  assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
  assert.deepEqual(adapter.settings, before);
});

for (const phase of ["start", "switch"] as const) {
  for (const timing of ["before", "after"] as const) {
    test(`Light ${phase} recovery handles theme failure ${timing} applying`, async () => {
      const adapter = new MemoryAdapter();
      adapter.settings.theme = "Dark 2026";
      const before = structuredClone(adapter.settings);
      const session = new PreviewSession(adapter);
      if (phase === "switch") await session.start(initial, syntax);
      adapter.failTheme = timing === "before" ? true : "after";
      await assert.rejects(phase === "start"
        ? session.start(edited, editedSyntax, "light")
        : session.update(edited, editedSyntax, "light"), /Theme write failed/);
      await assert.rejects(session.keep(), /interrupted/);
      assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
      assert.deepEqual(adapter.settings, before);
    });
  }
}

test("an external switch to the other Themer base theme is not treated as an owned mode change", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  adapter.settings.theme = previewThemeNames.light;
  await assert.rejects(session.update(edited, editedSyntax, "light"), /theme changed outside/);
  assert.deepEqual((await session.restore()).conflicts, ["workbench.colorTheme"]);
  assert.equal(adapter.settings.theme, previewThemeNames.light);
});

test("old version-1 Dark journals restore their original single-theme scope", async () => {
  const adapter = new MemoryAdapter();
  adapter.journal = {
    version: 1, previousTheme: "Light 2026", previousColorsDefined: true, previousEntry: { foreground: "#111111" },
    appliedColors: initial, pendingColors: null
  };
  adapter.settings = {
    theme: legacyPreviewThemeNames.dark,
    colors: {
      [legacyPreviewScope]: { foreground: "#111111", ...initial },
      [previewScope]: { foreground: "#abcdef" }
    }
  };
  assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
  assert.deepEqual(adapter.settings, {
    theme: "Light 2026",
    colors: { [legacyPreviewScope]: { foreground: "#111111" }, [previewScope]: { foreground: "#abcdef" } }
  });
});

test("mode journals reject unsupported scopes and mode values without dropping recovery", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial, syntax, "light");
  assert.throws(() => parsePreviewJournal({ ...adapter.journal, scope: "[Other]" }), /unsupported theme scope/);
  assert.throws(() => parsePreviewJournal({ ...adapter.journal, themeMode: "hc-light" }), /Theme mode/);
  assert.throws(() => parsePreviewJournal({ ...adapter.journal, pendingMode: "unknown" }), /Theme mode/);
  assert.throws(() => parsePreviewJournal({ ...adapter.journal, scope: undefined }), /requires the shared theme scope/);
  assert.ok(adapter.journal);
});

test("restore preserves unrelated edits and pre-existing scoped colors", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings = {
    theme: "Dark 2026",
    colors: {
      foreground: "#aaaaaa",
      "[Other]": { "editor.background": "#111111" },
      [previewScope]: { "button.background": "#123456", "unowned.color": "#654321" }
    }
  };
  const session = new PreviewSession(adapter);
  await session.start(initial);
  assert.ok(adapter.settings.colors);
  adapter.settings.colors["sideBar.background"] = "#222222";
  const scope = adapter.settings.colors[previewScope];
  assert.ok(typeof scope === "object" && scope !== null);
  Object.assign(scope, { "external.color": "#abcdef" });
  await session.restore();
  assert.deepEqual(adapter.settings, {
    theme: "Dark 2026",
    colors: {
      foreground: "#aaaaaa",
      "sideBar.background": "#222222",
      "[Other]": { "editor.background": "#111111" },
      [previewScope]: {
        "button.background": "#123456",
        "unowned.color": "#654321",
        "external.color": "#abcdef"
      }
    }
  });
});

test("external edits to owned values stop updates and survive cancellation", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  adapter.settings.colors = { [previewScope]: { ...initial, "button.background": "#ff0000" } };
  await assert.rejects(session.update(edited), /outside Themer/);
  await assert.rejects(session.keep(), /outside Themer/);
  const result = await session.restore();
  assert.deepEqual(result.conflicts, ["button.background"]);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: { "button.background": "#ff0000" } });
  assert.equal(adapter.settings.theme, undefined);
});

test("an external theme change is preserved and reported", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  adapter.settings.theme = "Light 2026";
  await assert.rejects(session.update(edited), /theme changed/);
  assert.deepEqual((await session.restore()).conflicts, ["workbench.colorTheme"]);
  assert.equal(adapter.settings.theme, "Light 2026");
});

test("keeping a preview leaves workspace settings but clears recovery state", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  await session.keep();
  assert.equal(session.active, false);
  assert.equal(adapter.journal, undefined);
  assert.equal(adapter.settings.theme, previewThemeName);
  assert.deepEqual(adapter.settings.colors, { [previewScope]: initial });
});

test("recovery restores a partially started preview after a failed theme write", async () => {
  const adapter = new MemoryAdapter();
  adapter.failTheme = true;
  await assert.rejects(new PreviewSession(adapter).start(initial), /Theme write failed/);
  assert.ok(adapter.journal);
  await new PreviewSession(adapter).restore();
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
});

for (const failure of ["before", "after"] as const) {
  test(`recovery restores both old and intended values when update fails ${failure} applying`, async () => {
    const adapter = new MemoryAdapter();
    const session = new PreviewSession(adapter);
    await session.start(initial);
    adapter.failColors = failure;
    await assert.rejects(session.update(edited), /Color write failed/);
    await assert.rejects(session.keep(), /interrupted/);
    const recovered = new PreviewSession(adapter);
    assert.deepEqual(await recovered.restore(), { conflicts: [] });
    assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
  });
}

test("removed generated colors restore their original values during update", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings.colors = { [previewScope]: { "button.background": "#123456" } };
  const session = new PreviewSession(adapter);
  await session.start(initial);
  await session.update({ "editor.background": "#202020" });
  assert.deepEqual(adapter.settings.colors, {
    [previewScope]: { "editor.background": "#202020", "button.background": "#123456" }
  });
  await session.restore();
  assert.deepEqual(adapter.settings.colors, { [previewScope]: { "button.background": "#123456" } });
});

test("invalid journals are surfaced and never silently discarded", () => {
  assert.throws(() => parsePreviewJournal({ version: 99 }), /invalid/);
  assert.throws(() => parsePreviewJournal({
    version: 1,
    previousTheme: null,
    previousColorsDefined: false,
    previousEntry: null,
    appliedColors: {},
    pendingColors: { foreground: "not-a-color" }
  }), /valid theme color/);
});

test("live preview cannot overwrite an unfinished session", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial);
  await assert.rejects(session.start(edited), /unfinished/);
  await session.restore();
  await assert.rejects(session.update(initial), /No live preview/);
});

test("syntax preview writes both theme-scoped systems and restores absent settings exactly", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  assert.deepEqual(adapter.settings.tokens, { [previewScope]: { textMateRules: syntax.tokenColors } });
  assert.deepEqual(adapter.settings.semanticTokens, { [previewScope]: { enabled: true, rules: syntax.semanticTokenColors } });
  await session.update(edited, editedSyntax);
  assert.deepEqual(adapter.settings.tokens, { [previewScope]: { textMateRules: editedSyntax.tokenColors } });
  assert.deepEqual(adapter.settings.semanticTokens, { [previewScope]: { enabled: true, rules: editedSyntax.semanticTokenColors } });
  await assert.rejects(session.update(initial), /Syntax preview data/);
  assert.deepEqual(await session.restore(), { conflicts: [] });
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
});

test("syntax restoration preserves original scoped rules and unrelated edits at every level", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings = {
    theme: "Dark 2026",
    colors: undefined,
    tokens: {
      comments: "#112233",
      "[Other]": { strings: "#445566" },
      [previewScope]: { textMateRules: [], comments: "#223344" }
    },
    semanticTokens: {
      enabled: false,
      [previewScope]: { enabled: false, rules: { variable: "#556677" }, unrelated: true }
    }
  };
  const previous = structuredClone(adapter.settings);
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  assert.ok(adapter.settings.tokens && adapter.settings.semanticTokens);
  adapter.settings.tokens.strings = "#abcdef";
  Object.assign(adapter.settings.tokens[previewScope] ?? {}, { numbers: "#123456" });
  adapter.settings.semanticTokens["[Another]"] = { enabled: false };
  await session.restore();
  assert.deepEqual(adapter.settings, {
    ...previous,
    tokens: { ...previous.tokens, strings: "#abcdef", [previewScope]: { textMateRules: [], comments: "#223344", numbers: "#123456" } },
    semanticTokens: { ...previous.semanticTokens, "[Another]": { enabled: false } }
  });
});

for (const setting of ["tokens", "semanticTokens"] as const) {
  test(`external ${setting} edits stop updates and Keep, and survive cancellation`, async () => {
    const adapter = new MemoryAdapter();
    const session = new PreviewSession(adapter);
    await session.start(initial, syntax);
    const external = setting === "tokens" ? { textMateRules: [] } : { enabled: false, rules: syntax.semanticTokenColors };
    adapter.settings[setting] = { [previewScope]: external };
    await assert.rejects(session.update(edited, editedSyntax), /outside Themer/);
    await assert.rejects(session.keep(), /outside Themer/);
    const restored = await session.restore();
    assert.ok(restored.conflicts.some((value) => value.startsWith("editor.")));
    assert.deepEqual(adapter.settings[setting], { [previewScope]: setting === "tokens" ? external : { enabled: false } });
    assert.equal(adapter.settings.theme, undefined);
  });

  for (const timing of ["before", "after"] as const) {
    for (const phase of ["start", "update"] as const) {
      test(`syntax recovery handles ${setting} ${phase} failure ${timing} applying`, async () => {
        const adapter = new MemoryAdapter();
        const session = new PreviewSession(adapter);
        if (phase === "update") await session.start(initial, syntax);
        adapter.failSyntax = { setting, timing };
        await assert.rejects(phase === "start" ? session.start(initial, syntax) : session.update(edited, editedSyntax), /Syntax write failed/);
        await assert.rejects(session.keep(), /interrupted/);
        const recovered = new PreviewSession(adapter);
        assert.deepEqual(await recovered.restore(), { conflicts: [] });
        assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
        assert.equal(adapter.journal, undefined);
      });
    }
  }
}

test("Keep persists both syntax systems while ending ownership", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  const previous = structuredClone(adapter.settings);
  await session.keep();
  assert.equal(session.active, false);
  assert.equal(adapter.journal, undefined);
  assert.deepEqual(adapter.settings, previous);
});

test("legacy UI-only recovery leaves independently edited syntax settings untouched", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial);
  adapter.settings.tokens = { [previewScope]: { textMateRules: syntax.tokenColors } };
  adapter.settings.semanticTokens = { enabled: false };
  const previous = structuredClone(adapter.settings);
  await new PreviewSession(adapter).restore();
  assert.deepEqual(adapter.settings, { ...previous, colors: undefined, theme: undefined });
});

test("invalid syntax journals are surfaced without silently dropping recovery", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial, syntax);
  const invalid = structuredClone(adapter.journal);
  assert.ok(invalid?.syntax);
  invalid.syntax.tokens.pending = { textMateRules: "invalid" };
  assert.throws(() => parsePreviewJournal(invalid), /invalid TextMate/);
  assert.ok(adapter.journal);
});

test("externally replaced syntax scopes are preserved and reported", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  adapter.settings.tokens = { [previewScope]: "external invalid setting" };
  const restored = await session.restore();
  assert.ok(restored.conflicts.some((value) => value.includes("tokenColorCustomizations") && value.includes("replaced")));
  assert.deepEqual(adapter.settings.tokens, { [previewScope]: "external invalid setting" });
  assert.equal(adapter.settings.semanticTokens, undefined);
});

for (const previous of [undefined, false, true]) {
  test(`syntax preview enables brackets and restores the previous ${String(previous)} setting`, async () => {
    const adapter = new MemoryAdapter();
    if (previous !== undefined) adapter.settings.bracketColorization = previous;
    const before = structuredClone(adapter.settings);
    const session = new PreviewSession(adapter);
    await session.start(initial, syntax);
    assert.equal(adapter.settings.bracketColorization, true);
    await session.update(edited, editedSyntax);
    assert.equal(adapter.settings.bracketColorization, true);
    assert.deepEqual(await session.restore(), { conflicts: [] });
    assert.deepEqual(adapter.settings, before);
  });
}

test("Keep persists enabled bracket colorization with the palette", async () => {
  const adapter = new MemoryAdapter();
  adapter.settings.bracketColorization = false;
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  await session.keep();
  assert.equal(adapter.settings.bracketColorization, true);
  assert.equal(adapter.journal, undefined);
});

test("external bracket-colorization edits stop updates and Keep, and survive Cancel", async () => {
  const adapter = new MemoryAdapter();
  const session = new PreviewSession(adapter);
  await session.start(initial, syntax);
  adapter.settings.bracketColorization = false;
  await assert.rejects(session.update(edited, editedSyntax), /Bracket colorization changed outside/);
  await assert.rejects(session.keep(), /Bracket colorization changed outside/);
  assert.deepEqual((await session.restore()).conflicts, ["editor.bracketPairColorization.enabled"]);
  assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined, bracketColorization: false });
});

for (const phase of ["start", "restore"] as const) {
  for (const failure of ["before", "after"] as const) {
    test(`bracket setting recovery handles ${phase} failure ${failure} applying`, async () => {
      const adapter = new MemoryAdapter();
      const session = new PreviewSession(adapter);
      if (phase === "restore") await session.start(initial, syntax);
      adapter.failBracket = failure;
      await assert.rejects(phase === "start" ? session.start(initial, syntax) : session.restore(), /Bracket write failed/);
      assert.ok(adapter.journal);
      const recovered = new PreviewSession(adapter);
      assert.deepEqual(await recovered.restore(), { conflicts: [] });
      assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
    });
  }
}

test("legacy syntax journals restore without owning or changing bracket behavior", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial, syntax);
  assert.ok(adapter.journal);
  delete adapter.journal.bracketColorization;
  adapter.settings.bracketColorization = false;
  await new PreviewSession(adapter).restore();
  assert.equal(adapter.settings.bracketColorization, false);
});

test("invalid bracket journals are surfaced without discarding recovery", async () => {
  const adapter = new MemoryAdapter();
  await new PreviewSession(adapter).start(initial, syntax);
  assert.ok(adapter.journal);
  for (const bracketColorization of [
    {}, { previousEnabled: "false", appliedEnabled: true, pendingEnabled: null },
    { previousEnabled: null, appliedEnabled: false, pendingEnabled: null },
    { previousEnabled: null, appliedEnabled: null, pendingEnabled: null }
  ]) {
    assert.throws(() => parsePreviewJournal({ ...adapter.journal, bracketColorization }), /bracket recovery journal/i);
  }
  assert.ok(adapter.journal);
});

for (const timing of ["before", "after"] as const) {
  test(`syntax restore can recover after a settings failure ${timing} applying`, async () => {
    const adapter = new MemoryAdapter();
    const session = new PreviewSession(adapter);
    await session.start(initial, syntax);
    adapter.failSyntax = { setting: "semanticTokens", timing };
    await assert.rejects(session.restore(), /Syntax write failed/);
    assert.ok(adapter.journal, "Failed restoration must retain its recovery journal.");
    assert.deepEqual(await new PreviewSession(adapter).restore(), { conflicts: [] });
    assert.deepEqual(adapter.settings, { theme: undefined, colors: undefined });
  });
}
