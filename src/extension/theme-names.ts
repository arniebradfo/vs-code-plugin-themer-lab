import { legacyPreviewThemeNames, previewThemeNames, themeModes } from "../shared/types";
import { requireRecord } from "../shared/validation";
import type { ColorCustomizations, PreviewAdapter } from "./preview";

function renamedTheme(name: string): string {
  const mode = themeModes.find((mode) => legacyPreviewThemeNames[mode] === name);
  return mode ? previewThemeNames[mode] : name;
}

function renamedScopes(root: ColorCustomizations | undefined): ColorCustomizations | undefined {
  let updated: ColorCustomizations | undefined;
  for (const [scope, value] of Object.entries(root ?? {})) {
    if (!/^(?:\[[^\]]+\])+$/.test(scope)) continue;
    const renamed = scope.replace(/\[([^\]]+)\]/g, (_, name: string) => `[${renamedTheme(name)}]`);
    if (renamed === scope || Object.hasOwn(updated ?? root ?? {}, renamed)) continue;
    updated ??= { ...root };
    // Keep originals for safe retries; an existing new-name scope is authoritative.
    updated[renamed] = structuredClone(requireRecord(value, `Legacy theme settings ${scope}`));
  }
  return updated;
}

export async function migrateThemeNames(adapter: PreviewAdapter): Promise<boolean> {
  if (adapter.loadJournal() !== undefined) return false;
  let changed = false;
  for (const setting of ["colors", "tokens", "semanticTokens"] as const) {
    const updated = renamedScopes(adapter.read()[setting]);
    if (!updated) continue;
    if (setting === "colors") await adapter.writeColors(updated);
    else if (setting === "tokens") await adapter.writeTokens(updated);
    else await adapter.writeSemanticTokens(updated);
    changed = true;
  }
  const theme = adapter.read().theme;
  const renamed = theme === undefined ? undefined : renamedTheme(theme);
  if (renamed !== theme) {
    await adapter.writeTheme(renamed);
    changed = true;
  }
  return changed;
}
