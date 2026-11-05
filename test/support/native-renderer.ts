import { requireRecord, requireString } from "../../src/shared/validation";
import type { SyntaxLine as NativeLine, SyntaxRun as NativeRun } from "../../src/syntax/evaluation";
export type { SyntaxLine as NativeLine } from "../../src/syntax/evaluation";

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface NativeDiffBackgrounds {
  addedLine: string[];
  deletedLine: string[];
  addedText: string[];
  deletedText: string[];
}

export interface NativeUiColors {
  colors: Record<string, string>;
  editorFocused: boolean;
  selectionPaint: string[];
}

export interface NativePersonalityPaint {
  tabForeground: string;
  tabDirty: boolean;
  tabCloseIcon: string;
  statusForeground: string;
  statusBackground: string;
  workbenchClasses: string;
}

export interface NativeInteractionPaint {
  inactiveListBackground: string;
  listFocused: boolean;
  activityBackgrounds: string[];
  scrollbarBackground: string;
}

export type NativeTextPaint = {
  foreground: string;
  background: string;
} & ({ kind: "suggestion"; iconForeground: string; highlightForeground: string } | { kind: "inlineCode" });

export interface NativeIconPaint {
  viewportWidth: number;
  mode: string;
  iconNames: string[];
  errors: string[];
  controls: {
    infoSource: string;
    infoColor: string;
    infoHex: string;
    paletteMode: string;
    visibleSeeds: string[];
    resetVisible: boolean;
    applyDisabled: boolean;
    workspaceApplyDisabled: boolean;
    anchorColumns: number;
    codeForeground: string;
    inlineCodeForeground: string;
    statusText: string;
    evaluationHidden: boolean;
    evaluationRows: number;
    accentActiveItems: boolean;
    activeTabForeground: string;
  };
}

interface NativeWebviewAction {
  id: string;
  event: "click" | "input" | "change";
  value?: string;
}

function readThemerIcons(request: { mode?: string; action?: NativeWebviewAction }) {
  const documents = [document];
  let app: HTMLElement | null = null;
  for (const current of documents) {
    const candidate = current.querySelector<HTMLElement>("#app");
    if (candidate?.querySelector("#workspace-menu-button")) {
      app = candidate;
      break;
    }
    for (const frame of current.querySelectorAll<HTMLIFrameElement>("iframe")) {
      if (frame.contentDocument) documents.push(frame.contentDocument);
    }
  }
  const view = app?.ownerDocument.defaultView;
  const menu = app?.querySelector<HTMLButtonElement>("#workspace-menu-button");
  const selectedMode = app?.querySelector<HTMLInputElement>('input[name="theme-mode"]:checked');
  if (!app || !view || !menu || menu.disabled || !selectedMode) return null;
  if (request.mode && selectedMode.value !== request.mode) {
    const next = app.querySelector<HTMLInputElement>(`input[name="theme-mode"][value="${request.mode}"]`);
    if (!next || next.disabled) return null;
    next.checked = true;
    next.dispatchEvent(new Event("change", { bubbles: true }));
    return null;
  }
  const advanced = app.querySelector<HTMLDetailsElement>("#ui-advanced");
  if (advanced) advanced.open = true;
  const personality = app.querySelector<HTMLDetailsElement>("#personality-options");
  if (personality) personality.open = true;
  if (request.action) {
    const { id, event, value } = request.action;
    const control = app.querySelector<HTMLInputElement | HTMLButtonElement>(`#${CSS.escape(id)}`);
    if (!control || control.disabled || !control.checkVisibility()) throw new Error(`Cannot interact with Themer control ${id}.`);
    control.focus();
    if (event === "click") {
      control.click();
    } else {
      if (control.tagName !== "INPUT") throw new Error(`Themer control ${id} is not an input.`);
      if (value !== undefined) control.value = value;
      control.dispatchEvent(new Event(event, { bubbles: true }));
    }
  }
  const infoPicker = app.querySelector<HTMLInputElement>("#info-picker");
  const infoHex = app.querySelector<HTMLInputElement>("#info-hex");
  const infoSource = app.querySelector<HTMLInputElement>('input[name="info-source"]:checked');
  const paletteMode = app.querySelector<HTMLInputElement>('input[name="syntax-palette-mode"]:checked');
  const reset = app.querySelector<HTMLButtonElement>("#reset-syntax-palette");
  if (!infoPicker || !infoHex || !infoSource || !paletteMode || !reset) return null;
  const errors: string[] = [];
  const icons = [...app.querySelectorAll<SVGSVGElement>("svg.codicon")];
  for (const icon of icons) {
    if (icon.getAttribute("aria-hidden") !== "true" || icon.getAttribute("focusable") !== "false" ||
        icon.getAttribute("fill") !== "currentColor" || icon.querySelector("text,image,use,script")) {
      errors.push(`Invalid decorative product-icon markup: ${icon.classList.value}`);
    }
    if (!icon.checkVisibility()) continue;
    const bounds = icon.getBBox();
    const viewBox = icon.viewBox.baseVal;
    if (bounds.x < viewBox.x || bounds.y < viewBox.y ||
        bounds.x + bounds.width > viewBox.x + viewBox.width ||
        bounds.y + bounds.height > viewBox.y + viewBox.height) {
      errors.push(`Clipped product artwork: ${icon.classList.value}`);
    }
    if (![12, 14, 16].includes(icon.getBoundingClientRect().width)) {
      errors.push(`Unexpected rendered icon width: ${icon.classList.value}`);
    }
  }
  const ellipsis = menu.querySelector<SVGSVGElement>(".codicon-ellipsis");
  if (menu.textContent?.trim() || !ellipsis || menu.getAttribute("aria-label") !== "More theme actions") {
    errors.push("Overflow must retain its accessible name and use a product icon, not text.");
  } else {
    const button = menu.getBoundingClientRect();
    const icon = ellipsis.getBoundingClientRect();
    if (Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2) > 0.5 ||
        Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2) > 0.5) {
      errors.push("Overflow product icon is not centered.");
    }
  }
  if (/[●⌄◈◇⑂]/.test(app.textContent ?? "")) errors.push("A text-based icon remains.");
  if (app.ownerDocument.documentElement.scrollWidth > view.innerWidth) errors.push("The webview overflows horizontally.");
  if (infoPicker.disabled || infoHex.disabled) errors.push("Info inputs must stay enabled in every source mode.");
  const sourceGroup = infoSource.closest<HTMLElement>(".info-source-options");
  if (!sourceGroup || sourceGroup.getBoundingClientRect().top < infoHex.getBoundingClientRect().bottom) {
    errors.push("Info source radios must sit below the color input.");
  }
  const severityGrid = infoPicker.closest<HTMLElement>(".grid-three");
  if (severityGrid && view.getComputedStyle(severityGrid).gridTemplateColumns.split(" ").length === 3) {
    for (const id of ["warning-hex", "error-hex"]) {
      const input = app.querySelector<HTMLInputElement>(`#${id}`);
      if (!input || Math.abs(input.getBoundingClientRect().y - infoHex.getBoundingClientRect().y) > 1) {
        errors.push(`Info input at y=${infoHex.getBoundingClientRect().y} does not align with ${id} at y=${input?.getBoundingClientRect().y}.`);
      }
    }
  }
  if (reset.parentElement !== paletteMode.closest(".syntax-palette-options")) {
    errors.push("Reset palette must be beside the syntax selector.");
  }
  for (const label of app.querySelectorAll<HTMLElement>("#personality-controls .switch-label")) {
    const input = label.querySelector<HTMLInputElement>("input");
    const text = label.querySelector<HTMLElement>("span");
    const help = label.parentElement?.querySelector<HTMLElement>(".info-button");
    if (!input || !text || !help || label.firstElementChild !== input ||
        input.getBoundingClientRect().right > text.getBoundingClientRect().left ||
        text.getBoundingClientRect().right > help.getBoundingClientRect().left) {
      errors.push(`Personality must read switch, label, help: ${text?.textContent}.`);
    }
  }
  for (const key of ["autoChroma", "autoLightness"]) {
    const selected = app.querySelector<HTMLInputElement>(`input[name="syntax-${key}"]:checked`);
    const options = selected?.closest<HTMLElement>(".syntax-mode-options");
    const heading = options?.parentElement;
    const label = options?.querySelector<HTMLElement>(":scope > span");
    const group = options?.querySelector<HTMLElement>(".segmented-control");
    const help = options?.querySelector<HTMLElement>(".info-button");
    const output = heading?.querySelector<HTMLOutputElement>("output");
    const manual = app.querySelector<HTMLElement>(`#syntax-${key}-manual-controls`);
    const slider = manual?.querySelector<HTMLInputElement>('input[type="range"]');
    if (!selected || !heading || !label || !group || !help || !output || !manual || !slider) {
      errors.push(`Missing compact ${key} controls.`);
      continue;
    }
    const row = [label, group, help, output].map((element) => element.getBoundingClientRect());
    if (row.some((bounds, index) => index > 0 &&
        (bounds.left < row[index - 1]!.right - 1 ||
         Math.abs(bounds.y + bounds.height / 2 - row[0]!.y - row[0]!.height / 2) > 1))) {
      errors.push(`${key} must place label, modes, help and value on one line.`);
    }
    if (Math.abs(output.getBoundingClientRect().right - heading.getBoundingClientRect().right) > 1) {
      errors.push(`${key} value must align to the right of its row.`);
    }
    if (manual.checkVisibility() !== (selected.value === "manual")) {
      errors.push(`${key} slider visibility does not match Manual mode.`);
    }
    if (manual.querySelector("label,output,.info-control,.range-heading")) {
      errors.push(`${key} repeats its label, percentage or help above the slider.`);
    }
    if (!slider.getAttribute("aria-label") || !slider.getAttribute("aria-describedby") ||
        !output.htmlFor.contains(slider.id)) {
      errors.push(`${key} slider is missing its accessible label, help or output.`);
    }
    if (selected.value === "manual") {
      const bounds = slider.getBoundingClientRect();
      if (bounds.top < heading.getBoundingClientRect().bottom ||
          heading.parentElement!.getBoundingClientRect().height >
            heading.getBoundingClientRect().height + bounds.height + 7) {
        errors.push(`${key} Manual mode must occupy only the heading and slider lines: group=${heading.parentElement!.getBoundingClientRect().height}, heading=${heading.getBoundingClientRect().height}, slider=${bounds.height}, gap=${bounds.top - heading.getBoundingClientRect().bottom}.`);
      }
      if (output.value !== slider.getAttribute("aria-valuetext")) {
        errors.push(`${key} heading must show the slider's current percentage.`);
      }
    }
  }
  if (paletteMode.value === "anchored") {
    const anchor = app.querySelector<HTMLElement>("#syntax-blue-control");
    const label = app.querySelector<HTMLElement>("#syntax-blue-label");
    const picker = app.querySelector<HTMLInputElement>("#syntax-blue-picker");
    const hex = app.querySelector<HTMLInputElement>("#syntax-blue-hex");
    const heading = paletteMode.closest<HTMLElement>(".syntax-mode-heading");
    if (!anchor || !label || !picker || !hex || !heading || label.textContent !== "Anchor") {
      errors.push("Anchored mode must expose a labeled Anchor input.");
    } else {
      const controls = [label, picker, hex].map((element) => element.getBoundingClientRect());
      if (controls.some((bounds, index) => index > 0 &&
          (bounds.left < controls[index - 1]!.right ||
           Math.abs(bounds.y + bounds.height / 2 - controls[0]!.y - controls[0]!.height / 2) > 1))) {
        errors.push("Anchor label, picker and hex input must share one line.");
      }
      const panel = anchor.closest<HTMLElement>(".panel");
      if (panel && panel.clientWidth - parseFloat(view.getComputedStyle(panel).paddingInline) * 2 >= 480 &&
          Math.abs(anchor.getBoundingClientRect().y + anchor.getBoundingClientRect().height / 2 -
            heading.getBoundingClientRect().y - heading.getBoundingClientRect().height / 2) > 1) {
        errors.push("Anchor must sit to the right of the Syntax selector when there is room.");
      }
    }
  }
  for (const grid of app.querySelectorAll<HTMLElement>(".control-grid,.syntax-color-grid,.syntax-adjustments,.syntax-auto-palette,.sample-buttons")) {
    if (!grid.checkVisibility()) continue;
    const count = [...grid.children].filter((child) => child.checkVisibility()).length;
    const columns = view.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    if (count > 0 && count % columns !== 0) errors.push(`Incomplete control grid: ${grid.className} (${count}/${columns}).`);
  }
  for (const label of app.querySelectorAll<HTMLElement>(".segment > span")) {
    if (!label.checkVisibility()) continue;
    const range = label.ownerDocument.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const bounds = label.getBoundingClientRect();
    if (text.left < bounds.left - 1 || text.right > bounds.right + 1) {
      errors.push(`Segment label overflows: ${label.textContent?.trim()}.`);
    }
  }
  for (const row of app.querySelectorAll<HTMLElement>(".preview-list li")) {
    if (!row.checkVisibility()) continue;
    const text = [...row.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (!text) {
      errors.push("Preview navigation is missing its text label.");
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    if (range.getBoundingClientRect().right > row.getBoundingClientRect().right) {
      errors.push(`Preview navigation text overflows: ${text.textContent?.trim()}`);
    }
  }
  return {
    viewportWidth: view.innerWidth, mode: selectedMode.value,
    iconNames: [...new Set(icons.flatMap((icon) => [...icon.classList]
      .filter((name) => name.startsWith("codicon-")).map((name) => name.slice("codicon-".length))))].sort(),
    errors,
    controls: {
      infoSource: infoSource.value,
      infoColor: infoPicker.value.toLowerCase(),
      infoHex: infoHex.value.toLowerCase(),
      paletteMode: paletteMode.value,
      visibleSeeds: [...app.querySelectorAll<HTMLInputElement>("#syntax-seed-controls input[type=color]")]
        .filter((input) => input.checkVisibility()).map((input) => input.id.replace(/^syntax-|-picker$/g, "")),
      resetVisible: reset.checkVisibility(),
      applyDisabled: app.querySelector<HTMLButtonElement>("#apply-button")?.disabled,
      workspaceApplyDisabled: app.querySelector<HTMLButtonElement>("#apply-workspace-button")?.disabled,
      anchorColumns: severityGrid ? view.getComputedStyle(severityGrid).gridTemplateColumns.split(" ").length : 0,
      codeForeground: view.getComputedStyle(app.querySelector<HTMLElement>(".code-sample > code")!).color,
      inlineCodeForeground: view.getComputedStyle(app.querySelector<HTMLElement>(".preview-description code")!).color,
      statusText: app.querySelector("#status-text")?.textContent ?? "",
      evaluationHidden: app.querySelector<HTMLElement>("#evaluation-panel")?.hidden === true,
      evaluationRows: app.querySelectorAll("#contrast-checks > *, #color-roles > *").length,
      accentActiveItems: app.querySelector<HTMLInputElement>("#personality-accentActiveItems")?.checked,
      activeTabForeground: view.getComputedStyle(app.querySelector<HTMLElement>('.preview-tab[aria-selected="true"]')!).color
    }
  };
}

function readInlineCode() {
  const documents = [document];
  for (const current of documents) {
    const code = [...current.querySelectorAll<HTMLElement>("code")]
      .find((element) => element.checkVisibility() && element.textContent === "accentInlineCode");
    if (code) return {
      kind: "inlineCode", foreground: getComputedStyle(code).color, background: getComputedStyle(code).backgroundColor
    };
    for (const frame of current.querySelectorAll<HTMLIFrameElement>("iframe")) {
      if (frame.contentDocument) documents.push(frame.contentDocument);
    }
  }
  return null;
}

function readTextPaint(kind: "suggestion") {
  const row = [...document.querySelectorAll<HTMLElement>(".monaco-editor .suggest-widget .monaco-list-row.focused")]
    .find((element) => element.checkVisibility() && element.textContent?.includes("/skill-theme"));
  const icon = row?.querySelector<HTMLElement>(".codicon");
  const highlight = row?.querySelector<HTMLElement>(".monaco-highlighted-label .highlight");
  if (!row || !icon || !highlight) return null;
  return {
    kind, foreground: getComputedStyle(row).color, background: getComputedStyle(row).backgroundColor,
    iconForeground: getComputedStyle(icon).color, highlightForeground: getComputedStyle(highlight).color
  };
}

function readInteractionPaint() {
  const row = [...document.querySelectorAll<HTMLElement>(".explorer-folders-view .monaco-list-row.selected")]
    .find((element) => element.checkVisibility() && element.textContent?.includes("selection-preview.txt"));
  const activity = document.querySelector<HTMLElement>(".activitybar .action-item.checked");
  const scrollbar = [...document.querySelectorAll<HTMLElement>(".part.editor .monaco-editor .scrollbar.vertical .slider")]
    .find((element) => element.checkVisibility() && element.offsetWidth > 0 && element.offsetHeight > 0);
  if (!row || !activity || !scrollbar) return null;
  return {
    inactiveListBackground: getComputedStyle(row).backgroundColor,
    listFocused: row.closest(".monaco-list")?.contains(document.activeElement) ?? false,
    activityBackgrounds: [...new Set([activity, ...activity.querySelectorAll<HTMLElement>(".active-item-indicator, .action-label")]
      .filter((element) => element.checkVisibility() && element.offsetWidth > 0 && element.offsetHeight > 0)
      .map((element) => getComputedStyle(element).backgroundColor))],
    scrollbarBackground: getComputedStyle(scrollbar).backgroundColor
  };
}

function readPersonalityPaint() {
  const workbench = document.querySelector<HTMLElement>(".monaco-workbench");
  const tab = document.querySelector<HTMLElement>(".part.editor .tab.active");
  const label = tab?.querySelector<HTMLElement>(".label-name");
  const close = tab?.querySelector<HTMLElement>(".tab-actions .action-label");
  const status = document.querySelector<HTMLElement>(".part.statusbar");
  if (!workbench || !tab || !label || !status) return null;
  return {
    tabForeground: getComputedStyle(label).color,
    tabDirty: tab.classList.contains("dirty"),
    tabCloseIcon: close ? `${close.className}/${getComputedStyle(close, "::before").content}` : "",
    statusForeground: getComputedStyle(status).color,
    statusBackground: getComputedStyle(status).backgroundColor,
    workbenchClasses: workbench.className
  };
}

function readUiColors(extraIds: string[] = []) {
  const workbench = document.querySelector<HTMLElement>(".monaco-workbench");
  const editor = [...document.querySelectorAll<HTMLElement>(".part.editor .monaco-editor")]
    .find((element) => element.checkVisibility({ checkVisibilityCSS: true }) && element.offsetWidth > 0);
  if (!workbench || !editor) return null;
  const style = getComputedStyle(workbench);
  const ids = [
    "statusBarItem.prominentBackground", "statusBarItem.prominentForeground",
    "statusBarItem.prominentHoverBackground", "statusBarItem.prominentHoverForeground",
    "chat.linesAddedForeground", "chat.linesRemovedForeground",
    "foreground", "editor.foreground", "editor.background", "editor.inactiveSelectionBackground",
    "editor.selectionHighlightBackground", "button.background", "button.foreground", "button.hoverBackground",
    ...extraIds
  ];
  return {
    colors: Object.fromEntries(ids.map((id) => [id, style.getPropertyValue(`--vscode-${id.replaceAll(".", "-")}`).trim()])),
    editorFocused: editor.classList.contains("focused"),
    focusDiagnostic: {
      documentFocused: document.hasFocus(),
      activeElement: document.activeElement?.outerHTML.slice(0, 350),
      quickInputVisible: [...document.querySelectorAll<HTMLElement>(".quick-input-widget")].some((element) => element.checkVisibility())
    },
    selectionPaint: [...new Set([...editor.querySelectorAll<HTMLElement>(".selected-text")]
      .map((element) => getComputedStyle(element).backgroundColor))]
  };
}

function readStickyScrollPaint() {
  const widget = [...document.querySelectorAll<HTMLElement>(".part.editor .monaco-editor .sticky-widget")]
    .find((element) => element.checkVisibility() && element.offsetHeight > 0);
  const content = widget?.querySelector<HTMLElement>(".sticky-widget-lines-scrollable");
  const gutter = widget?.querySelector<HTMLElement>(".sticky-widget-line-numbers");
  if (!content?.textContent?.trim() || !gutter) return null;
  return {
    background: getComputedStyle(content).backgroundColor,
    gutterBackground: getComputedStyle(gutter).backgroundColor
  };
}

function readDiffBackgrounds() {
  const editor = [...document.querySelectorAll<HTMLElement>(".monaco-diff-editor")]
    .find((element) => element.checkVisibility({ checkVisibilityCSS: true }) && element.offsetWidth > 0);
  if (!editor) return null;
  const colors = (selector: string) => [...new Set([...editor.querySelectorAll(selector)]
    .map((element) => getComputedStyle(element).backgroundColor))].sort();
  return {
    addedLine: colors(".line-insert"),
    deletedLine: colors(".line-delete"),
    addedText: colors(".char-insert"),
    deletedText: colors(".char-delete")
  };
}

function readBracketGuides() {
  const editor = [...document.querySelectorAll<HTMLElement>(".part.editor .monaco-editor")]
    .find((element) => element.checkVisibility({ checkVisibilityCSS: true }) && element.offsetWidth > 0);
  if (!editor) return null;
  const guides = [...editor.querySelectorAll<HTMLElement>(".bracket-indent-guide")];
  const colors = guides.flatMap((guide) => {
    const result: string[] = [];
    for (const style of [getComputedStyle(guide), getComputedStyle(guide, "::before"), getComputedStyle(guide, "::after")]) {
      if (parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle !== "none") result.push(style.borderLeftColor);
      if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none") result.push(style.borderTopColor);
      result.push(...style.boxShadow.match(/rgba?\([^)]+\)/g) ?? []);
    }
    return result;
  });
  return { colors: [...new Set(colors)].sort(), classes: [...new Set(guides.map((guide) => guide.className))].slice(0, 12) };
}

function readEditor(allowAlpha = false) {
  const editors = [...document.querySelectorAll<HTMLElement>(".part.editor .monaco-editor")]
    .filter((editor) => editor.checkVisibility({ checkVisibilityCSS: true }) && editor.offsetWidth > 0 && editor.offsetHeight > 0);
  if (editors.length !== 1) {
    return {
      ready: false,
      reason: `Expected one visible document editor, found ${editors.length}: ` +
        editors.map((editor) => editor.getAttribute("data-uri") ?? editor.getAttribute("aria-label") ?? editor.className).join("; ")
    };
  }
  const editor = editors[0];
  if (!editor) throw new Error("The visible editor disappeared.");
  const rows = [...editor.querySelectorAll<HTMLElement>(".view-lines .view-line")]
    .sort((left, right) => parseFloat(left.style.top) - parseFloat(right.style.top));
  const lines = rows.map((row) => {
    let text = "";
    const runs: NativeRun[] = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (!parent) throw new Error("An editor text node has no styled parent.");
      const value = (node.textContent ?? "").replaceAll("\u00a0", " ").replaceAll("\u200b", "");
      if (value.length > 0) {
        const css = getComputedStyle(parent).color;
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css);
        if (!match || (!allowAlpha && match[4] !== undefined && Number(match[4]) !== 1)) {
          throw new Error(`Expected opaque native RGB text, received ${css}.`);
        }
        const alpha = Math.round(Number(match[4] ?? 1) * 255);
        const color = `#${match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}` +
          (alpha === 255 ? "" : alpha.toString(16).padStart(2, "0"));
        const previous = runs.at(-1);
        if (previous?.color === color) {
          previous.end += value.length;
        } else {
          runs.push({ start: text.length, end: text.length + value.length, color });
        }
        text += value;
      }
      node = walker.nextNode();
    }
    return { text, runs };
  });
  return { ready: true, lines, viewport: { height: window.innerHeight, editorHeight: editor.clientHeight } };
}

export function expandTabs(value: string): string {
  let expanded = "";
  for (const character of value) {
    expanded += character === "\t" ? " ".repeat(4 - expanded.length % 4) : character;
  }
  return expanded;
}

export class NativeRenderer {
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly webviewSessions = new Map<string, string>();
  private webviewTargets = "";

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      try {
        if (typeof event.data !== "string") throw new Error("Unexpected binary debugging response.");
        const message = requireRecord(JSON.parse(event.data), "Debugging response");
        if (typeof message.id !== "number") return;
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error !== undefined) {
          request.reject(new Error(`Native renderer request failed: ${JSON.stringify(message.error)}`));
        } else {
          request.resolve(message.result);
        }
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.addEventListener("close", () => this.fail(new Error("The native renderer debugging connection closed.")));
    socket.addEventListener("error", () => this.fail(new Error("The native renderer debugging connection failed.")));
  }

  static async connect(port: number): Promise<NativeRenderer> {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
      throw new Error("A valid isolated renderer debugging port is required.");
    }
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Cannot discover the native renderer: HTTP ${response.status}.`);
    const targets: unknown = await response.json();
    if (!Array.isArray(targets)) throw new Error("Native debugging targets must be an array.");
    const target = targets.map((value) => requireRecord(value, "Debugging target"))
      .find((value) => value.type === "page" && typeof value.url === "string" && value.url.includes("workbench"));
    if (!target) throw new Error("The isolated VS Code workbench debugging target was not found.");
    const url = requireString(target.webSocketDebuggerUrl, "Workbench debugging URL");
    if (!url.startsWith(`ws://127.0.0.1:${port}/`)) throw new Error("Refusing a non-loopback workbench debugging target.");
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to the native renderer."));
      }, 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Cannot connect to the native renderer."));
      }, { once: true });
    });
    return new NativeRenderer(socket);
  }

  close(): void {
    this.fail(new Error("Native renderer capture ended."));
    this.socket.close();
  }

  async focusWindow(): Promise<void> {
    await this.request("Page.bringToFront", {});
  }

  async snapshot(expected: string[], allowAlpha = false): Promise<NativeLine[]> {
    await this.request("Emulation.setDeviceMetricsOverride", {
      width: 2000,
      height: 3000,
      deviceScaleFactor: 1,
      mobile: false
    });
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    let reason = "The editor has not rendered.";
    while (Date.now() < deadline) {
      const frame = requireRecord(await this.inspect(readEditor, allowAlpha), "Native editor snapshot");
      if (frame.ready === true && Array.isArray(frame.lines)) {
        const lines = frame.lines.map((value): NativeLine => {
          const line = requireRecord(value, "Native line");
          if (typeof line.text !== "string" || !Array.isArray(line.runs)) throw new Error("Invalid native line.");
          return {
            text: line.text,
            runs: line.runs.map((value): NativeRun => {
              const run = requireRecord(value, "Native color run");
              if (typeof run.start !== "number" || typeof run.end !== "number" ||
                typeof run.color !== "string" || !(allowAlpha ? /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/ : /^#[0-9a-f]{6}$/).test(run.color)) {
                throw new Error("Invalid native color run.");
              }
              return { start: run.start, end: run.end, color: run.color };
            })
          };
        });
        const mismatch = lines.findIndex((line, index) => line.text.trimEnd() !== expected[index]?.trimEnd());
        if (lines.length === expected.length && mismatch === -1) {
          const encoded = JSON.stringify(lines);
          stable = encoded === previous ? stable + 1 : 0;
          previous = encoded;
          if (stable >= 4) return lines;
          reason = "Native token colors are still settling.";
        } else {
          reason = `Expected ${expected.length} complete lines, saw ${lines.length}; first text mismatch at line ${mismatch + 1}: ` +
            `${JSON.stringify(lines[mismatch]?.text)} versus ${JSON.stringify(expected[mismatch])}; viewport ${JSON.stringify(frame.viewport)}.`;
        }
      } else {
        reason = String(frame.reason);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out capturing all native editor text. ${reason}`);
  }

  async diffBackgrounds(): Promise<NativeDiffBackgrounds> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspect(readDiffBackgrounds);
      if (value !== null) {
        const frame = requireRecord(value, "Native diff backgrounds");
        const colors = (key: string): string[] => {
          const values = frame[key];
          if (!Array.isArray(values) || !values.every((value): value is string => typeof value === "string")) {
            throw new Error(`Invalid native diff background ${key}.`);
          }
          return values;
        };
        const result = {
          addedLine: colors("addedLine"), deletedLine: colors("deletedLine"),
          addedText: colors("addedText"), deletedText: colors("deletedText")
        };
        if (Object.values(result).every((values) => values.length > 0)) {
          const encoded = JSON.stringify(result);
          stable = encoded === previous ? stable + 1 : 0;
          previous = encoded;
          if (stable >= 4) return result;
        } else previous = JSON.stringify(result);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual diff backgrounds: ${previous}`);
  }

  async bracketGuides(): Promise<string[]> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspect(readBracketGuides);
      if (value !== null) {
        const frame = requireRecord(value, "Native bracket guides");
        if (!Array.isArray(frame.colors) || !frame.colors.every((color): color is string => typeof color === "string")) {
          throw new Error("The native bracket-guide colors are invalid.");
        }
        const encoded = JSON.stringify(frame);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4 && frame.colors.length > 0) return frame.colors;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual bracket-guide borders: ${previous}`);
  }

  async personalityPaint(matches: (paint: NativePersonalityPaint) => boolean = () => true): Promise<NativePersonalityPaint> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspect(readPersonalityPaint);
      if (value !== null) {
        const frame = requireRecord(value, "Native personality paint");
        if (typeof frame.tabDirty !== "boolean" || typeof frame.tabCloseIcon !== "string") {
          throw new Error("The native tab dirty state is invalid.");
        }
        const result: NativePersonalityPaint = {
          tabForeground: requireString(frame.tabForeground, "Native active tab foreground"),
          tabDirty: frame.tabDirty, tabCloseIcon: frame.tabCloseIcon,
          statusForeground: requireString(frame.statusForeground, "Native status foreground"),
          statusBackground: requireString(frame.statusBackground, "Native status background"),
          workbenchClasses: requireString(frame.workbenchClasses, "Native workbench classes")
        };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4 && matches(result)) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading native active-tab/status paint: ${previous}`);
  }

  async interactionPaint(): Promise<NativeInteractionPaint> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspect(readInteractionPaint);
      if (value !== null) {
        const frame = requireRecord(value, "Native interaction paint");
        if (typeof frame.listFocused !== "boolean" || !Array.isArray(frame.activityBackgrounds) ||
            !frame.activityBackgrounds.every((color): color is string => typeof color === "string")) {
          throw new Error("Native inactive-list/activity paint is invalid.");
        }
        const result: NativeInteractionPaint = {
          inactiveListBackground: requireString(frame.inactiveListBackground, "Native inactive selected row"),
          listFocused: frame.listFocused,
          activityBackgrounds: frame.activityBackgrounds,
          scrollbarBackground: requireString(frame.scrollbarBackground, "Native scrollbar thumb")
        };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual inactive-list/activity/scrollbar paint: ${previous}`);
  }

  async uiColors(extraIds: string[] = [], expectedEditorFocus?: boolean): Promise<NativeUiColors> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    let focusDiagnostic = "";
    while (Date.now() < deadline) {
      const value = await this.inspect(readUiColors, extraIds);
      if (value !== null) {
        const frame = requireRecord(value, "Native UI colors");
        focusDiagnostic = JSON.stringify(frame.focusDiagnostic);
        const colors = requireRecord(frame.colors, "Native theme variables");
        if (typeof frame.editorFocused !== "boolean" || !Array.isArray(frame.selectionPaint) ||
          !frame.selectionPaint.every((color): color is string => typeof color === "string")) {
          throw new Error("The native selection frame is invalid.");
        }
        const result: NativeUiColors = {
          colors: Object.fromEntries(Object.entries(colors).map(([id, value]) => [id, requireString(value, `Native ${id}`)])),
          editorFocused: frame.editorFocused,
          selectionPaint: frame.selectionPaint
        };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4 && result.selectionPaint.length > 0 &&
            (expectedEditorFocus === undefined || result.editorFocused === expectedEditorFocus)) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual UI variables and selection paint: ${previous}; focus: ${focusDiagnostic}`);
  }

  async stickyScrollPaint(): Promise<{ background: string; gutterBackground: string }> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspect(readStickyScrollPaint);
      if (value !== null) {
        const frame = requireRecord(value, "Native sticky-scroll paint");
        const result = {
          background: requireString(frame.background, "Native sticky-scroll background"),
          gutterBackground: requireString(frame.gutterBackground, "Native sticky-scroll gutter")
        };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual sticky-scroll paint: ${previous}`);
  }

  async textPaint(kind: NativeTextPaint["kind"]): Promise<NativeTextPaint> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = kind === "inlineCode"
        ? await this.inspectWebviews(readInlineCode) : await this.inspect(readTextPaint, kind);
      if (value !== null) {
        const frame = requireRecord(value, "Native text paint");
        if (frame.kind !== kind) throw new Error(`Expected native ${kind} text paint.`);
        const colors = {
          foreground: requireString(frame.foreground, "Native text foreground"),
          background: requireString(frame.background, "Native text background")
        };
        const result: NativeTextPaint = kind === "suggestion" ? {
          ...colors, kind,
          iconForeground: requireString(frame.iconForeground, "Native suggestion icon"),
          highlightForeground: requireString(frame.highlightForeground, "Native suggestion match highlight")
        } : { ...colors, kind };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading actual native ${kind} text paint: ${previous}; webviews: ${this.webviewTargets}`);
  }

  async webviewIcons(width: number, mode: string): Promise<NativeIconPaint> {
    const deadline = Date.now() + 15_000;
    let previous = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const value = await this.inspectWebviews(readThemerIcons, { mode });
      if (value !== null) {
        const frame = requireRecord(value, "Native Themer icons");
        if (typeof frame.viewportWidth !== "number" || !Number.isFinite(frame.viewportWidth) ||
            !Array.isArray(frame.iconNames) || !frame.iconNames.every((name): name is string => typeof name === "string") ||
            !Array.isArray(frame.errors) || !frame.errors.every((error): error is string => typeof error === "string")) {
          throw new Error("Invalid native product-icon geometry.");
        }
        if (frame.viewportWidth !== width) {
          const current = await this.inspect(() => innerWidth);
          if (typeof current !== "number") throw new Error("Invalid native workbench width.");
          await this.request("Emulation.setDeviceMetricsOverride", {
            width: current + width - frame.viewportWidth, height: 1600, deviceScaleFactor: 1, mobile: false
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        const controls = requireRecord(frame.controls, "Native Themer controls");
        if (!Array.isArray(controls.visibleSeeds) || !controls.visibleSeeds.every((seed): seed is string => typeof seed === "string") ||
            typeof controls.resetVisible !== "boolean" || typeof controls.applyDisabled !== "boolean" ||
            typeof controls.workspaceApplyDisabled !== "boolean" || typeof controls.anchorColumns !== "number" ||
            typeof controls.evaluationHidden !== "boolean" || typeof controls.evaluationRows !== "number" ||
            typeof controls.accentActiveItems !== "boolean") {
          throw new Error("Invalid native syntax or apply control state.");
        }
        const result: NativeIconPaint = {
          viewportWidth: frame.viewportWidth, mode: requireString(frame.mode, "Native Themer mode"),
          iconNames: frame.iconNames, errors: frame.errors,
          controls: {
            infoSource: requireString(controls.infoSource, "Native Info source"),
            infoColor: requireString(controls.infoColor, "Native Info picker"),
            infoHex: requireString(controls.infoHex, "Native Info hex input"),
            paletteMode: requireString(controls.paletteMode, "Native syntax palette mode"),
            visibleSeeds: controls.visibleSeeds, resetVisible: controls.resetVisible,
            applyDisabled: controls.applyDisabled, workspaceApplyDisabled: controls.workspaceApplyDisabled,
            anchorColumns: controls.anchorColumns,
            codeForeground: requireString(controls.codeForeground, "Native preview code foreground"),
            inlineCodeForeground: requireString(controls.inlineCodeForeground, "Native preview inline-code foreground"),
            statusText: requireString(controls.statusText, "Native command status"),
            evaluationHidden: controls.evaluationHidden, evaluationRows: controls.evaluationRows,
            accentActiveItems: controls.accentActiveItems,
            activeTabForeground: requireString(controls.activeTabForeground, "Native preview active-tab foreground")
          }
        };
        const encoded = JSON.stringify(result);
        stable = encoded === previous ? stable + 1 : 0;
        previous = encoded;
        if (stable >= 4 && result.mode === mode) return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out reading native Themer icons at width ${width}: ${previous}`);
  }

  async webviewControl(action: NativeWebviewAction): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const value = await this.inspectWebviews(readThemerIcons, { action });
      if (value !== null) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out interacting with native Themer control ${action.id}.`);
  }

  private async inspectWebviews<T>(read: (argument: T) => unknown, argument?: T): Promise<unknown> {
    const discovery = requireRecord(await this.request("Target.getTargets", {}), "Native target discovery");
    if (!Array.isArray(discovery.targetInfos)) throw new Error("Native targets must be an array.");
    const targets = discovery.targetInfos.map((target) => requireRecord(target, "Native target"))
      .filter((target) => (target.type === "iframe" || target.type === "page") &&
        typeof target.url === "string" && target.url.includes("vscode-webview"));
    this.webviewTargets = JSON.stringify(targets.map(({ type, url }) => ({ type, url })));
    for (const target of targets) {
      const id = requireString(target.targetId, "Native webview target ID");
      let session = this.webviewSessions.get(id);
      if (!session) {
        const attached = requireRecord(await this.request("Target.attachToTarget", {
          targetId: id, flatten: true
        }), "Native webview session");
        session = requireString(attached.sessionId, "Native webview session ID");
        this.webviewSessions.set(id, session);
      }
      const value = await this.inspect(read, argument, session);
      if (value !== null) return value;
    }
    return null;
  }

  private async inspect<T>(read: (argument: T) => unknown, argument?: T, sessionId?: string): Promise<unknown> {
    const result = requireRecord(await this.request("Runtime.evaluate", {
      expression: `(${read.toString()})(${argument === undefined ? "" : JSON.stringify(argument)})`,
      returnByValue: true
    }, sessionId), "Native evaluation");
    if (result.exceptionDetails !== undefined) {
      throw new Error(`Cannot inspect native editor colors: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return requireRecord(result.result, "Native evaluation result").value;
  }

  private request(method: string, params: Record<string, unknown>, sessionId?: string): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for native renderer command ${method}.`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  private fail(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
