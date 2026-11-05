import { alphaError, compositeColors, contrastRatio, deltaE, parseColor } from "../color";
import type {
  ColorRole,
  ContrastCheck,
  GeneratedPalette,
  PaletteEvaluation,
  ReferenceTheme
} from "../shared/types";
import { numericParameterLimits } from "../shared/types";
import { classifyColor, fixedScrollbarOpacityPattern, opacityFor, supplementalColors } from "./rules";
import { activeItemContrastTarget, activeItemTargets, statefulStatusColors } from "./personality";

export interface Distribution {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export interface ErrorSummary extends Distribution {
  withinTolerancePercent: number;
}

export interface ColorSample {
  id: string;
  reference: string;
  generated: string;
  role: Exclude<ColorRole, "preserved">;
  deltaE: number;
  alphaError: number;
  transparent: boolean;
  renderedDeltaE: number | null;
  rendered: {
    reference: string;
    generated: string;
    backgroundIds: string[];
  } | null;
}

export interface PaletteInspection {
  evaluation: PaletteEvaluation;
  raw: ErrorSummary;
  rendered: ErrorSummary;
  alpha: Distribution & { exactMatchPercent: number };
  samples: ColorSample[];
  preservedIds: string[];
  unresolvedIds: string[];
  unscoredGeneratedIds: string[];
  renderedUnavailableIds: string[];
  roleCounts: Record<ColorRole, number>;
}

export function validateTolerance(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Tolerance must be a finite nonnegative number.");
  }
  return value;
}

function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction: number): number => {
    const position = (sorted.length - 1) * fraction;
    const lower = sorted[Math.floor(position)];
    if (lower === undefined) {
      return 0;
    }
    const upper = sorted[Math.ceil(position)] ?? lower;
    return lower + (upper - lower) * (position - Math.floor(position));
  };
  return {
    count: values.length,
    mean: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: quantile(0.5),
    p95: quantile(0.95),
    max: sorted.at(-1) ?? 0
  };
}

function errorSummary(values: number[], tolerance: number): ErrorSummary {
  return {
    ...distribution(values),
    withinTolerancePercent: values.length === 0
      ? 0
      : 100 * values.filter((value) => value <= tolerance).length / values.length
  };
}

function backgroundCandidates(id: string): string[] {
  const diffText = /^diffEditor\.(inserted|removed)TextBackground$/.exec(id);
  if (diffText) return [`diffEditor.${diffText[1]}LineBackground`, "editor.background"];
  const separator = id.indexOf(".");
  const root = separator === -1 ? id : id.slice(0, separator);
  const leaf = separator === -1 ? "" : id.slice(separator + 1);
  let candidates: string[] = [];
  if (root === "button" && /^secondary/i.test(leaf)) {
    candidates = ["button.secondaryBackground", "surface.background"];
  } else {
    if (/(?:Foreground|Border|Outline)$/.test(leaf)) {
      candidates.push(`${root}.${leaf.replace(/(?:Foreground|Border|Outline)$/, "Background")}`);
    }
    candidates.push(`${root}.background`);
  }
  if (/^(?:editor|modernEditorTab|scrollbar|minimap)/i.test(root)) {
    candidates.push("editor.background");
  } else if (/^terminal/i.test(root)) {
    candidates.push("terminal.background", "panel.background");
  } else if (/^agents/i.test(root)) {
    candidates.push("agentsPanel.background", "agents.background");
  } else if (/^(?:activityBar|modernActivityBar)/i.test(root)) {
    candidates.push("modernActivityBar.background", "activityBar.background");
  } else if (/^modernTab/i.test(root)) {
    candidates.push("sideBar.background", "panel.background");
  } else if (/^(?:list|sideBar|chat)/i.test(root)) {
    candidates.push("sideBar.background");
  } else if (/^tab/i.test(root)) {
    candidates.push("editorGroupHeader.tabsBackground", "editor.background");
  } else if (/^(?:titleBar|commandCenter)/i.test(root)) {
    candidates.push("titleBar.activeBackground");
  } else if (/^statusBar/i.test(root)) {
    candidates.push("statusBar.background");
  } else if (/^notification/i.test(root)) {
    candidates.push("notifications.background");
  } else if (/^panel/i.test(root)) {
    candidates.push("panel.background");
  } else if (/^peekView/i.test(root)) {
    candidates.push("peekViewEditor.background");
  }
  candidates.push("editor.background");
  return [...new Set(candidates)].filter((candidate) => candidate !== id);
}

interface Backdrop {
  reference: string;
  generated: string;
  ids: string[];
}

// The theme capture has no DOM/layer tree. Prefer a state/subsystem background;
// use an explicit editor background only as a documented fallback, never black.
function findBackdrop(
  id: string,
  reference: Record<string, string>,
  generated: Record<string, string>,
  visiting = new Set<string>()
): Backdrop | undefined {
  const seen = new Set(visiting).add(id);
  for (const candidate of backgroundCandidates(id)) {
    if (seen.has(candidate)) {
      continue;
    }
    const original = reference[candidate];
    const output = generated[candidate];
    if (original === undefined || output === undefined) {
      continue;
    }
    if (parseColor(original).alpha === 1 && parseColor(output).alpha === 1) {
      return { reference: original, generated: output, ids: [candidate] };
    }
    const below = findBackdrop(candidate, reference, generated, seen);
    if (below) {
      return {
        reference: compositeColors(original, below.reference),
        generated: compositeColors(output, below.generated),
        ids: [candidate, ...below.ids]
      };
    }
  }
  return undefined;
}

const contrastPairs: readonly [string, string, string, number][] = [
  ...Object.entries(activeItemTargets).flatMap(([id, [background, , hover]]): [string, string, string, number][] => [
    [`Active item ${id}`, id, background, activeItemContrastTarget],
    ...(hover ? [[`Active item hover ${id}`, id, hover, activeItemContrastTarget] as [string, string, string, number]] : [])
  ]),
  ["Status bar text", "statusBar.foreground", "statusBar.background", 4.5],
  ["Debug status bar text", "statusBar.debuggingForeground", "statusBar.debuggingBackground", 4.5],
  ["No-folder status bar text", "statusBar.noFolderForeground", "statusBar.noFolderBackground", 4.5],
  ["Status item hover text", "statusBarItem.hoverForeground", "statusBarItem.hoverBackground", 4.5],
  ["Remote status item text", "statusBarItem.remoteForeground", "statusBarItem.remoteBackground", 4.5],
  ["Remote status item hover text", "statusBarItem.remoteHoverForeground", "statusBarItem.remoteHoverBackground", 4.5],
  ["Editor text", "editor.foreground", "editor.background", 4.5],
  ["Workbench text on editor", "foreground", "editor.background", 4.5],
  ["Muted description on editor (context approximation)", "descriptionForeground", "editor.background", 4.5],
  ["Input text", "input.foreground", "input.background", 4.5],
  ["Primary button text", "button.foreground", "button.background", 4.5],
  ["Primary button hover text", "button.foreground", "button.hoverBackground", 4.5],
  ["Prominent status item text", "statusBarItem.prominentForeground", "statusBarItem.prominentBackground", 4.5],
  ["Prominent status item hover text", "statusBarItem.prominentHoverForeground", "statusBarItem.prominentHoverBackground", 4.5],
  ["Primary text on inactive editor selection", "foreground", "editor.inactiveSelectionBackground", 4.5],
  ["Prominent extension button text", "extensionButton.prominentForeground", "extensionButton.prominentBackground", 4.5],
  ["Prominent extension button hover text", "extensionButton.prominentForeground", "extensionButton.prominentHoverBackground", 4.5],
  ["Badge text", "badge.foreground", "badge.background", 4.5],
  ["Activity bar badge text", "activityBarBadge.foreground", "activityBarBadge.background", 4.5],
  ["Agents badge text", "agentsBadge.foreground", "agentsBadge.background", 4.5],
  ["Agents unread badge text", "agentsUnreadBadge.foreground", "agentsUnreadBadge.background", 4.5],
  ["Quick input focus text", "quickInputList.focusForeground", "quickInputList.focusBackground", 4.5],
  ["Quick input focus highlight", "quickInputList.focusHighlightForeground", "quickInputList.focusBackground", 4.5],
  ["Quick input focus icon", "quickInputList.focusIconForeground", "quickInputList.focusBackground", 4.5],
  ["Suggestion text", "editorSuggestWidget.selectedForeground", "editorSuggestWidget.selectedBackground", 4.5],
  ["Suggestion icon", "editorSuggestWidget.selectedIconForeground", "editorSuggestWidget.selectedBackground", 4.5],
  ["Suggestion match highlight", "editorSuggestWidget.focusHighlightForeground", "editorSuggestWidget.selectedBackground", 4.5],
  ["Inline code", "textPreformat.foreground", "textPreformat.background", activeItemContrastTarget],
  ["Info validation text", "inputValidation.infoForeground", "inputValidation.infoBackground", 4.5],
  ["Warning validation text", "inputValidation.warningForeground", "inputValidation.warningBackground", 4.5],
  ["Error validation text", "inputValidation.errorForeground", "inputValidation.errorBackground", 4.5],
  ["Warning badge text", "activityWarningBadge.foreground", "activityWarningBadge.background", 4.5],
  ["Error badge text", "activityErrorBadge.foreground", "activityErrorBadge.background", 4.5],
  ["Info notification icon", "notificationsInfoIcon.foreground", "notifications.background", 3],
  ["Warning notification icon", "notificationsWarningIcon.foreground", "notifications.background", 3],
  ["Error notification icon", "notificationsErrorIcon.foreground", "notifications.background", 3],
  ["Editor info mark (non-text approximation)", "editorInfo.foreground", "editor.background", 3],
  ["Editor warning mark (non-text approximation)", "editorWarning.foreground", "editor.background", 3],
  ["Editor error mark (non-text approximation)", "editorError.foreground", "editor.background", 3],
  ["Sidebar text", "sideBar.foreground", "sideBar.background", 4.5],
  ["Added file label", "gitDecoration.addedResourceForeground", "sideBar.background", 4.5],
  ["Deleted file label", "gitDecoration.deletedResourceForeground", "sideBar.background", 4.5],
  ["Modified file label", "gitDecoration.modifiedResourceForeground", "sideBar.background", 4.5],
  ["Inactive tab text", "tab.inactiveForeground", "tab.inactiveBackground", 4.5],
  ["Selected list text (context approximation)", "list.activeSelectionForeground", "list.activeSelectionBackground", 4.5],
  ["Focus indicator on editor (non-text approximation)", "focusBorder", "editor.background", 3]
];

function contrastChecks(original: Record<string, string>, generated: Record<string, string>): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  for (const [label, foregroundId, backgroundId, target] of contrastPairs) {
    const foreground = generated[foregroundId];
    let background = generated[backgroundId];
    if (foreground === undefined || background === undefined) {
      continue;
    }
    const hasAlpha = parseColor(foreground).alpha !== 1 || parseColor(background).alpha !== 1;
    if (parseColor(background).alpha !== 1) {
      const backdrop = findBackdrop(backgroundId, original, generated);
      if (!backdrop) {
        continue;
      }
      background = compositeColors(background, backdrop.generated);
    }
    const renderedForeground = compositeColors(foreground, background);
    const ratio = contrastRatio(renderedForeground, background);
    checks.push({
      label: `${label}${hasAlpha ? " (sRGB compositing approximation)" : ""}`,
      foreground: renderedForeground,
      background,
      ratio,
      target,
      passes: ratio >= target
    });
  }
  return checks;
}

export function inspectPalette(
  reference: ReferenceTheme,
  palette: GeneratedPalette,
  tolerance = 3
): PaletteInspection {
  validateTolerance(tolerance);
  const originalColors: Record<string, string> = {};
  const preservedIds: string[] = [];
  const unresolvedIds: string[] = [];
  const samples: ColorSample[] = [];
  const roleCounts: Record<ColorRole, number> = {
    surface: 0, text: 0, border: 0, accent: 0, info: 0, warning: 0, error: 0,
    added: 0, deleted: 0, modified: 0, preserved: 0
  };
  const entries = Object.entries(reference.colors);
  for (const [id, entry] of entries) {
    if (entry.value === null) {
      unresolvedIds.push(id);
      if (palette.colors[id] !== undefined || palette.roles[id] !== undefined) {
        throw new Error(`Unresolved reference color ${id} must not be invented.`);
      }
      continue;
    }
    parseColor(entry.value);
    originalColors[id] = entry.value;
    const output = palette.colors[id];
    if (output === undefined) {
      throw new Error(`Palette is missing explicit color ${id}.`);
    }
    parseColor(output);
    const assignment = classifyColor(id, reference.theme.type);
    const expectedRole = assignment?.role ?? "preserved";
    const role = palette.roles[id];
    const statusRole = Object.hasOwn(statefulStatusColors, id)
      ? statefulStatusColors[id as keyof typeof statefulStatusColors] : undefined;
    if (role === undefined || (role !== expectedRole && role !== statusRole)) {
      throw new Error(`Palette role for ${id} must be ${expectedRole}${statusRole ? ` or enabled stateful role ${statusRole}` : ""}.`);
    }
    roleCounts[role]++;
    if (role === "preserved") {
      if (output !== entry.value) {
        throw new Error(`Preserved source color ${id} was changed.`);
      }
      preservedIds.push(id);
      continue;
    }
    samples.push({
      id,
      reference: entry.value,
      generated: output,
      role,
      deltaE: deltaE(entry.value, output),
      alphaError: alphaError(entry.value, output),
      transparent: parseColor(entry.value).alpha !== 1 || parseColor(output).alpha !== 1,
      renderedDeltaE: null,
      rendered: null
    });
  }
  const knownIds = new Set(entries.map(([id]) => id));
  const unscoredGeneratedIds: string[] = [];
  for (const [id, role] of Object.entries(supplementalColors)) {
    if (knownIds.has(id)) {
      continue;
    }
    const value = palette.colors[id];
    if (value === undefined) {
      throw new Error(`Palette is missing supplemental color ${id}.`);
    }
    const assignment = classifyColor(id, reference.theme.type);
    if (!assignment) throw new Error(`Supplemental color ${id} has no generation rule.`);
    const alpha = parseColor(value).alpha ?? 1;
    const opacity = opacityFor(reference.theme.type, assignment.opacity);
    const maximumAlpha = Math.round(Math.min(1,
      opacity * (fixedScrollbarOpacityPattern.test(id) ? 1 : numericParameterLimits.overlayOpacity.max)
    ) * 255) / 255;
    const statusRole = Object.hasOwn(statefulStatusColors, id)
      ? statefulStatusColors[id as keyof typeof statefulStatusColors] : undefined;
    if ((opacity === 1 && alpha !== 1) || alpha > maximumAlpha ||
        (palette.roles[id] !== role && (statusRole === undefined || palette.roles[id] !== statusRole))) {
      throw new Error(`Supplemental color ${id} must have role ${role} and its required opacity.`);
    }
    unscoredGeneratedIds.push(id);
    knownIds.add(id);
  }
  for (const [id, role] of Object.entries(statefulStatusColors)) {
    if (knownIds.has(id) || palette.colors[id] === undefined) continue;
    if (palette.roles[id] !== role || parseColor(palette.colors[id]!).alpha !== 1) {
      throw new Error(`Stateful status color ${id} must have role ${role} and be opaque.`);
    }
    unscoredGeneratedIds.push(id);
    knownIds.add(id);
  }
  for (const id of [...Object.keys(palette.colors), ...Object.keys(palette.roles)]) {
    if (!knownIds.has(id)) {
      throw new Error(`Palette contains color ${id} outside explicit reference coverage or supported supplemental tokens.`);
    }
  }
  const expectedCoverage = {
    total: entries.length,
    generated: samples.length,
    preserved: preservedIds.length,
    unresolved: unresolvedIds.length,
    unscoredGenerated: unscoredGeneratedIds.length
  };
  for (const key of Object.keys(expectedCoverage) as (keyof typeof expectedCoverage)[]) {
    if (palette.coverage[key] !== expectedCoverage[key]) {
      throw new Error(`Palette coverage.${key} does not match its explicit colors.`);
    }
  }
  for (const sample of samples) {
    if (!sample.transparent) {
      sample.renderedDeltaE = sample.deltaE;
      sample.rendered = { reference: sample.reference, generated: sample.generated, backgroundIds: [] };
      continue;
    }
    const backdrop = findBackdrop(sample.id, originalColors, palette.colors);
    if (backdrop) {
      const renderedReference = compositeColors(sample.reference, backdrop.reference);
      const renderedGenerated = compositeColors(sample.generated, backdrop.generated);
      sample.renderedDeltaE = deltaE(renderedReference, renderedGenerated);
      sample.rendered = {
        reference: renderedReference,
        generated: renderedGenerated,
        backgroundIds: backdrop.ids
      };
    }
  }
  const raw = errorSummary(samples.map((sample) => sample.deltaE), tolerance);
  const rendered = errorSummary(
    samples.flatMap((sample) => sample.renderedDeltaE === null ? [] : [sample.renderedDeltaE]),
    tolerance
  );
  const alpha = {
    ...distribution(samples.map((sample) => sample.alphaError)),
    exactMatchPercent: samples.length === 0
      ? 0
      : 100 * samples.filter((sample) => sample.alphaError === 0).length / samples.length
  };
  const worst = [...samples]
    .sort((a, b) => b.deltaE - a.deltaE || a.id.localeCompare(b.id, "en"))
    .slice(0, 12)
    .map(({ id, reference: original, generated, deltaE: error, role }) => ({
      id, reference: original, generated, deltaE: error, role
    }));
  return {
    evaluation: {
      tolerance,
      meanError: raw.mean,
      p50Error: raw.p50,
      p95Error: raw.p95,
      maxError: raw.max,
      alphaMeanError: alpha.mean,
      alphaMaxError: alpha.max,
      withinTolerancePercent: raw.withinTolerancePercent,
      worst,
      contrast: contrastChecks(originalColors, palette.colors)
    },
    raw,
    rendered,
    alpha,
    samples,
    preservedIds,
    unresolvedIds,
    unscoredGeneratedIds,
    renderedUnavailableIds: samples.filter((sample) => sample.renderedDeltaE === null).map((sample) => sample.id),
    roleCounts
  };
}
