import { changeParameters, colorParameterKeys, personalityDefaults, personalityKeys, severityParameters } from "../shared/types";
import type { ChangeKind, ColorParameter, ColorRole, Severity, ThemeMode, ThemeParameters } from "../shared/types";
import { inactiveSelectionContrastTarget } from "./selection";
import { activeItemContrastTarget, activeItemLightness, activeItemTargets, overlayTint, personalityFixedRuleCount, statefulStatusColors } from "./personality";
import type { OverlayTintProfile } from "./personality";

interface Family {
  anchor: "background" | "foreground" | "accent" | "source" | "black";
  amount: number;
}

// Background amounts are OKLab lightness offsets. Foreground amounts interpolate
// background → foreground. Accent amounts are OKLCH lightness offsets.
export const families = {
  canvas: { anchor: "background", amount: 0 },
  chrome: { anchor: "background", amount: 0.03 },
  raised: { anchor: "background", amount: 0.06 },
  control: { anchor: "background", amount: 0.08 },
  selected: { anchor: "background", amount: 0.13 },
  active: { anchor: "background", amount: 0.22 },
  text: { anchor: "foreground", amount: 1 },
  muted: { anchor: "foreground", amount: 0.73 },
  disabled: { anchor: "foreground", amount: 0.43 },
  faint: { anchor: "foreground", amount: 0.33 },
  strongText: { anchor: "foreground", amount: 1.32 },
  selectedText: { anchor: "foreground", amount: 1.23 },
  slider: { anchor: "foreground", amount: 0.9 },
  border: { anchor: "background", amount: 0.11 },
  controlBorder: { anchor: "background", amount: 0.14 },
  strongBorder: { anchor: "background", amount: 0.42 },
  accent: { anchor: "accent", amount: 0 },
  accentHover: { anchor: "accent", amount: 0.01 },
  accentFocus: { anchor: "accent", amount: 0.09 },
  accentLink: { anchor: "accent", amount: 0.13 },
  accentLinkHover: { anchor: "accent", amount: 0.15 },
  accentSelection: { anchor: "accent", amount: -0.06 },
  sourceColor: { anchor: "source", amount: 1 },
  sourceBackground: { anchor: "source", amount: 0.25 },
  sourceBorder: { anchor: "source", amount: 0.75 },
  clear: { anchor: "black", amount: 0 }
} as const satisfies Record<string, Family>;

export const opacities = {
  opaque: 1,
  clear: 0,
  quiet: 0.075,
  subtle: 0.1,
  hover: 0.13,
  active: 0.2,
  highlight: 0.3,
  selection: 0.5,
  inactiveSelection: 0.38,
  focus: 0.7,
  strongSelection: 0.87,
  overlay: 0.15,
  grip: 0.4,
  slider: 0.52,
  sliderHover: 0.56,
  sliderActive: 0.61
} as const;

export type FamilyName = keyof typeof families;
export const lightFamilies = {
  ...families,
  chrome: { anchor: "background", amount: 0.012 },
  raised: { anchor: "background", amount: 0.012 },
  control: { anchor: "background", amount: 0.063 },
  selected: { anchor: "background", amount: 0.125 },
  active: { anchor: "background", amount: 0.05 },
  muted: { anchor: "foreground", amount: 0.675 },
  disabled: { anchor: "foreground", amount: 0.425 },
  faint: { anchor: "foreground", amount: 0.275 },
  selectedText: { anchor: "foreground", amount: 1 },
  slider: { anchor: "foreground", amount: 0.655 },
  border: { anchor: "background", amount: 0.043 },
  controlBorder: { anchor: "background", amount: 0.12 },
  strongBorder: { anchor: "background", amount: 0.38 },
  accentHover: { anchor: "accent", amount: -0.025 },
  accentFocus: { anchor: "accent", amount: 0 },
  accentLink: { anchor: "accent", amount: 0 },
  accentLinkHover: { anchor: "accent", amount: 0 },
  accentSelection: { anchor: "accent", amount: 0 },
  sourceBackground: { anchor: "source", amount: 0.08 },
  sourceBorder: { anchor: "source", amount: 1 }
} as const satisfies Record<FamilyName, Family>;

export const lightOpacities = {
  ...opacities,
  subtle: 0.083,
  hover: 0.145,
  highlight: 0.15,
  selection: 0.25,
  inactiveSelection: 0.1,
  focus: 1,
  strongSelection: 0.6,
  slider: 0.75,
  sliderHover: 0.815,
  sliderActive: 0.878,
  controlBorder: 0.4,
  commandBorder: 0.667
} as const;
export type OpacityName = keyof typeof lightOpacities;

export interface Assignment {
  role: Exclude<ColorRole, "preserved">;
  family: FamilyName;
  opacity: OpacityName;
  onColor?: boolean;
}

interface Selector extends Assignment {
  pattern: RegExp;
}

// Severity and change controls are resolved first. Other semantic colors stay preserved
// before generic UI selectors, regardless of hue.
export const preservationPatterns = [
  /^(?:diffEditor\w*|gitDecoration|scm\w*|testing|debugIcon|debugConsole|symbolIcon|problemsIcon|charts|progressBar)\./i,
  /^terminal(?:\.ansi|SymbolIcon\.|CommandDecoration\.)/i,
  /(?:diagnostic|error|warning|info|success|added|deleted|removed|modified|edited|conflict|untracked|ignored|debugging|remote|running|stopped|passed|failed|pending|offline|online)/i
];

const uiDomains = "(?:actionBar|activityBar\\w*|agents\\w*|breadcrumb\\w*|button|chat|checkbox|" +
  "commandCenter|debugToolBar|dropdown|editor\\w*|extensionButton|input\\w*|keybindingLabel|" +
  "list|menu|menubar|modernActivityBar\\w*|notification\\w*|panel\\w*|peekView\\w*|pickerGroup|" +
  "quickInput\\w*|sideBar\\w*|statusBar\\w*|surface|tab|terminal|terminalCursor|text\\w*|" +
  "titleBar|toolbar|welcomePage|widget)";
const uiSuffix = (suffix: string): RegExp => new RegExp(`^${uiDomains}\\..*${suffix}$`, "i");
const uiProperty = (property: string): RegExp => new RegExp(`^${uiDomains}\\.${property}$`, "i");

const select = (
  pattern: RegExp,
  role: Assignment["role"],
  family: FamilyName,
  opacity: OpacityName = "opaque",
  onColor = false
): Selector => ({ pattern, role, family, opacity, ...(onColor ? { onColor: true } : {}) });

const severitySelectors: readonly Selector[] = severityParameters.flatMap((severity) => [
  select(new RegExp(`^inputValidation\\.${severity}Foreground$`, "i"), "text", "text"),
  select(new RegExp(`^inputValidation\\.${severity}Background$`, "i"), severity, "sourceBackground"),
  select(new RegExp(`^inputValidation\\.${severity}Border$`, "i"), severity, "sourceBorder"),
  select(new RegExp(`^activity${severity}Badge\\.foreground$`, "i"), severity, "sourceColor", "opaque", true),
  select(new RegExp(`^activity${severity}Badge\\.background$`, "i"), severity, "sourceColor"),
  select(new RegExp(`^(?:${severity}Foreground|(?:editor${severity}|notifications${severity}Icon|problems${severity}Icon)\\.foreground|(?:editorOverviewRuler|list|debugConsole)\\.${severity}Foreground)$`, "i"),
    severity, "sourceColor")
]);

const changeSelectors: readonly Selector[] = [
  ...changeParameters.flatMap((kind) => [
    select(new RegExp(`^(?:(?:editorGutter|minimapGutter)\\.${kind}Background|editorOverviewRuler\\.${kind}Foreground)$`, "i"),
      kind, "sourceColor"),
    select(new RegExp(`^editorGutter\\.${kind}SecondaryBackground$`, "i"), kind, "sourceColor", "selection")
  ]),
  select(/^gitDecoration\.(?:added|untracked)ResourceForeground$/i, "added", "sourceColor"),
  select(/^gitDecoration\.(?:deleted|stageDeleted)ResourceForeground$/i, "deleted", "sourceColor"),
  select(/^chat\.linesAddedForeground$/i, "added", "sourceColor"),
  select(/^chat\.linesRemovedForeground$/i, "deleted", "sourceColor"),
  select(/^(?:gitDecoration\.(?:modified|stageModified|renamed)ResourceForeground|chat\.editedFileForeground)$/i, "modified", "sourceColor"),
  select(/^diffEditor\.insertedTextBackground$/i, "added", "sourceColor", "highlight"),
  select(/^diffEditor\.removedTextBackground$/i, "deleted", "sourceColor", "highlight"),
  select(/^diffEditor(?:Gutter)?\.insertedLineBackground$/i, "added", "sourceColor", "overlay"),
  select(/^diffEditor(?:Gutter)?\.removedLineBackground$/i, "deleted", "sourceColor", "overlay"),
  select(/^(?:diffEditor\.insertedTextBorder|diffEditorOverview\.insertedForeground|scmGraph\.historyItemHoverAdditionsForeground)$/i, "added", "sourceColor"),
  select(/^(?:diffEditor\.removedTextBorder|diffEditorOverview\.removedForeground|scmGraph\.historyItemHoverDeletionsForeground)$/i, "deleted", "sourceColor"),
  select(/^mergeEditor\.change(?:Base)?\.background$/i, "modified", "sourceColor", "overlay"),
  select(/^mergeEditor\.change(?:Base)?\.word\.background$/i, "modified", "sourceColor", "highlight")
];

export const supplementalSeverityColors = {
  "editorInfo.foreground": "info",
  "editorWarning.foreground": "warning",
  "editorError.foreground": "error"
} as const satisfies Record<string, Severity>;

export const supplementalChangeColors = {
  "chat.linesAddedForeground": "added",
  "chat.linesRemovedForeground": "deleted",
  "gitDecoration.renamedResourceForeground": "modified",
  "minimapGutter.addedBackground": "added",
  "minimapGutter.deletedBackground": "deleted",
  "minimapGutter.modifiedBackground": "modified",
  "diffEditor.insertedLineBackground": "added",
  "diffEditor.removedLineBackground": "deleted",
  "diffEditorGutter.insertedLineBackground": "added",
  "diffEditorGutter.removedLineBackground": "deleted",
  "diffEditorOverview.insertedForeground": "added",
  "diffEditorOverview.removedForeground": "deleted",
  "scmGraph.historyItemHoverAdditionsForeground": "added",
  "scmGraph.historyItemHoverDeletionsForeground": "deleted",
  "mergeEditor.change.background": "modified",
  "mergeEditor.change.word.background": "modified",
  "mergeEditor.changeBase.background": "modified",
  "mergeEditor.changeBase.word.background": "modified"
} as const satisfies Record<string, ChangeKind>;

export const modernColorAliases = {
  "modernUI.shellBackground": "titleBar.activeBackground",
  "modernUI.inactiveShellBackground": "titleBar.inactiveBackground",
  "modernPanel.border": "surface.border",
  "modernTab.activeBackground": "modernActivityBarItem.activeBackground",
  "modernTab.activeForeground": "list.inactiveSelectionForeground",
  "modernTab.hoverBackground": "list.hoverBackground",
  "modernTab.hoverForeground": "foreground",
  "modernEditorTab.activeBackground": "tab.activeBackground",
  "modernEditorTab.activeActionBackground": "tab.activeBackground",
  "modernEditorTab.activeForeground": "tab.activeForeground",
  "modernEditorTab.activeHoverBackground": "tab.hoverBackground",
  "modernEditorTab.activeHoverActionBackground": "tab.hoverBackground",
  "modernEditorTab.inactiveBackground": "tab.inactiveBackground",
  "modernEditorTab.hoverBackground": "tab.hoverBackground",
  "modernEditorTab.hoverActionBackground": "tab.hoverBackground",
  "modernEditorTab.hoverForeground": "tab.hoverForeground",
  "modernEditorTab.selectedActionBackground": "tab.selectedBackground",
  "modernActivityBar.background": "activityBar.background",
  "modernActivityBar.inactiveBackground": "activityBar.background",
  "editorGroupHeader.connectedTabsBackground": "editorGroupHeader.tabsBackground",
  "editor.border": "surface.border"
} as const;

export const supplementalModernColors: Record<string, ColorRole> = {
  ...Object.fromEntries(Object.keys(modernColorAliases).map((id) => [
    id, /Foreground$/.test(id) ? "text" : /border$/.test(id) ? "border" : "surface"
  ])),
  "modernSash.gripForeground": "text",
  "modernActivityBar.border": "border",
  "modernActivityBarItem.activeBackground": "surface",
  "modernActivityBarItem.activeForeground": "text",
  "modernActivityBarItem.hoverBackground": "surface",
  "modernActivityBarItem.hoverForeground": "text",
  "surface.background": "surface",
  "surface.foreground": "text",
  "surface.border": "border",
  "statusBar.inactiveBackground": "surface"
};

export const supplementalUiColors = {
  "statusBarItem.prominentHoverForeground": "text",
  "editorSuggestWidget.selectedForeground": "text",
  "editorSuggestWidget.selectedIconForeground": "text",
  "editorSuggestWidget.focusHighlightForeground": "text"
} as const satisfies Record<string, ColorRole>;

export const supplementalActiveColors: Record<string, ColorRole> = Object.fromEntries(
  Object.keys(activeItemTargets).map((id) => [id, "text"])
);
export const supplementalColors = {
  ...supplementalSeverityColors, ...supplementalChangeColors, ...supplementalUiColors,
  ...supplementalModernColors, ...supplementalActiveColors
};

// Ordered semantic selectors, not a lookup of captured RGB values or residuals.
export const selectors: readonly Selector[] = [
  select(/^modernSash\.gripForeground$/i, "text", "text", "grip"),
  select(/^(?:browser|inlineChat)\.border$/i, "border", "clear", "clear"),
  select(/^(?:agentsNewSessionButton\.background|button\.secondaryBackground)$/i, "surface", "clear", "clear"),
  select(/^terminal\.tab\.activeBorder$/i, "accent", "accentFocus", "clear"),
  select(/^(?:chat\.requestBubbleHoverBackground|list\.(?:activeSelection|focus)Background|modernActivityBarItem\.activeBackground)$/i,
    "surface", "strongText", "hover"),
  select(/^(?:chat\.requestBubbleBackground|agentsNewSessionButton\.hoverBackground|button\.secondaryHoverBackground|commandCenter\.activeBackground|list\.hoverBackground|modernActivityBarItem\.hoverBackground|editor\.(?:findRangeHighlight|hoverHighlight|rangeHighlight)Background)$/i,
    "surface", "strongText", "quiet"),
  select(/^toolbar\.activeBackground$/i, "surface", "strongText", "active"),
  select(/^editorSuggestWidget\.selectedBackground$/i, "surface", "strongText", "overlay"),
  select(/^editorSuggestWidget\.(?:selected(?:Icon)?Foreground|focusHighlightForeground)$/i, "text", "selectedText"),
  select(/^editorGroup\.border$/i, "border", "strongText", "quiet"),
  select(/^(?:scrollbarSlider|minimapSlider)\.activeBackground$/i, "surface", "slider", "sliderActive"),
  select(/^(?:scrollbarSlider|minimapSlider)\.hoverBackground$/i, "surface", "slider", "sliderHover"),
  select(/^(?:scrollbarSlider|minimapSlider)\.background$/i, "surface", "slider", "slider"),
  select(/^scrollbar\.shadow$/i, "surface", "chrome", "highlight"),
  select(/^(?:button\.hoverBackground|extensionButton\.prominentHoverBackground|statusBarItem\.prominentHoverBackground)$/i, "accent", "accentHover"),
  select(/^(?:button\.(?:background|border)|extensionButton\.prominentBackground|statusBarItem\.prominentBackground|chat\.inputWorkingBorderColor\d+|agentsGradient\.tintColor|quickInputList\.focusBackground|welcomePage\.progress\.foreground)$/i,
    "accent", "accent"),
  select(/^(?:\w*Badge|badge)\.background$/i, "accent", "accent"),
  select(/^textLink\.activeForeground$/i, "accent", "accentLinkHover"),
  select(/^(?:textLink\.foreground|list\.highlightForeground|chat\.slashCommandForeground)$/i, "accent", "accentLink"),
  select(/^textPreformat\.foreground$/i, "accent", "accent"),
  select(/^(?:editorLink\.activeForeground|notificationLink\.foreground|panelTitle\.activeBorder|tab\.(?:active|selected)BorderTop|menu\.selectionBorder)$/i,
    "accent", "accentFocus"),
  select(/^(?:focusBorder|.*\.(?:activeFocusBorder|focusBorder|focusOutline))$/i, "accent", "accentFocus", "focus"),
  select(/^editor\.selectionBackground$/i, "accent", "accentSelection", "strongSelection"),
  select(/^editor\.(?:inactiveSelection|selectionHighlight)Background$/i, "accent", "accentSelection", "inactiveSelection"),
  select(/^editor\.(?:findMatch|findMatchHighlight|wordHighlightStrong)Background$/i, "accent", "accentSelection", "selection"),
  select(/^editor\.wordHighlightBackground$/i, "accent", "accentSelection", "highlight"),
  select(/^editorBracketMatch\.background$/i, "accent", "accentFocus", "highlight"),
  select(/^editorOverviewRuler\.findMatchForeground$/i, "accent", "accentFocus", "selection"),
  select(/^editorCommentsWidget\.rangeActiveBackground$/i, "accent", "accentFocus", "highlight"),
  select(/^editorCommentsWidget\.rangeBackground$/i, "accent", "accentFocus", "overlay"),
  select(/^(?:menu\.selectionBackground|peekView(?:Editor|Result)\.(?:matchHighlight|selection)Background|terminal\.selectionBackground|chat\.slashCommandBackground)$/i,
    "accent", "accentFocus", "overlay"),
  select(/^list\.dropBackground$/i, "accent", "accentFocus", "subtle"),
  select(/^editorWhitespace\.foreground$/i, "text", "muted", "highlight"),
  select(/^editorIndentGuide\.background\d*$/i, "border", "strongBorder", "highlight"),
  select(/^editorIndentGuide\.activeBackground\d*$/i, "border", "strongBorder"),
  select(/^(?:tab\.unfocusedInactiveForeground|list\.invalidItemForeground)$/i, "text", "faint"),
  select(/^(?:disabledForeground|.*\.placeholderForeground)$/i, "text", "disabled"),
  select(/^(?:descriptionForeground|icon\.foreground|breadcrumb\.foreground|checkbox\.foreground|editorCodeLens\.foreground|editorLineNumber\.foreground|editorRuler\.foreground|titleBar\.(?:active|inactive)Foreground|statusBar\.foreground|peekViewTitleDescription\.foreground|tab\.unfocusedActiveForeground)$/i,
    "text", "muted"),
  select(uiSuffix("(?:inactiveForeground|noFolderForeground|lineForeground)"), "text", "muted"),
  select(/^list\.(?:selected|activeSelection|inactiveSelection)Foreground$/i, "text", "selectedText"),
  select(uiProperty("selectedForeground"), "text", "strongText"),
  select(/^(?:(?:\w*Badge|badge|button)\.foreground|extensionButton\.prominentForeground|statusBarItem\.prominent(?:Hover)?Foreground|quickInputList\.focus(?:Highlight|Icon)?Foreground)$/i,
    "text", "accent"),
  select(/^(?:(?:\w*Badge|badge|button|extensionButton|quickInputList)\.(?:foreground|prominentForeground|focus(?:Highlight|Icon)?Foreground)|list\.activeSelectionIconForeground|statusBarItem\.hoverForeground)$/i,
    "text", "strongText"),
  select(/^activityBar(?:Top)?\.activeBorder$/i, "border", "text"),
  select(/^tab\.(?:activeBorder|unfocusedActiveBorder)$/i, "border", "canvas"),
  select(/^checkbox\.border$/i, "border", "strongBorder"),
  select(/^(?:(?:input|dropdown|agentsChatInput|agentsNewSessionButton|commandCenter)\.(?:active)?Border|button\.secondaryBorder)$/i,
    "border", "controlBorder"),
  select(uiSuffix("(?:border(?:Top)?|outline|separatorBackground)"), "border", "border"),
  select(/^textSeparator\.foreground$/i, "border", "border"),
  select(/^(?:editor\.background|editorGutter\.background|editorStickyScroll\.background|agents\.background|breadcrumb\.background|statusBar\.inactiveBackground|titleBar\.inactiveBackground|tab\.(?:active|unfocusedActive)Background)$/i,
    "surface", "canvas"),
  select(/^(?:titleBar\.activeBackground|tab\.(?:unfocused)?InactiveBackground)$/i, "surface", "chrome"),
  select(/^(?:agentsChatInput|breadcrumbPicker|editor(?:Hover|Suggest)?Widget|editorStickyScrollHover|menu|notifications|quickInput(?:Title)?)\.background$/i,
    "surface", "raised"),
  select(/^(?:checkbox\.background|editor\.lineHighlightBackground|menubar\.selectionBackground|notificationCenterHeader\.background|text(?:BlockQuote|CodeBlock|Preformat)\.background)$/i,
    "surface", "control"),
  select(/^(?:activityBar\.activeBackground|inputOption\.activeBackground|list\.inactiveSelectionBackground|tab\.selectedBackground|actionBar\.toggledBackground|settings\.dropdownBackground|terminal\.inactiveSelectionBackground|statusBarItem\.hoverBackground|welcomePage\.tileBackground)$/i,
    "surface", "selected"),
  select(/^statusBarItem\.activeBackground$/i, "surface", "active"),
  select(/^tab\.(?:unfocused)?HoverBackground$/i, "surface", "chrome"),
  select(uiSuffix("hoverBackground"), "surface", "control"),
  select(uiProperty("(?:active|selected)Background"), "surface", "selected"),
  select(uiSuffix("(?:background|listBackground)"), "surface", "chrome"),
  select(/^foreground$/i, "text", "text"),
  select(uiSuffix("(?:foreground|fileForeground|headerForeground)"), "text", "text")
];

const lightSelectors: readonly Selector[] = [
  select(/^scrollbar\.shadow$/i, "surface", "clear", "clear"),
  select(/^button\.secondaryBackground$/i, "surface", "control"),
  select(/^button\.secondaryHoverBackground$/i, "surface", "active"),
  select(/^button\.secondaryBorder$/i, "border", "control"),
  select(/^modernActivityBarItem\.hoverBackground$/i, "surface", "active"),
  select(/^modernActivityBarItem\.activeBackground$/i, "surface", "control"),
  select(/^editorGroup\.border$/i, "border", "control"),
  select(/^commandCenter\.activeBackground$/i, "surface", "selected", "selection"),
  select(/^toolbar\.activeBackground$/i, "surface", "selected"),
  select(/^chat\.requestBubbleBackground$/i, "accent", "accent", "quiet"),
  select(/^chat\.requestBubbleHoverBackground$/i, "accent", "accent", "inactiveSelection"),
  select(/^(?:input|dropdown)\.(?:background|listBackground)$/i, "surface", "canvas"),
  select(/^(?:statusBar\.inactiveBackground|titleBar\.inactiveBackground|tab\.unfocusedActiveBackground)$/i, "surface", "chrome"),
  select(/^tab\.(?:unfocused)?HoverBackground$/i, "surface", "canvas"),
  select(/^(?:panelTitle\.activeBorder|tab\.activeBorderTop|activityBar(?:Top)?\.activeBorder)$/i, "border", "strongText"),
  select(/^(?:focusBorder|.*\.(?:activeFocusBorder|focusBorder|focusOutline))$/i, "accent", "accentFocus"),
  select(/^input\.border$/i, "border", "controlBorder", "controlBorder"),
  select(/^commandCenter\.border$/i, "border", "controlBorder", "commandBorder"),
  select(/^(?:widget|menu|notifications|editor(?:Hover|Suggest)?Widget|panelSection|panelSectionHeader)\.border$/i, "border", "control"),
  select(/^(?:disabledForeground|list\.invalidItemForeground|tab\.unfocusedInactiveForeground)$/i, "text", "faint"),
  select(/^editorRuler\.foreground$/i, "border", "chrome"),
  select(/^editorIndentGuide\.background\d*$/i, "border", "chrome", "selection"),
  select(/^editorIndentGuide\.activeBackground\d*$/i, "border", "active"),
  select(/^editorWhitespace\.foreground$/i, "text", "muted", "selection"),
  select(/^list\.hoverBackground$/i, "surface", "strongText", "quiet"),
  select(/^toolbar\.hoverBackground$/i, "surface", "strongText", "hover"),
  select(/^editor\.(?:findRangeHighlight|hoverHighlight|rangeHighlight)Background$/i, "surface", "strongText", "subtle"),
  select(/^editor\.selectionBackground$/i, "accent", "accentSelection", "selection"),
  select(/^editor\.findMatchHighlightBackground$/i, "accent", "accentSelection", "inactiveSelection"),
  select(/^editor\.wordHighlightStrongBackground$/i, "accent", "accentSelection", "highlight"),
  select(/^editorBracketMatch\.background$/i, "accent", "accentFocus", "selection"),
  select(/^editorOverviewRuler\.findMatchForeground$/i, "accent", "accentFocus", "strongSelection"),
  select(/^menu\.selectionBackground$/i, "accent", "accentFocus", "inactiveSelection"),
  select(/^peekView(?:Editor|Result)\.(?:matchHighlight|selection)Background$/i, "accent", "accentFocus", "active"),
  select(/^editor\.lineHighlightBackground$/i, "surface", "control", "selection"),
  select(/^list\.inactiveSelectionBackground$/i, "surface", "selected", "strongSelection")
];

export const interactionSurfacePatterns = [
  /^(?:list|terminal)\.(?:(?:in)?activeSelection|(?:in)?activeFocus|focus|selection|hover)Background$/i,
  /^(?:activityBar(?:Top)?|modernActivityBarItem|modernTab)\.(?:active|hover)Background$/i,
  /^tab\.(?:selected|unfocusedActive|(?:unfocused)?Hover)Background$/i,
  /^(?:menu|menubar|inputOption|actionBar|toolbar)\.(?:selection|active|toggled|hover)Background$/i
] as const;
export const quietTintPattern = /^(?:(?:scrollbarSlider|minimapSlider)\.(?:background|hoverBackground|activeBackground)|scrollbar\.shadow|modernSash\.gripForeground)$/i;
export const fixedScrollbarOpacityPattern = /^(?:(?:scrollbarSlider|minimapSlider)\.(?:background|hoverBackground|activeBackground)|scrollbar\.shadow)$/i;

export function interactionSurfaceBackdrops(id: string): readonly string[] | undefined {
  if (Object.hasOwn(modernColorAliases, id)) {
    return interactionSurfaceBackdrops(modernColorAliases[id as keyof typeof modernColorAliases]);
  }
  if (!interactionSurfacePatterns.some((pattern) => pattern.test(id))) return undefined;
  const root = id.slice(0, id.indexOf("."));
  switch (root) {
    case "list":
    case "activityBarTop":
    case "modernTab":
      return ["sideBar.background"];
    case "terminal": return ["terminal.background", "panel.background", "editor.background"];
    case "activityBar": return ["activityBar.background"];
    case "modernActivityBarItem": return ["modernActivityBar.background"];
    case "menu": return ["menu.background"];
    case "menubar": return ["titleBar.activeBackground"];
    case "inputOption": return ["input.background"];
    default: return ["editor.background"];
  }
}

export function overlayTintProfile(id: string, assignment: Assignment, mode: ThemeMode): OverlayTintProfile | undefined {
  if (Object.hasOwn(modernColorAliases, id)) {
    return overlayTintProfile(modernColorAliases[id as keyof typeof modernColorAliases], assignment, mode);
  }
  const opacity = opacityFor(mode, assignment.opacity);
  if (opacity === 0 || !["surface", "text", "border", "accent"].includes(assignment.role)) return undefined;
  if (quietTintPattern.test(id)) return "quiet";
  if (opacity < 1) return "overlay";
  return assignment.role === "surface" && interactionSurfacePatterns.some((pattern) => pattern.test(id))
    ? "surface" : undefined;
}

export function classifyColor(id: string, mode: ThemeMode = "dark"): Assignment | undefined {
  if (Object.hasOwn(modernColorAliases, id)) {
    return classifyColor(modernColorAliases[id as keyof typeof modernColorAliases], mode);
  }
  const source = severitySelectors.find(({ pattern }) => pattern.test(id)) ??
    changeSelectors.find(({ pattern }) => pattern.test(id));
  if (source) {
    const { pattern: _pattern, ...assignment } = source;
    return assignment;
  }
  if (preservationPatterns.some((pattern) => pattern.test(id))) {
    return undefined;
  }
  const selector = (mode === "light" ? lightSelectors.find(({ pattern }) => pattern.test(id)) : undefined) ??
    selectors.find(({ pattern }) => pattern.test(id));
  if (!selector) {
    return undefined;
  }
  return { role: selector.role, family: selector.family, opacity: selector.opacity };
}

export const parameterDefaults = {
  ...personalityDefaults,
  infoSource: "accent",
  surfaceSpread: 1,
  mutedContrast: 1,
  borderStrength: 1,
  overlayOpacity: 1
} as const;

export const parameterSourceIds = {
  background: "editor.background",
  foreground: "foreground",
  accent: "button.background",
  info: "notificationsInfoIcon.foreground",
  warning: "notificationsWarningIcon.foreground",
  error: "errorForeground",
  added: "gitDecoration.addedResourceForeground",
  deleted: "gitDecoration.deletedResourceForeground",
  modified: "gitDecoration.modifiedResourceForeground"
} as const satisfies Record<ColorParameter, string>;

export const controls = [
  "mode", ...colorParameterKeys, "infoSource", "surfaceSpread", "mutedContrast",
  "borderStrength", "overlayOpacity", ...personalityKeys
] as const satisfies readonly (keyof ThemeParameters)[];

export const infoLightnessLift = 0.08;
export const fixedRuleCount = Object.keys(families).length + Object.keys(opacities).length + 2 + personalityFixedRuleCount;

export const modelDefinition = {
  fitting: "Explicit anchor colors with fixed semantic families; no optimization or per-token numeric residuals.",
  fixedRuleCountMeaning: "One rule per color transform family and per opacity transform, plus linked Info lightness, inactive selection contrast, four overlay tint constants, two active-text lightness bounds and the shared active-item/inline-code text contrast target; semantic selectors are counted separately.",
  fixedRuleCount,
  fixedNumericCoefficientCount: fixedRuleCount,
  semanticSelectorCount: severitySelectors.length + changeSelectors.length + selectors.length + preservationPatterns.length +
    Object.keys(modernColorAliases).length + Object.keys(activeItemTargets).length + Object.keys(statefulStatusColors).length +
    interactionSurfacePatterns.length + 4,
  semanticSelectorCountMeaning: "Ordered severity/change and UI selectors, preservation patterns, Modern counterpart aliases, optional active-item/status assignments, four opaque interaction-surface patterns, quiet structural tint pattern, fixed scrollbar opacity policy, inline-code contrast guard, and one preserve-unknown fallback.",
  learnedCoefficientCount: 0,
  perTokenResidualCount: 0,
  parameterSourceIds,
  parameterDefaults,
  infoLightnessLift,
  inactiveSelectionContrastTarget,
  personality: {
    defaults: personalityDefaults, overlayTint, activeItemContrastTarget, activeItemLightness, statefulStatusColors,
    interactionSurfacePatterns: interactionSurfacePatterns.map((pattern) => pattern.toString()),
    quietTintPattern: quietTintPattern.toString()
  },
  modernColorAliases,
  fixedScrollbarOpacityPattern: fixedScrollbarOpacityPattern.toString(),
  supplementalColors,
  supplementalPolicy: "Generate supported severity/change, suggestion-text, Modern UI counterpart and active-item tokens absent from the explicit reference. Stateful status tokens are emitted only when enabled. Count missing tokens separately and exclude them from fidelity statistics. Explicit null values stay unresolved.",
  families,
  opacities,
  selectors: [...severitySelectors, ...changeSelectors, ...selectors].map(({ pattern, ...assignment }) => ({ pattern: pattern.toString(), ...assignment })),
  preservationPatterns: preservationPatterns.map((pattern) => pattern.toString()),
  unknownPolicy: "Preserve source values and exclude them from generated fit statistics.",
  formulas: {
    background: "L = background.L + sign(foreground.L - background.L) * amount * surfaceSpread; keep background a,b. Zero flattens canvas-derived layers; negative separation reverses their order. Borders, foreground-derived overlays and accent/status backgrounds are independent.",
    foreground: "L = background.L + (foreground.L - background.L) * amount; keep foreground a,b. Muted text amounts (<1) scale by mutedContrast.",
    border: "Signed borderStrength scales neutral border lightness offsets around the canvas. Zero matches canvas RGB; negative reverses the foreground direction. Foreground-derived border a,b also pivot around the canvas. Alpha, clear borders, and accent borders are unchanged.",
    accent: "L = accent.L + amount; keep accent chroma and hue. Adjust the source color to change saturation or lightness.",
    onAccent: "Text on generated accent fills selects opaque black or white, whichever has higher WCAG contrast with the gamut-mapped sRGB accent background. This is independent of the primary foreground input.",
    info: "Info defaults to the accent source. Accent/foreground links add 0.08 OKLCH lightness, preserving hue and reducing chroma only when needed to fit sRGB. Custom uses the independent Info seed unchanged; linked modes retain that seed. The default linked mark stays within tolerance 3 of the captured native Info color.",
    source: "Use the resolved Info color or matching Warning/Error/change input directly for marks, labels and filled badges. Validation backgrounds/borders mix the canvas and source in OKLab. Diff/merge backgrounds use the selected change color with shared translucent opacities; normal diff replacements are removed plus inserted. Badge text chooses black/white by contrast. Syntax is generated independently.",
    alpha: "Fixed opacity; multiply non-opaque opacities by overlayOpacity and clamp to [0,1], except scrollbar/minimap thumbs and scrollbar shadows, which retain their distinct fixed opacities.",
    inlineCode: "Inline-code foreground starts at the accent hue, chroma and lightness. Reuse the accent-text contrast search to adjust lightness/gamut only as needed for 4.5:1 against the unchanged textPreformat background. Explicit null colors remain unresolved.",
    inactiveSelection: "Preserve generated RGB, including optional tint; reduce inactive-selection alpha only when needed for 4.5:1 primary/code text contrast after sRGB compositing on canvas. Test both encoded alpha and VS Code's two-decimal CSS alpha. If the canvas already fails, never reduce its existing contrast. Choose the highest safe 8-bit alpha at or below requested opacity. Other selection states and syntax colors remain unchanged by the guard.",
    personality: "Default-off switches: active text starts at Primary foreground lightness with the accent hue/chroma, limited to gamut. Chromatic accents bound that preferred lightness to 0.2-0.9 so nearly black/white primary text retains room for visible color; contrast may adjust it further. Gray accents retain Primary foreground. Native file decorations retain precedence. Nonsemantic opacity-controlled colors share a tint: L moves 65% toward accent L and C is min(accent.C * 0.65, 0.14), gamut-limited at the accent hue. Opaque selected/inactive-selection/activity/hover fills participate too, retaining their existing lightness. Neutral interaction fills cap painted chroma to the shared active-selection tint at the current Overlay opacity over their region backdrop, including native CSS alpha rounding and a floor for existing backdrop color. This prevents opaque/high-opacity inactive fills from becoming much more saturated than active ones; source alpha/lightness are preserved. The cap follows opacity changes without suppressing the stronger active tint. Scrollbar/minimap sliders, shadows and resize grips keep the quieter 35% tint. Accents below C 0.01 leave colors unchanged. Alpha remains exact except the existing inactive-selection safety cap; opaque surfaces stay opaque while their saturation cap follows active selection strength. Semantic severity/change/preserved colors keep their meaning. Resolved Neutral 7 optionally replaces all six bracket levels. Status fills use accent/resolved Color 2/quiet surface for native normal/debug/no-folder states; remote items remain separate.",
    clipping: "Clamp OKLab/OKLCH lightness to [0,1], then culori OKLCH-to-sRGB gamut mapping and 8-bit hex quantization."
  }
} as const;

export const lightModelDefinition = {
  ...modelDefinition,
  fitting: "Explicit Light 2026 anchors with light-specific shared families, opacities and selectors; no per-token numeric residuals.",
  fixedRuleCount: Object.keys(lightFamilies).length + Object.keys(lightOpacities).length + 2 + personalityFixedRuleCount,
  fixedNumericCoefficientCount: Object.keys(lightFamilies).length + Object.keys(lightOpacities).length + 2 + personalityFixedRuleCount,
  semanticSelectorCount: modelDefinition.semanticSelectorCount + lightSelectors.length + 1,
  semanticSelectorCountMeaning: `${modelDefinition.semanticSelectorCountMeaning} Light also keeps canvas-derived interaction fills at normal surface strength.`,
  infoLightnessLift: 0.02,
  families: lightFamilies,
  opacities: lightOpacities,
  selectors: [...severitySelectors, ...changeSelectors, ...lightSelectors, ...selectors]
    .map(({ pattern, ...assignment }) => ({ pattern: pattern.toString(), ...assignment })),
  formulas: {
    ...modelDefinition.formulas,
    background: "Structural layers use L = background.L + sign(foreground.L - background.L) * amount * surfaceSpread; keep background a,b. Light selection, active and hover fills use surfaceSpread 1, independent of signed structural separation, so inverted layers do not erase state cues and large separation does not over-darken them. Borders and accent/status backgrounds remain independent.",
    info: "Linked Info adds 0.02 OKLCH lightness to the Light accent/foreground, preserving hue and limiting chroma only for sRGB. Custom stays unchanged.",
    accent: "Light-specific accent offsets keep links/focus at the accent and darken button hover instead of brightening it.",
    source: "Use the resolved severity/change source. Light validation backgrounds use a quieter 0.08 canvas/source mix and borders use the source directly. Diff word opacity is 0.15 in Light; other change semantics remain shared."
  }
} as const;

export const modelDefinitions = { dark: modelDefinition, light: lightModelDefinition };

export function opacityFor(mode: ThemeMode, name: OpacityName): number {
  const values: Partial<Record<OpacityName, number>> = modelDefinitions[mode].opacities;
  const value = values[name];
  if (value === undefined) throw new Error(`No ${mode} opacity is defined for ${name}.`);
  return value;
}
