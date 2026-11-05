import { isDeepStrictEqual } from "node:util";
import { GeneratedSyntax, ThemeMode, ThemeSettingsTarget, legacyPreviewThemeNames, previewThemeNames, themeSettingsTargets } from "../shared/types";
import { isRecord, parseSemanticColors, parseThemeMode, parseTokenRules, requireRecord } from "../shared/validation";

export const previewThemeName = previewThemeNames.dark;
export const legacyPreviewScope = `[${legacyPreviewThemeNames.dark}]`;
export const legacyPairedPreviewScope = `${legacyPreviewScope}[${legacyPreviewThemeNames.light}]`;
export const previewScope = `[${previewThemeName}][${previewThemeNames.light}]`;
export const previewJournalKey = "themer.previewJournal.v1";
export const userApplyJournalKey = "themer.userApplyJournal.v1";
export const previewConfirmation = "Preview changes this workspace's theme and enables bracket colors. Cancel or close Themer Lab to restore. Apply saves to User settings.";

type ScopedColors = Record<string, string | null>;
export type ColorCustomizations = Record<string, unknown>;

export interface ThemeSettings {
  colors: ColorCustomizations | undefined;
  theme: string | undefined;
  tokens?: ColorCustomizations;
  semanticTokens?: ColorCustomizations;
  bracketColorization?: boolean;
}

type SyntaxSetting = "tokens" | "semanticTokens";
const syntaxSettings = ["tokens", "semanticTokens"] as const;
const settingNames: Record<SyntaxSetting, string> = {
  tokens: "editor.tokenColorCustomizations",
  semanticTokens: "editor.semanticTokenColorCustomizations"
};

export interface SyntaxSettingJournal {
  previousDefined: boolean;
  previousEntry: ColorCustomizations | null;
  applied: ColorCustomizations;
  pending: ColorCustomizations | null;
}

export interface PreviewJournal {
  version: 1;
  target?: ThemeSettingsTarget;
  scope?: string;
  themeMode?: ThemeMode;
  pendingMode?: ThemeMode | null;
  previousTheme: string | null;
  previousColorsDefined: boolean;
  previousEntry: ScopedColors | null;
  appliedColors: Record<string, string>;
  pendingColors: Record<string, string> | null;
  // Absence is owned too, including removals from interrupted writes.
  clearedColors?: string[];
  syntax?: Record<SyntaxSetting, SyntaxSettingJournal>;
  bracketColorization?: {
    previousEnabled: boolean | null;
    appliedEnabled: true | null;
    pendingEnabled: true | null;
  };
}

export interface PreviewAdapter {
  readonly target: ThemeSettingsTarget;
  read(): ThemeSettings;
  writeColors(value: ColorCustomizations | undefined): Promise<void>;
  writeTheme(value: string | undefined): Promise<void>;
  writeTokens(value: ColorCustomizations | undefined): Promise<void>;
  writeSemanticTokens(value: ColorCustomizations | undefined): Promise<void>;
  writeBracketColorization(value: boolean | undefined): Promise<void>;
  loadJournal(): unknown;
  saveJournal(value: PreviewJournal | undefined): Promise<void>;
}

export interface RestoreResult {
  conflicts: string[];
}

function scopedColors(value: unknown, label: string): ScopedColors | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value, label);
  const entries = Object.entries(record).map(([key, color]) => {
    if (color !== null && typeof color !== "string") {
      throw new Error(`${label}.${key} must be a string or null. Fix this setting before previewing.`);
    }
    return [key, color] as const;
  });
  return Object.fromEntries(entries);
}

function stringColors(value: unknown, label: string): Record<string, string> {
  const record = requireRecord(value, label);
  const entries = Object.entries(record).map(([key, color]) => {
    if (typeof color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) {
      throw new Error(`${label}.${key} is not a valid theme color.`);
    }
    return [key, color] as const;
  });
  return Object.fromEntries(entries);
}

function syntaxValues(value: unknown, setting: SyntaxSetting): ColorCustomizations {
  const record = requireRecord(value, settingNames[setting]);
  if (Object.keys(record).length === 0) return {};
  if (setting === "tokens") {
    if (!Array.isArray(record.textMateRules) || Object.keys(record).length !== 1) {
      throw new Error("The preview journal has invalid TextMate settings. It has not been discarded.");
    }
    return { textMateRules: parseTokenRules(record.textMateRules, "Preview TextMate rules") };
  }
  if (typeof record.enabled !== "boolean" || !isRecord(record.rules) || Object.keys(record).length !== 2) {
    throw new Error("The preview journal has invalid semantic settings. It has not been discarded.");
  }
  return { enabled: record.enabled, rules: parseSemanticColors(record.rules) };
}

function syntaxUpdates(syntax: GeneratedSyntax): Record<SyntaxSetting, ColorCustomizations> {
  return {
    tokens: syntaxValues({ textMateRules: syntax.tokenColors }, "tokens"),
    semanticTokens: syntaxValues({ enabled: syntax.semanticHighlighting, rules: syntax.semanticTokenColors }, "semanticTokens")
  };
}

function syntaxEntry(root: ColorCustomizations | undefined, setting: SyntaxSetting, scope: string): ColorCustomizations | undefined {
  const value = root?.[scope];
  return value === undefined ? undefined : requireRecord(value, `${settingNames[setting]}.${scope}`);
}

const journalScope = (journal: PreviewJournal) => journal.scope ?? legacyPreviewScope;
const journalThemeNames = (journal: PreviewJournal) => journal.scope === previewScope ? previewThemeNames : legacyPreviewThemeNames;

function parseSyntaxJournal(value: unknown): Record<SyntaxSetting, SyntaxSettingJournal> {
  const record = requireRecord(value, "Syntax preview journal");
  const parse = (setting: SyntaxSetting): SyntaxSettingJournal => {
    const entry = requireRecord(record[setting], `${settingNames[setting]} recovery journal`);
    if (typeof entry.previousDefined !== "boolean") throw new Error("The syntax recovery journal is invalid. It has not been discarded.");
    return {
      previousDefined: entry.previousDefined,
      previousEntry: entry.previousEntry === null ? null : requireRecord(entry.previousEntry, "Previous syntax settings"),
      applied: syntaxValues(entry.applied, setting),
      pending: entry.pending === null ? null : syntaxValues(entry.pending, setting)
    };
  };
  return { tokens: parse("tokens"), semanticTokens: parse("semanticTokens") };
}

function hasPendingWrites(journal: PreviewJournal): boolean {
  return (journal.pendingMode !== undefined && journal.pendingMode !== null) || journal.pendingColors !== null ||
    journal.bracketColorization?.pendingEnabled === true ||
    syntaxSettings.some((setting) => journal.syntax?.[setting].pending !== undefined && journal.syntax[setting].pending !== null);
}

function parseBracketJournal(value: unknown): NonNullable<PreviewJournal["bracketColorization"]> {
  const record = requireRecord(value, "Bracket preview journal");
  if ((record.previousEnabled !== null && typeof record.previousEnabled !== "boolean") ||
    (record.appliedEnabled !== null && record.appliedEnabled !== true) ||
    (record.pendingEnabled !== null && record.pendingEnabled !== true) ||
    (record.appliedEnabled === null && record.pendingEnabled === null)) {
    throw new Error("The bracket recovery journal is invalid. It has not been discarded.");
  }
  return {
    previousEnabled: record.previousEnabled,
    appliedEnabled: record.appliedEnabled,
    pendingEnabled: record.pendingEnabled
  };
}

export function parsePreviewJournal(value: unknown): PreviewJournal | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value, "Preview recovery journal");
  if (record.version !== 1 || (record.previousTheme !== null && typeof record.previousTheme !== "string") ||
      typeof record.previousColorsDefined !== "boolean") {
    throw new Error("The preview recovery journal is invalid. It has not been discarded.");
  }
  const previousEntry = record.previousEntry === null
    ? null
    : scopedColors(record.previousEntry, "Previous preview colors");
  if (previousEntry === undefined) {
    throw new Error("The recovery journal is missing its previous colors.");
  }
  if (record.scope !== undefined && record.scope !== previewScope && record.scope !== legacyPairedPreviewScope) {
    throw new Error("The recovery journal has an unsupported theme scope. It has not been discarded.");
  }
  const target = record.target === undefined ? undefined : themeSettingsTargets.find((target) => target === record.target);
  if ((record.target !== undefined && target === undefined) ||
    (target === "user" && record.scope !== previewScope && record.scope !== legacyPairedPreviewScope)) {
    throw new Error("The recovery journal has an unsupported settings target. It has not been discarded.");
  }
  const themeMode = record.themeMode === undefined ? undefined : parseThemeMode(record.themeMode);
  const pendingMode = record.pendingMode === undefined ? undefined :
    record.pendingMode === null ? null : parseThemeMode(record.pendingMode);
  if (record.scope === undefined && (themeMode === "light" || pendingMode === "light")) {
    throw new Error("A Light recovery journal requires the shared theme scope. It has not been discarded.");
  }
  const clearedColors = record.clearedColors;
  if (clearedColors !== undefined && (!Array.isArray(clearedColors) ||
    clearedColors.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(clearedColors).size !== clearedColors.length)) {
    throw new Error("The recovery journal has invalid cleared colors. It has not been discarded.");
  }
  return {
    version: 1,
    ...(target === undefined ? {} : { target }),
    ...(record.scope === undefined ? {} : { scope: record.scope }),
    ...(themeMode === undefined ? {} : { themeMode }),
    ...(pendingMode === undefined ? {} : { pendingMode }),
    previousTheme: record.previousTheme,
    previousColorsDefined: record.previousColorsDefined,
    previousEntry,
    appliedColors: stringColors(record.appliedColors, "Applied preview colors"),
    pendingColors: record.pendingColors === null ? null : stringColors(record.pendingColors, "Pending preview colors"),
    ...(clearedColors === undefined ? {} : { clearedColors: [...clearedColors] }),
    ...(record.syntax === undefined ? {} : { syntax: parseSyntaxJournal(record.syntax) }),
    ...(record.bracketColorization === undefined ? {} : { bracketColorization: parseBracketJournal(record.bracketColorization) })
  };
}

export class PreviewSession {
  private journal: PreviewJournal | undefined;
  private operation = Symbol("theme settings operation");

  constructor(private readonly adapter: PreviewAdapter, private readonly managedColors: ReadonlySet<string> = new Set()) {
    this.journal = parsePreviewJournal(adapter.loadJournal());
    if (this.journal && (this.journal.target ?? "workspace") !== adapter.target) {
      throw new Error("The recovery journal belongs to a different settings target. It has not been discarded.");
    }
  }

  get active(): boolean {
    return this.journal !== undefined;
  }

  get recoveryToken(): symbol | undefined {
    return this.active ? this.operation : undefined;
  }

  get canKeep(): boolean {
    return this.journal !== undefined && !hasPendingWrites(this.journal);
  }

  async start(colors: Record<string, string>, syntax?: GeneratedSyntax, mode: ThemeMode = "dark"): Promise<void> {
    if (this.journal || this.adapter.loadJournal() !== undefined) {
      throw new Error("An unfinished preview already exists. Restore it before starting another.");
    }
    const validated = stringColors(colors, "Generated preview colors");
    const selectedMode = parseThemeMode(mode);
    const current = this.adapter.read();
    const entry = scopedColors(current.colors?.[previewScope], "Existing preview colors");
    const clearedColors = Object.keys(entry ?? {}).filter((id) => this.managedColors.has(id) && !Object.hasOwn(validated, id));
    const nextEntry: ScopedColors = { ...entry, ...validated };
    for (const id of clearedColors) delete nextEntry[id];
    const updates = syntax ? syntaxUpdates(syntax) : undefined;
    const syntaxJournal = (setting: SyntaxSetting): SyntaxSettingJournal => ({
      previousDefined: current[setting] !== undefined,
      previousEntry: structuredClone(syntaxEntry(current[setting], setting, previewScope) ?? null),
      applied: {},
      pending: structuredClone(updates?.[setting] ?? {})
    });
    const journal: PreviewJournal = {
      version: 1,
      target: this.adapter.target,
      scope: previewScope,
      themeMode: selectedMode,
      pendingMode: selectedMode,
      previousTheme: current.theme ?? null,
      previousColorsDefined: current.colors !== undefined,
      previousEntry: entry ?? null,
      appliedColors: {},
      pendingColors: validated,
      ...(clearedColors.length > 0 ? { clearedColors } : {}),
      ...(updates ? {
        syntax: { tokens: syntaxJournal("tokens"), semanticTokens: syntaxJournal("semanticTokens") },
        bracketColorization: { previousEnabled: current.bracketColorization ?? null, appliedEnabled: null, pendingEnabled: true }
      } : {})
    };
    this.operation = Symbol("theme settings operation");
    try {
      await this.adapter.saveJournal(journal);
    } catch (error) {
      if (isDeepStrictEqual(this.adapter.loadJournal(), journal)) this.journal = journal;
      throw error;
    }
    this.journal = journal;
    await this.adapter.writeColors({
      ...current.colors,
      [previewScope]: nextEntry
    });
    if (updates) {
      for (const setting of syntaxSettings) {
        await this.writeSyntax(setting, updates[setting], journal.syntax?.[setting]);
      }
      await this.adapter.writeBracketColorization(true);
    }
    await this.adapter.writeTheme(journalThemeNames(journal)[selectedMode]);
    const completed = this.completed(journal, validated, updates, selectedMode);
    await this.adapter.saveJournal(completed);
    this.journal = completed;
  }

  async update(colors: Record<string, string>, syntax?: GeneratedSyntax, mode?: ThemeMode): Promise<void> {
    const journal = this.requireJournal();
    const selectedMode = mode === undefined ? journal.themeMode ?? "dark" : parseThemeMode(mode);
    const scope = journalScope(journal);
    if (scope === legacyPreviewScope && selectedMode !== "dark") {
      throw new Error("Restore this legacy preview before changing theme mode.");
    }
    if (hasPendingWrites(journal)) {
      throw new Error("The previous settings write was interrupted. Restore this preview before continuing.");
    }
    const validated = stringColors(colors, "Generated preview colors");
    if ((journal.syntax !== undefined) !== (syntax !== undefined)) {
      throw new Error("Syntax preview data must match the active session. Restore before changing preview modes.");
    }
    const updates = syntax ? syntaxUpdates(syntax) : undefined;
    const current = this.adapter.read();
    const entry = scopedColors(current.colors?.[scope], "Current preview colors") ?? {};
    const clearedColors = new Set(journal.clearedColors);
    for (const key of Object.keys(entry)) {
      if (this.managedColors.has(key) && !Object.hasOwn(validated, key)) clearedColors.add(key);
    }
    this.assertOwnership(current, journal, [...Object.keys(validated), ...clearedColors]);
    const nextEntry: ScopedColors = { ...entry };
    for (const key of Object.keys(journal.appliedColors)) {
      if (!Object.hasOwn(validated, key)) {
        if (this.managedColors.has(key)) {
          clearedColors.add(key);
          delete nextEntry[key];
        } else if (journal.previousEntry && Object.hasOwn(journal.previousEntry, key)) {
          nextEntry[key] = journal.previousEntry[key] ?? null;
        } else {
          delete nextEntry[key];
        }
      }
    }
    for (const key of clearedColors) delete nextEntry[key];
    Object.assign(nextEntry, validated);
    const prepared: PreviewJournal = {
      ...journal,
      pendingMode: selectedMode,
      pendingColors: validated,
      ...(clearedColors.size > 0 ? { clearedColors: [...clearedColors] } : {}),
      ...(journal.syntax && updates ? {
        syntax: {
          tokens: { ...journal.syntax.tokens, pending: updates.tokens },
          semanticTokens: { ...journal.syntax.semanticTokens, pending: updates.semanticTokens }
        }
      } : {})
    };
    await this.adapter.saveJournal(prepared);
    this.journal = prepared;
    await this.adapter.writeColors({ ...current.colors, [scope]: nextEntry });
    if (updates) {
      for (const setting of syntaxSettings) {
        await this.writeSyntax(setting, updates[setting], prepared.syntax?.[setting]);
      }
    }
    if (selectedMode !== (journal.themeMode ?? "dark")) {
      await this.adapter.writeTheme(previewThemeNames[selectedMode]);
    }
    const completed = this.completed(prepared, validated, updates, selectedMode);
    await this.adapter.saveJournal(completed);
    this.journal = completed;
  }

  async keep(recoveryToken?: symbol): Promise<void> {
    const journal = this.requireJournal(recoveryToken);
    if (hasPendingWrites(journal)) {
      throw new Error("An interrupted settings write must be restored before keeping a preview.");
    }
    this.assertOwnership(this.adapter.read(), journal);
    await this.clearJournal(journal);
  }

  async apply(colors: Record<string, string>, syntax: GeneratedSyntax, mode: ThemeMode): Promise<void> {
    if (this.active) throw new Error("Restore the unfinished settings operation before applying another theme.");
    try {
      await this.start(colors, syntax, mode);
      await this.keep();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.active) throw error;
      let result: RestoreResult;
      try {
        result = await this.restore();
      } catch (restoreError) {
        const detail = restoreError instanceof Error ? restoreError.message : String(restoreError);
        const recovery = isDeepStrictEqual(this.adapter.loadJournal(), this.journal)
          ? "The recovery journal was retained; restore the unfinished operation before continuing."
          : "The recovery journal could not be saved. Keep this window open and retry restoration.";
        throw new Error(`Applying ${this.adapter.target} settings failed: ${message} Restoration also failed: ${detail} ${recovery}`);
      }
      throw new Error(`Applying ${this.adapter.target} settings failed: ${message} Previous settings were restored${result.conflicts.length > 0
        ? ` except external edits, which were preserved: ${result.conflicts.join(", ")}` : ""}.`);
    }
  }

  async restore(recoveryToken?: symbol): Promise<RestoreResult> {
    const journal = this.requireJournal(recoveryToken);
    if (this.adapter.loadJournal() === undefined) await this.adapter.saveJournal(journal);
    const scope = journalScope(journal);
    const current = this.adapter.read();
    const conflicts: string[] = [];
    const rawEntry = current.colors?.[scope];
    if (rawEntry !== undefined && !isRecord(rawEntry)) {
      conflicts.push(`${scope} was replaced externally`);
    } else {
      const entry = rawEntry;
      const restored: ColorCustomizations = { ...entry };
      const ownedKeys = new Set([
        ...Object.keys(journal.appliedColors),
        ...Object.keys(journal.pendingColors ?? {}),
        ...(journal.clearedColors ?? [])
      ]);
      for (const key of ownedKeys) {
        const value = entry?.[key];
        const previous = journal.previousEntry?.[key];
        const matchesOwned = (Object.hasOwn(journal.appliedColors, key) && value === journal.appliedColors[key]) ||
          (journal.pendingColors !== null && Object.hasOwn(journal.pendingColors, key) && value === journal.pendingColors[key]) ||
          (journal.clearedColors?.includes(key) === true && !Object.hasOwn(entry ?? {}, key));
        if (matchesOwned) {
          if (journal.previousEntry && Object.hasOwn(journal.previousEntry, key)) {
            restored[key] = previous ?? null;
          } else {
            delete restored[key];
          }
        } else if (value !== previous) {
          conflicts.push(key);
        }
      }
      const colors: ColorCustomizations = { ...current.colors };
      if (Object.keys(restored).length === 0 && journal.previousEntry === null) {
        delete colors[scope];
      } else if (entry !== undefined || Object.keys(restored).length > 0) {
        colors[scope] = restored;
      }
      await this.adapter.writeColors(
        Object.keys(colors).length === 0 && !journal.previousColorsDefined ? undefined : colors
      );
    }
    if (journal.syntax) {
      for (const setting of syntaxSettings) {
        const snapshot = journal.syntax[setting];
        const current = this.adapter.read()[setting];
        const rawEntry = current?.[scope];
        if (rawEntry !== undefined && !isRecord(rawEntry)) {
          conflicts.push(`${settingNames[setting]}.${scope} was replaced externally`);
          continue;
        }
        const entry = syntaxEntry(current, setting, scope);
        const restored: ColorCustomizations = { ...entry };
        for (const key of new Set([...Object.keys(snapshot.applied), ...Object.keys(snapshot.pending ?? {})])) {
          const value = entry?.[key];
          const previous = snapshot.previousEntry?.[key];
          const owned = (Object.hasOwn(snapshot.applied, key) && isDeepStrictEqual(value, snapshot.applied[key])) ||
            (snapshot.pending !== null && Object.hasOwn(snapshot.pending, key) && isDeepStrictEqual(value, snapshot.pending[key]));
          if (owned) {
            if (snapshot.previousEntry && Object.hasOwn(snapshot.previousEntry, key)) restored[key] = structuredClone(previous);
            else delete restored[key];
          } else if (!isDeepStrictEqual(value, previous)) {
            conflicts.push(`${settingNames[setting]}.${key}`);
          }
        }
        const root = { ...current };
        if (Object.keys(restored).length === 0 && snapshot.previousEntry === null) delete root[scope];
        else if (entry !== undefined || Object.keys(restored).length > 0) root[scope] = restored;
        await this.writeSyntaxRoot(setting, Object.keys(root).length === 0 && !snapshot.previousDefined ? undefined : root);
      }
    }
    if (journal.bracketColorization) {
      const snapshot = journal.bracketColorization;
      const value = this.adapter.read().bracketColorization;
      const previous = snapshot.previousEnabled ?? undefined;
      if (value === snapshot.appliedEnabled || value === snapshot.pendingEnabled) {
        await this.adapter.writeBracketColorization(previous);
      } else if (value !== previous) {
        conflicts.push("editor.bracketPairColorization.enabled");
      }
    }
    const latestTheme = this.adapter.read().theme;
    const previousTheme = journal.previousTheme ?? undefined;
    const names = journalThemeNames(journal);
    if (latestTheme === names[journal.themeMode ?? "dark"] ||
      (journal.pendingMode !== undefined && journal.pendingMode !== null && latestTheme === names[journal.pendingMode])) {
      await this.adapter.writeTheme(previousTheme);
    } else if (latestTheme !== previousTheme) {
      conflicts.push("workbench.colorTheme");
    }
    await this.clearJournal(journal);
    return { conflicts };
  }

  private requireJournal(recoveryToken?: symbol): PreviewJournal {
    if (recoveryToken !== undefined && recoveryToken !== this.recoveryToken) {
      throw new Error("That recovery operation is no longer active. No settings were changed; review the current operation instead.");
    }
    if (!this.journal) {
      throw new Error("No live preview is active.");
    }
    return this.journal;
  }

  private async clearJournal(journal: PreviewJournal): Promise<void> {
    try {
      await this.adapter.saveJournal(undefined);
    } catch (error) {
      try {
        await this.adapter.saveJournal(journal);
      } catch (recoveryError) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        throw new Error(`Clearing recovery failed: ${message} Saving recovery also failed: ${detail} Keep this window open and retry restoration.`);
      }
      throw error;
    }
    this.journal = undefined;
  }

  private completed(
    journal: PreviewJournal,
    colors: Record<string, string>,
    updates: Record<SyntaxSetting, ColorCustomizations> | undefined,
    mode: ThemeMode
  ): PreviewJournal {
    return {
      ...journal,
      themeMode: mode,
      pendingMode: null,
      appliedColors: colors,
      pendingColors: null,
      ...(journal.clearedColors ? { clearedColors: journal.clearedColors.filter((key) => !Object.hasOwn(colors, key)) } : {}),
      ...(journal.bracketColorization ? {
        bracketColorization: { ...journal.bracketColorization, appliedEnabled: true, pendingEnabled: null }
      } : {}),
      ...(journal.syntax && updates ? {
        syntax: {
          tokens: { ...journal.syntax.tokens, applied: updates.tokens, pending: null },
          semanticTokens: { ...journal.syntax.semanticTokens, applied: updates.semanticTokens, pending: null }
        }
      } : {})
    };
  }

  private async writeSyntax(setting: SyntaxSetting, updates: ColorCustomizations, snapshot: SyntaxSettingJournal | undefined): Promise<void> {
    if (!snapshot) throw new Error("A syntax settings write has no recovery snapshot.");
    const scope = journalScope(this.requireJournal());
    const current = this.adapter.read()[setting];
    const entry = { ...syntaxEntry(current, setting, scope) };
    for (const key of Object.keys(snapshot.applied)) {
      if (!Object.hasOwn(updates, key)) {
        if (snapshot.previousEntry && Object.hasOwn(snapshot.previousEntry, key)) entry[key] = structuredClone(snapshot.previousEntry[key]);
        else delete entry[key];
      }
    }
    await this.writeSyntaxRoot(setting, { ...current, [scope]: { ...entry, ...structuredClone(updates) } });
  }

  private writeSyntaxRoot(setting: SyntaxSetting, value: ColorCustomizations | undefined): Promise<void> {
    return setting === "tokens" ? this.adapter.writeTokens(value) : this.adapter.writeSemanticTokens(value);
  }

  private assertOwnership(current: ThemeSettings, journal: PreviewJournal, acquiring: readonly string[] = []): void {
    const scope = journalScope(journal);
    if (current.theme !== journalThemeNames(journal)[journal.themeMode ?? "dark"]) {
      throw new Error(`The ${this.adapter.target} theme changed outside Themer. Preview updates stopped; cancel to restore safely.`);
    }
    if (journal.bracketColorization?.appliedEnabled === true && current.bracketColorization !== true) {
      throw new Error("Bracket colorization changed outside Themer. Preview updates stopped; cancel preserves that edit.");
    }
    const entry = scopedColors(current.colors?.[scope], "Current preview colors") ?? {};
    const changed = Object.entries(journal.appliedColors)
      .filter(([key, value]) => entry[key] !== value)
      .map(([key]) => key);
    for (const key of journal.clearedColors ?? []) {
      if (Object.hasOwn(entry, key)) changed.push(key);
    }
    for (const key of acquiring) {
      if (Object.hasOwn(journal.appliedColors, key) || journal.clearedColors?.includes(key)) continue;
      if (entry[key] !== journal.previousEntry?.[key] ||
        Object.hasOwn(entry, key) !== Object.hasOwn(journal.previousEntry ?? {}, key)) changed.push(key);
    }
    if (changed.length > 0) {
      throw new Error(`Preview colors changed outside Themer (${changed.slice(0, 4).join(", ")}). Updates stopped; cancel preserves those edits.`);
    }
    if (journal.syntax) {
      for (const setting of syntaxSettings) {
        const entry = syntaxEntry(current[setting], setting, scope);
        const changed = Object.entries(journal.syntax[setting].applied)
          .filter(([key, value]) => !isDeepStrictEqual(entry?.[key], value));
        if (changed.length > 0) {
          throw new Error(`Preview syntax changed outside Themer (${settingNames[setting]}.${changed[0]?.[0]}). Updates stopped; cancel preserves those edits.`);
        }
      }
    }
  }
}
