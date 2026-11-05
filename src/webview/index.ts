import { evaluatePalette, getDefaultParameters } from "../model/index";
import { controls, modelDefinitions } from "../model/rules";
import { reference, references } from "../shared/reference";
import {
  AppState,
  ClientMessage,
  ColorParameter,
  ColorRole,
  HostMessage,
  PersonalityToggle,
  SampleLanguage,
  SyntaxAdjustmentParameter,
  SyntaxFamily,
  SyntaxNumericParameter,
  ThemeDraft,
  ThemeMode,
  ThemeParameters,
  colorParameterKeys,
  changeParameters,
  infoSources,
  numericParameterLimits,
  personalityKeys,
  severityParameters,
  syntaxFamilies,
  syntaxAdjustmentModes,
  syntaxPaletteModes,
  themeModes,
  syntaxNumericParameterLimits
} from "../shared/types";
import { isRecord, isThemeColor, parseParameters, parseSyntaxParameters, parseThemeMode, requireRecord } from "../shared/validation";
import { getSyntaxModel, getDefaultSyntaxParameters, getSyntaxAnchors, resetSyntaxGroup, setSyntaxAdjustmentMode, setSyntaxPaletteMode, setSyntaxSeed, syntaxFamilyDescriptions, syntaxFamilyLabels, syntaxFamilySourceColors, syntaxPreviewColors } from "../syntax";
import { unexpectedBracketId } from "../syntax/brackets";
import { generateTheme } from "../theme";
import { infoMarkup, initializePopovers } from "./popovers";
import { iconMarkup } from "./icons";

interface VsCodeApi {
  postMessage(message: ClientMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type Anchor = ColorParameter;
type NumericParameter = keyof typeof numericParameterLimits;

const anchors: readonly Anchor[] = colorParameterKeys;
const colorLabels: Record<ColorParameter, string> = {
  background: "Canvas background",
  foreground: "Primary foreground",
  accent: "Interaction accent",
  info: "Info",
  warning: "Warning",
  error: "Error",
  added: "Added",
  deleted: "Deleted",
  modified: "Modified"
};
const autoLightnessDescription = "Code and brackets follow Primary foreground lightness. Comments follow generated muted text and Muted text contrast. Bright anchors gently roll off to a maximum OKLCH lightness of 0.85, so white UI text does not wash out syntax colors.";
const autoChromaDescription = "Auto gently follows accent chroma within -25% to +25%. Manual captures the current result and reveals the slider. Off clears the boost without removing the palette's own color.";
const syntaxModeControls: {
  key: "autoChroma" | "autoLightness"; parameter: SyntaxAdjustmentParameter; slider: SyntaxNumericParameter;
  label: string; description: string; sliderDescription: string;
}[] = [
  {
    key: "autoChroma", parameter: "chromaMode", slider: "chromaBoost", label: "Chroma", description: autoChromaDescription,
    sliderDescription: "Manual: -100% removes color, 0% preserves the palette, and +100% uses each shade's own maximum displayable chroma. Hue and lightness stay unchanged. Color 7 follows reductions only; true grays stay gray."
  },
  {
    key: "autoLightness", parameter: "lightnessMode", slider: "lightnessShift", label: "Lightness", description: autoLightnessDescription,
    sliderDescription: "Manual: -100% moves every shade to black, 0% preserves its starting lightness, and +100% moves it to white. Intermediate values retain brightness ordering. Chroma may decrease near black or white; hue stays unchanged."
  }
];
const syntaxPaletteDescription = "Auto links Color 1 to Interaction accent hue and rotates Colors 1-6 together. Anchored starts from the current Color 1 and lets you choose its hue, chroma, and brightness independently of the UI accent. The other five colors follow that anchor; Neutral and Comments still follow Primary foreground and muted text. Manual captures the current seeds for individual editing without a visible jump.";
const numericControls: {
  key: NumericParameter;
  label: string;
  description: string;
}[] = [
  { key: "surfaceSpread", label: "Surface separation", description: "-3 to +3. Positive values move canvas-derived layers toward the foreground; 0 flattens them; negative values invert their order. Light-mode selection and active/hover fills keep their normal strength so they do not disappear or become too dark. Borders and accent/status backgrounds stay independent. Structural layers can clip to black or white at extremes." },
  { key: "mutedContrast", label: "Muted text contrast", description: "Strength of secondary foreground colors." },
  { key: "borderStrength", label: "Border definition", description: "0 matches canvas RGB. Positive values move neutral borders toward the foreground; negative values reverse this (darker in a dark theme). Transparency is unchanged; extremes can clip to black or white." },
  { key: "overlayOpacity", label: "Overlay opacity", description: "Opacity of translucent modeled colors, including selections, hover fills, some borders/text, and semantic diff colors. Scrollbar/minimap thumbs and scrollbar shadows keep their distinct fixed opacities so content underneath remains visible. Tinted opaque interaction fills stay opaque, but their saturation cap follows active selection strength so the tints stay coordinated. Severity/change hues stay independent. Inactive editor selections may be capped for readability." }
];
const personalityControls: { key: PersonalityToggle; label: string; description: string }[] = [
  { key: "accentActiveItems", label: "Accent active items", description: "Active tabs, activity icons, panel titles and selected menu/list items use the accent hue at Primary foreground lightness. Near black or white, brightness is bounded to keep visible color. Contrast may adjust lightness; solid accent fills keep readable text. Gray accents retain Primary foreground. Native Git/problem decorations take priority when enabled in VS Code. Unsaved dots and modified-tab borders remain native. Covers classic and Modern UI." },
  { key: "tintNeutralOverlays", label: "Tint overlays", description: "Accent-tints nonsemantic translucent colors plus selected/inactive list, terminal, tab and activity-bar fills in classic and Modern UI. Interaction fills cap visible chroma against the shared active-selection tint at the current Overlay opacity after compositing, so opaque inactive selections do not look much more saturated. Their lightness and alpha stay unchanged. Scrollbars, minimap sliders, shadows and resize grips keep a quieter 35% tint. Gray accents, semantic hues and ordinary canvas/chrome stay independent." },
  { key: "monochromeBrackets", label: "Monochrome brackets", description: "All six nesting levels follow resolved Color 7 - Neutral, including its current Auto/manual adjustments. Active and inactive guides keep their different opacities. Unexpected brackets retain vivid Error coloring. Guide visibility is unchanged." },
  { key: "statefulStatusBar", label: "Stateful status bar", description: "Normal and inactive workspaces use the accent; debugging follows resolved Color 2; no-folder windows use a quiet surface. Remote indicators use their own accent-derived fill. Text chooses readable black/white. VS Code controls state switching; debug.enableStatusBarColor is respected." }
];
const roleLabels: Record<ColorRole, string> = {
  surface: "Surfaces",
  text: "Text",
  border: "Borders",
  accent: "Accents",
  info: "Info",
  warning: "Warning",
  error: "Error",
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  preserved: "Preserved"
};

function colorInputMarkup(key: string, label: string, description?: string): string {
  return `
    <div class="color-control">
      <div class="control-label">
        <label id="${key}-label" for="${key}-hex">${label}</label>
        ${description ? infoMarkup(`${key}-help`, label, description) : ""}
      </div>
      <div class="color-inputs">
        <input id="${key}-picker" type="color" aria-label="Choose ${label.toLowerCase()}">
        <input id="${key}-hex" class="hex-input" type="text" placeholder="#RRGGBB"
          maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false" autocomplete="off"
          autocapitalize="off" aria-describedby="hex-help ${key}-error${description ? ` ${key}-help` : ""}">
      </div>
      <span id="${key}-error" class="field-error" hidden>Use an opaque six-digit color, such as #007ACC.</span>
    </div>`;
}

function segmentedMarkup(
  name: string, label: string, options: readonly { value: string; label: string }[], description: string
): string {
  return `<div class="segmented-control" role="radiogroup" aria-label="${label}" aria-describedby="${description}">
    ${options.map((option) => `<label class="segment" for="${name}-${option.value}">
      <input id="${name}-${option.value}" name="${name}" type="radio" value="${option.value}">
      <span>${option.label}</span>
    </label>`).join("")}
  </div>`;
}

function switchMarkup(
  id: string, label: string, description: string, options: { disabled?: boolean; inputFirst?: boolean } = {}
): string {
  const input = `<input id="${id}" class="switch-input" type="checkbox" role="switch"
    aria-describedby="${description}"${options.disabled ? " disabled" : ""}>`;
  return `<label class="switch-label" for="${id}">
    ${options.inputFirst ? input : ""}
    <span>${label}</span>
    ${options.inputFirst ? "" : input}
  </label>`;
}

function syntaxModeMarkup({ key, slider, label, description, sliderDescription }: (typeof syntaxModeControls)[number]): string {
  return `<div class="syntax-mode-group">
    <div class="syntax-mode-heading">
      <div class="syntax-mode-options">
        <span>${label}</span>
        ${segmentedMarkup(`syntax-${key}`, label, syntaxAdjustmentModes.map((mode) => ({
          value: mode, label: mode === "auto" ? "Auto" : mode === "manual" ? "Manual" : "Off"
        })), `syntax-${key}-info`)}
        ${infoMarkup(`syntax-${key}-info`, label, `<span id="syntax-${key}-help">${description}</span>
          <span class="info-paragraph">${sliderDescription}</span>
          <span id="syntax-${key}-state" class="info-paragraph"></span>`)}
      </div>
      <output id="syntax-${key}-value" class="mode-value"
        for="syntax-${slider} ${syntaxAdjustmentModes.map((mode) => `syntax-${key}-${mode}`).join(" ")}"></output>
    </div>
    <div id="syntax-${key}-manual-controls" class="syntax-manual" hidden>
      <div id="syntax-${key}-fields"></div>
    </div>
  </div>`;
}

const markup = `
  <main class="lab" aria-labelledby="lab-title">
    <header class="lab-header">
      <div class="header-main">
        <div class="heading-label">
          <h1 id="lab-title">Themer Lab</h1>
          ${infoMarkup("baseline-help", "Themer Lab", `<strong id="baseline-name">Connecting to extension…</strong>
            <span id="baseline-version" class="info-paragraph"></span>
            <span id="baseline-limitation" class="info-paragraph">Explicit theme-chain colors only. Registered defaults and runtime-resolved colors are not captured.</span>
            <span class="info-paragraph">Shape a theme with a few controls. The local gallery updates immediately. Apply saves to User settings for this VS Code profile; Apply workspace in the three-dot menu saves only to this workspace.</span>
            <span id="live-help" class="info-paragraph">After confirmation, live preview applies theme-scoped UI/syntax/bracket colors and enables workspace bracket colorization. Guide visibility is unchanged.</span>
            <span id="workspace-help" class="info-paragraph"><strong>Apply saves to User settings.</strong> Temporary workspace preview changes are restored first. Existing workspace overrides are preserved and still take precedence. Apply workspace in the menu keeps the generated settings in this workspace instead. Both save actions also work with Live Preview off. Cancel restores the preview snapshot, including bracket colorization.</span>
            <span id="live-state" class="info-paragraph">Workspace preview is off.</span>
            <span class="info-paragraph">Export saves a separate theme file. Find it in the three-dot menu. Pending valid edits are sent before any command.</span>`)}
        </div>
        <div class="header-toolbar" role="group" aria-label="Theme actions">
          ${switchMarkup("live-preview", "Live Preview", "live-help", { disabled: true })}
          <span class="toolbar-divider" aria-hidden="true"></span>
          <button id="workspace-menu-button" class="icon-button overflow-button" type="button"
            popovertarget="workspace-menu" aria-label="More theme actions" aria-expanded="false" disabled>${iconMarkup("ellipsis")}</button>
          <div id="workspace-menu" class="action-menu" popover role="group" aria-label="More theme actions">
            <button id="apply-workspace-button" class="button secondary" type="button" aria-describedby="workspace-help" autofocus disabled>Apply workspace</button>
            <button id="export-button" class="button secondary" type="button" disabled>Export theme…</button>
          </div>
          <button id="cancel-button" class="button secondary compact" type="button" aria-describedby="workspace-help" disabled>Cancel</button>
          <button id="apply-button" class="button primary compact" type="button" aria-label="Apply to User settings" aria-describedby="workspace-help" disabled>Apply</button>
        </div>
      </div>
      <div class="status-strip" role="status" aria-live="polite" aria-atomic="true">
        <span id="busy-indicator" class="busy-indicator" aria-hidden="true" hidden>${iconMarkup("loading")}</span>
        <span id="status-text">Waiting for fitted defaults from the extension…</span>
      </div>
      <p id="error-message" class="error-message" role="alert" hidden></p>
    </header>

    <div class="lab-layout">
        <section class="panel control-panel" aria-labelledby="controls-title">
          <div class="section-heading">
            <div class="heading-label">
              <h2 id="controls-title">UI controls</h2>
              ${infoMarkup("ui-controls-help", "UI controls", `<span id="model-rules">Waiting for model information…</span>
                <span class="info-paragraph">Reset all restores the current mode's fitted UI defaults, turns Personality toggles off and turns all syntax Auto modes on. The other theme mode's draft is unchanged.</span>`)}
            </div>
            <div class="card-actions">
              <fieldset id="theme-mode-controls" class="mode-control" disabled>
                <legend class="sr-only">Theme mode</legend>
                ${segmentedMarkup("theme-mode", "Theme mode", [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }], "theme-mode-help")}
                ${infoMarkup("theme-mode-help", "theme mode", "Light and Dark use independent native 2026 baselines. Each mode remembers its own valid UI and syntax draft until the window reloads. Reset affects only the current mode.")}
              </fieldset>
              <button id="reset-button" class="button secondary compact" type="button" aria-describedby="ui-controls-help" disabled>Reset all</button>
            </div>
          </div>
          <fieldset id="anchor-controls" aria-labelledby="anchor-colors-label" disabled>
            <legend><span id="anchor-colors-label">Anchor colors</span> ${infoMarkup("hex-help", "anchor colors", "Enter #RRGGBB. Canvas, foreground, and accent supply the main UI colors. Valid changes update the local gallery immediately.")}</legend>
            <div class="control-grid grid-three">
              ${(["background", "foreground", "accent"] as const).map((key) => colorInputMarkup(key, colorLabels[key])).join("")}
            </div>
          </fieldset>
          <fieldset id="advanced-controls" disabled>
            <legend>Model shape</legend>
            <div id="advanced-fields" class="control-grid grid-four"></div>
          </fieldset>
          <details id="ui-advanced" class="advanced-disclosure">
            <summary>${iconMarkup("chevron-right")}<span>Advanced</span><span class="summary-note">Severity and change colors</span></summary>
            <fieldset id="severity-controls" aria-labelledby="severity-colors-label" disabled>
              <legend><span id="severity-colors-label">Severity colors</span> ${infoMarkup("severity-help", "severity colors", "Warning and Error stay independent. Related marks, badges, and validation colors follow their resolved severity colors. Unexpected brackets use a vivid, readable version of Error's hue; near-gray Error colors use red.")}</legend>
              <div class="control-grid grid-three">
                <div class="info-color-control">
                  ${colorInputMarkup("info", "Info", "Accent (default) or Foreground keeps the source hue with a small brightness lift. The input always shows the current Info color. Editing it selects Custom. Your custom color is remembered when you switch sources.")}
                  <div class="info-source-options">
                    ${segmentedMarkup("info-source", "Info source", infoSources.map((source) => ({
                      value: source, label: source === "accent" ? "Accent" : source === "foreground" ? "Foreground" : "Custom"
                    })), "info-help")}
                  </div>
                </div>
                ${severityParameters.filter((key) => key !== "info").map((key) => colorInputMarkup(key, colorLabels[key])).join("")}
              </div>
            </fieldset>
            <fieldset id="change-controls" aria-labelledby="change-colors-label" disabled>
              <legend><span id="change-colors-label">Change colors</span> ${infoMarkup("change-help", "change colors", "Added, Deleted, and Modified control file labels and change markers. Diff backgrounds use translucent added/deleted colors. Replacement lines are shown as removed plus inserted, not a third modified background.")}</legend>
              <div class="control-grid grid-three">
                ${changeParameters.map((key) => colorInputMarkup(key, colorLabels[key])).join("")}
              </div>
            </fieldset>
          </details>
          <details id="personality-options" class="advanced-disclosure">
            <summary>${iconMarkup("chevron-right")}<span>Personality</span><span class="summary-note">Optional finishing touches</span><span id="personality-warning-count" class="summary-note" hidden></span></summary>
            <fieldset id="personality-controls" disabled>
              <legend class="sr-only">Theme personality</legend>
              <div class="control-grid grid-four">
                ${personalityControls.map(({ key, label, description }) => `<div class="heading-label">
                  ${switchMarkup(`personality-${key}`, label, `personality-${key}-help`, { inputFirst: true })}
                  ${infoMarkup(`personality-${key}-help`, label.toLowerCase(), description)}
                </div>`).join("")}
              </div>
            </fieldset>
            <p id="personality-contrast-warning" class="help" role="status" hidden></p>
          </details>
        </section>

        <section class="panel" aria-labelledby="syntax-controls-title">
          <div class="section-heading">
            <div class="heading-label">
              <h2 id="syntax-controls-title">Syntax colors</h2>
              ${infoMarkup("syntax-help", "syntax colors", `Chroma and Lightness each offer Auto, Manual, and Off. Auto follows the UI; Manual captures the current appearance and reveals its slider; Off clears that axis adjustment and hides the slider. Manual at zero is still Manual.
                <span class="info-paragraph">${syntaxPaletteDescription} Reset palette is available beside the Manual selector and restores the original seeds without changing modes. Reset syntax restores Auto for the palette and both adjustments.</span>
                <span class="info-paragraph">Native color groups stay fixed as you edit. Error/deletion scopes follow Color 3, additions Color 5, warnings Color 4. Comments have their own family. Other unrelated purposes can share a group. Seeds never blend hues.</span>
                <span class="info-paragraph">Matching bracket pairs cycle through Colors 1-6. Guides use quieter versions when enabled in VS Code. Unexpected brackets stay vivid even with a muted code palette. Existing language-specific settings can override workspace bracket colorization.</span>`)}
            </div>
            <button id="reset-syntax-button" class="button secondary compact" type="button" disabled>Reset syntax</button>
          </div>
          <fieldset id="syntax-controls" disabled>
            <legend class="sr-only">Syntax coordination</legend>
            <div class="syntax-adjustments">
              ${syntaxModeControls.map(syntaxModeMarkup).join("")}
            </div>
            <div class="syntax-mode-group syntax-palette-group">
              <div class="syntax-mode-heading">
                <div class="syntax-mode-options syntax-palette-options">
                  <span>Syntax</span>
                  ${segmentedMarkup("syntax-palette-mode", "Syntax", syntaxPaletteModes.map((mode) => ({
                    value: mode, label: mode === "auto" ? "Auto" : mode === "anchored" ? "Anchored" : "Manual"
                  })), "syntax-palette-help")}
                  ${infoMarkup("syntax-palette-help", "syntax palette mode", `${syntaxPaletteDescription}
                    <span class="info-paragraph">Selecting Anchored uses the visible Color 1 as a new source and clears old global offsets so they are not applied twice. Selecting Manual from Anchored also captures any Auto adjustments as Manual values.</span>
                    <span id="syntax-palette-state" class="info-paragraph"></span>
                    <span id="syntax-picker-help" class="info-paragraph"></span>`)}
                  <button id="reset-syntax-palette" class="button secondary compact" type="button" hidden>Reset palette</button>
                </div>
              </div>
              <div id="syntax-seed-controls" class="syntax-color-grid syntax-seed-controls" hidden>
                ${syntaxFamilies.map((family) => `<div id="syntax-${family}-control">${colorInputMarkup(`syntax-${family}`, syntaxFamilyLabels[family], syntaxFamilyDescriptions[family])}</div>`).join("")}
              </div>
              <div id="syntax-auto-palette" class="syntax-auto-palette" aria-label="Automatically derived code palette">
                ${syntaxFamilies.map((family) => `<div class="syntax-derived-color"><span id="syntax-${family}-swatch" class="color-swatch" aria-hidden="true"></span><span>${syntaxFamilyLabels[family]}</span><code id="syntax-${family}-derived"></code></div>`).join("")}
              </div>
            </div>
          </fieldset>
          <div class="sample-toolbar">
            <div class="heading-label">
              <strong>Try the real editor</strong>
              ${infoMarkup("sample-help", "real editor samples", `<span id="native-preview-help">Open a sample and enable Live Preview to see real syntax highlighting change.</span>
                <span class="info-paragraph">These samples use actual grammar and semantic highlighting. Opening a sample does not execute it or enable live preview.</span>`)}
            </div>
            <div class="sample-buttons">
              <button class="button secondary compact" id="sample-typescript-button" type="button" data-sample="typescript" disabled>TypeScript</button>
              <button class="button secondary compact" id="sample-json-button" type="button" data-sample="json" disabled>JSON</button>
              <button class="button secondary compact" id="sample-python-button" type="button" data-sample="python" disabled>Python</button>
              <button class="button secondary compact" id="all-samples-button" type="button" disabled>All languages…</button>
            </div>
          </div>
          <details class="syntax-details">
            <summary>${iconMarkup("chevron-right")}<span>Syntax details</span><span id="syntax-contrast-count" class="summary-note"></span></summary>
            <p id="syntax-contrast-summary" class="help">Waiting for syntax contrast checks...</p>
            <p id="syntax-gamut-note" class="help"></p>
            <h3>Native color coverage</h3>
            <div id="syntax-family-coverage" class="help"></div>
          </details>
        </section>

        <section class="gallery" aria-label="Palette in context">
          <p id="preview-unavailable" class="empty-state">The gallery will appear when the extension supplies its fitted palette.</p>
          <div id="preview-surface" class="preview-surface" hidden>
            <div class="preview-titlebar">
              ${iconMarkup("window")}<span>themer-lab · component preview</span>
              ${infoMarkup("gallery-help", "palette in context", `Palette in context is a component gallery, not a full VS Code renderer.
                <span class="info-paragraph">Gallery slots use generated theme color IDs. Missing slots use current-theme colors as preview cosmetics only; they do not count as generated coverage. Syntax foregrounds come from generated representative scopes; the illustration is not tokenized.</span>`)}
            </div>
            <div class="preview-body">
              <aside class="preview-sidebar" aria-label="Illustrative explorer">
                <p class="preview-sidebar-heading">Explorer</p>
                <p class="preview-project">${iconMarkup("chevron-down")} THEMER LAB</p>
                <ul class="preview-list">
                  <li class="is-selected">${iconMarkup("layout")} Workbench</li>
                  <li>${iconMarkup("code")} Editor</li>
                  <li>${iconMarkup("terminal")} Terminal</li>
                </ul>
                <p class="preview-sidebar-footnote">Modeled surfaces<br>and selection states</p>
              </aside>
              <div class="preview-main">
                <div class="preview-tabs" role="tablist" aria-label="Component preview pages">
                  <button id="components-tab" class="preview-tab" type="button" role="tab"
                    aria-selected="true" aria-controls="components-panel" tabindex="0">Components</button>
                  <button id="syntax-tab" class="preview-tab" type="button" role="tab"
                    aria-selected="false" aria-controls="syntax-panel" tabindex="-1">palette.ts</button>
                </div>
                <div id="components-panel" class="preview-page" role="tabpanel" aria-labelledby="components-tab" tabindex="0">
                  <p class="preview-eyebrow">INTERACTION STATES</p>
                  <h3>Make the workbench yours.</h3>
                  <p class="preview-description">Surfaces, text, borders, and accents from the generated palette, including inline <code>theme.accent</code>.</p>
                  <div class="demo-button-row">
                    <button class="demo-button" type="button" data-demo>Primary</button>
                    <button class="demo-button hover-sample" type="button" data-demo aria-label="Primary button, illustrative hover state">Hover state</button>
                    <button class="demo-button demo-secondary" type="button" data-demo>Secondary</button>
                  </div>
                  <div class="demo-fields">
                    <div><label for="demo-name">Theme name <span class="preview-muted">(preview only)</span></label><input id="demo-name" type="text" value="My workspace palette" spellcheck="false"></div>
                    <div><label for="demo-target">Preview target</label><select id="demo-target"><option>Workbench</option><option>Editor</option><option>Terminal</option></select></div>
                  </div>
                  <div class="demo-notification">
                    <span class="notification-icon" aria-hidden="true">${iconMarkup("info")}</span>
                    <div><strong>Ready to explore</strong><p id="demo-notice">Gallery controls are illustrative. Use the actions outside this frame to change workspace settings.</p></div>
                  </div>
                  <div class="demo-chips" aria-label="Illustrative status chips">
                    <span class="demo-chip chip-info">Information</span>
                    <span class="demo-chip chip-warning">Warning</span>
                    <span class="demo-chip chip-error">Error</span>
                  </div>
                  <div class="change-preview" aria-label="Change color preview">
                    <h3>File changes</h3>
                    <ul class="change-files" aria-label="Illustrative changed files">
                      <li class="change-added">A added.ts</li>
                      <li class="change-deleted">D deleted.ts</li>
                      <li class="change-modified">M modified.ts</li>
                    </ul>
                    <pre class="change-diff" aria-label="Illustrative removed and inserted code"><code><span class="change-line change-deleted">- const name = <mark>"Previous theme"</mark>;</span><span class="change-line change-added">+ const name = <mark>"My theme"</mark>;</span></code></pre>
                    <p class="preview-muted">File labels, change gutters, and diff backgrounds share these sources. This is illustrative, not a real diff editor.</p>
                  </div>
                </div>
                <div id="syntax-panel" class="preview-page syntax-page" role="tabpanel" aria-labelledby="syntax-tab" tabindex="0" hidden>
                  <p class="syntax-caption">Generated syntax colors on illustrative TypeScript. Use a real sample with live preview for actual grammar and semantic highlighting.</p>
                  <pre class="code-sample" tabindex="0" aria-label="Illustrative TypeScript source"><code><span class="syntax-comment">// A small palette, a larger workbench.</span>
<span class="syntax-keyword">type</span> <span class="syntax-type">Theme</span> = {
  <span class="syntax-property">name</span>: <span class="syntax-type">string</span>;
  <span class="syntax-property">accent</span>: <span class="syntax-type">string</span>;
};

<span class="syntax-keyword">export const</span> <span class="syntax-function">createTheme</span> = (
  accent: <span class="syntax-type">string</span>
): <span class="syntax-type">Theme</span> =&gt; ({
  <span class="syntax-property">name</span>: <span class="syntax-string">"Themer Lab"</span>,
  accent,
});

<span class="syntax-keyword">const</span> <span class="syntax-declaration">palette</span> = <span class="syntax-function">createTheme</span>(<span class="syntax-string">"#007ACC"</span>);
console.<span class="syntax-function">log</span>(palette);</code></pre>
                  <pre class="code-sample"><code><span class="syntax-keyword">const</span> minimumContrast = <span class="syntax-number">4.5</span>;</code></pre>
                  <pre class="code-sample" aria-label="Illustrative bracket nesting levels one through six"><code><span class="syntax-keyword">const</span> nested = <span class="bracket-1">(</span><span class="bracket-2">(</span><span class="bracket-3">(</span><span class="bracket-4">(</span><span class="bracket-5">(</span><span class="bracket-6">(</span>true<span class="bracket-6">)</span><span class="bracket-5">)</span><span class="bracket-4">)</span><span class="bracket-3">)</span><span class="bracket-2">)</span><span class="bracket-1">)</span>;
<span class="syntax-comment">// Unexpected bracket:</span> <span class="bracket-unexpected">]</span></code></pre>
                </div>
              </div>
            </div>
            <div class="preview-statusbar"><span>${iconMarkup("git-branch")} main</span><span>TypeScript <span aria-hidden="true">·</span> UTF-8</span></div>
            <div id="status-state-preview" class="status-state-preview" aria-label="Illustrative status bar states" hidden>
              <span class="status-normal">Normal</span><span class="status-debug">Debugging</span>
              <span class="status-no-folder">No folder</span><span class="status-remote">Remote item</span>
            </div>
          </div>
        </section>

        <section id="evaluation-panel" class="panel evaluation-panel" aria-labelledby="evaluation-title" hidden>
          <div class="section-heading">
            <div><h2 id="evaluation-title">Baseline fidelity</h2><p id="evaluation-description" class="help">Evaluation is unavailable until a palette is ready.</p></div>
            <span class="badge">Development only</span>
          </div>
          <dl class="metrics">
            <div><dt>Mean RGB error</dt><dd id="metric-mean">—</dd></div>
            <div><dt>95th percentile RGB</dt><dd id="metric-p95">—</dd></div>
            <div><dt>Maximum RGB error</dt><dd id="metric-max">—</dd></div>
            <div><dt>Within tolerance · RGB</dt><dd id="metric-within">—</dd></div>
            <div><dt>Mean alpha error</dt><dd id="metric-alpha-mean">—</dd></div>
            <div><dt>Maximum alpha error</dt><dd id="metric-alpha-max">—</dd></div>
          </dl>
          <h3>Explicit-color coverage</h3>
          <dl class="coverage-metrics">
            <div><dt>Generated</dt><dd id="coverage-generated">—</dd></div>
            <div><dt>Preserved</dt><dd id="coverage-preserved">—</dd></div>
            <div><dt>Unresolved</dt><dd id="coverage-unresolved">—</dd></div>
          </dl>
          <p id="coverage-description" class="help">Unresolved colors are not silently filled in by the model.</p>
          <div class="contrast-section">
            <h3>Contrast checks</h3>
            <p id="contrast-summary" class="help">Waiting for checks…</p>
            <ul id="contrast-checks" class="contrast-checks"></ul>
          </div>
          <details class="role-details">
            <summary>${iconMarkup("chevron-right")}<span>Inspect color roles and theme IDs</span></summary>
            <p class="help">Preserved colors are baseline values outside the generated roles. These lists also include supplemental severity/change tokens, which have no captured reference and are not scored.</p>
            <div id="color-roles" class="color-roles"></div>
          </details>
        </section>
    </div>
  </main>
`;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberText(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${numberText(value * 100, 1)}%`;
}

function mount(root: HTMLElement): void {
  root.innerHTML = markup;
  const get = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing Themer Lab element: ${id}.`);
    }
    return element as T;
  };
  const api = acquireVsCodeApi();
  get("evaluation-panel").hidden = root.dataset.developmentPreview !== "true";
  const modeFieldset = get<HTMLFieldSetElement>("theme-mode-controls");
  const anchorFieldset = get<HTMLFieldSetElement>("anchor-controls");
  const severityFieldset = get<HTMLFieldSetElement>("severity-controls");
  const changeFieldset = get<HTMLFieldSetElement>("change-controls");
  const advancedFieldset = get<HTMLFieldSetElement>("advanced-controls");
  const personalityFieldset = get<HTMLFieldSetElement>("personality-controls");
  const syntaxFieldset = get<HTMLFieldSetElement>("syntax-controls");
  const syntaxFit = () => getSyntaxModel(references[state?.parameters.mode ?? reference.theme.type]);
  let renderedMode: ThemeMode | undefined;
  const drafts = new Map<ThemeMode, ThemeDraft>();
  const liveInput = get<HTMLInputElement>("live-preview");
  const preview = get<HTMLElement>("preview-surface");
  const status = get<HTMLElement>("status-text");
  const errorMessage = get<HTMLElement>("error-message");
  const sliders = new Map<NumericParameter, { input: HTMLInputElement; output: HTMLOutputElement }>();
  const syntaxSliders = new Map<SyntaxNumericParameter, { input: HTMLInputElement; output: HTMLOutputElement }>();
  const invalidAnchors = new Set<string>();
  const colorControls = [
    ...anchors.map((key) => ({
      id: key,
      value: (draft: AppState) => key === "info" ? currentInfoColor(draft) : draft.parameters[key],
      change: (value: string) => changeParameter(key, value)
    })),
    ...syntaxFamilies.map((key) => ({
      id: `syntax-${key}`,
      value: (draft: AppState) => draft.syntax.parameters[key],
      change: (value: string) => changeSyntaxParameter(key, value)
    }))
  ];
  const paletteProperties = new Set<string>();
  let state: AppState | undefined;
  let localRevision = 0;
  let acknowledgedRevision = 0;
  let pendingParameters = false;
  let debounceTimer: number | undefined;
  let recoveryRequested = false;
  let hostError = "";
  let generationError = "";
  let commandNotice = "";

  get("baseline-name").textContent = reference.theme.name;
  get("baseline-version").textContent = `VS Code ${reference.vscode.version} · explicit theme chain`;

  function addSlider(
    id: string, label: string, description: string,
    limits: { min: number; max: number; step: number },
    container: string, change: (value: number) => void,
    compact?: { outputId: string; helpId: string }
  ) {
    const row = document.createElement("div");
    row.className = "range-control";
    const output = compact ? get<HTMLOutputElement>(compact.outputId) : document.createElement("output");
    output.htmlFor.add(id);
    const input = document.createElement("input");
    input.id = id;
    input.type = "range";
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);
    input.setAttribute("aria-describedby", compact?.helpId ?? `${id}-help`);
    if (compact) {
      input.setAttribute("aria-label", label);
    } else {
      const heading = document.createElement("div");
      heading.className = "range-heading";
      const labelElement = document.createElement("label");
      labelElement.htmlFor = id;
      labelElement.textContent = label;
      output.id = `${id}-value`;
      const title = document.createElement("div");
      title.className = "heading-label";
      title.append(labelElement);
      title.insertAdjacentHTML("beforeend", infoMarkup(`${id}-help`, label.toLowerCase(), description));
      heading.append(title, output);
      row.append(heading);
    }
    row.append(input);
    get(container).append(row);
    input.addEventListener("input", () => change(input.valueAsNumber));
    input.addEventListener("change", () => flushParameters());
    input.addEventListener("pointerdown", () => { input.dataset.pointerFocus = "true"; });
    input.addEventListener("keydown", () => { delete input.dataset.pointerFocus; });
    input.addEventListener("blur", () => { delete input.dataset.pointerFocus; });
    return { input, output };
  }

  for (const { key, label, description } of numericControls) {
    sliders.set(key, addSlider(`parameter-${key}`, label, description, numericParameterLimits[key], "advanced-fields",
      (value) => changeParameter(key, value)));
  }
  for (const { key, slider, label, sliderDescription } of syntaxModeControls) {
    syntaxSliders.set(slider, addSlider(`syntax-${slider}`, `${label} adjustment`, sliderDescription, syntaxNumericParameterLimits[slider],
      `syntax-${key}-fields`, (value) => changeSyntaxParameter(slider, value),
      { outputId: `syntax-${key}-value`, helpId: `syntax-${key}-info` }));
  }
  const refreshPopovers = initializePopovers(root);
  function post(message: ClientMessage): boolean {
    try {
      api.postMessage(message);
      return true;
    } catch (error) {
      hostError = `Could not contact the extension: ${errorText(error)}`;
      commandNotice = "";
      renderChrome();
      return false;
    }
  }

  function clearDebounce(): void {
    if (debounceTimer !== undefined) {
      window.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  }

  function flushParameters(): boolean {
    clearDebounce();
    if (!pendingParameters || !state) {
      return true;
    }
    const sent = post({
      type: "parameters",
      parameters: { ...state.parameters },
      syntaxParameters: { ...state.syntax.parameters },
      revision: localRevision
    });
    if (sent) {
      pendingParameters = false;
      renderChrome();
    }
    return sent;
  }

  function changeParameter(key: keyof ThemeParameters, value: string | number | boolean): void {
    if (state) changeDraft({
      ...state.parameters, [key]: value, ...(key === "info" ? { infoSource: "custom" } : {})
    }, state.syntax.parameters);
  }

  function currentInfoColor(draft: AppState): string {
    const color = draft.palette.colors["editorInfo.foreground"];
    if (!color) throw new Error("The generated Info foreground is missing.");
    return color;
  }

  function changeSyntaxParameter(key: SyntaxFamily | SyntaxNumericParameter, value: string | number): void {
    if (state) {
      const family = syntaxFamilies.find((family) => family === key);
      changeDraft(state.parameters, family && typeof value === "string"
        ? setSyntaxSeed(state.syntax.parameters, family, value)
        : { ...state.syntax.parameters, [key]: value });
      selectTab(get<HTMLButtonElement>("syntax-tab"));
    }
  }

  function changeDraft(ui: unknown, code: unknown): void {
    if (!state || state.busy) {
      return;
    }
    try {
      const parameters = parseParameters(ui);
      const syntaxParameters = parseSyntaxParameters(code);
      const selectedReference = references[parameters.mode];
      const selectedSyntaxFit = getSyntaxModel(selectedReference);
      const { palette, syntax } = generateTheme(selectedReference, parameters, syntaxParameters, selectedSyntaxFit);
      const evaluation = evaluatePalette(selectedReference, palette);
      if (localRevision >= Number.MAX_SAFE_INTEGER) {
        throw new Error("The revision limit was reached. Reopen Themer Lab before editing further.");
      }
      drafts.set(state.parameters.mode, {
        parameters: structuredClone(state.parameters), syntaxParameters: structuredClone(state.syntax.parameters)
      });
      drafts.set(parameters.mode, { parameters: structuredClone(parameters), syntaxParameters: structuredClone(syntaxParameters) });
      localRevision += 1;
      state = {
        ...state, revision: localRevision, parameters, palette, evaluation,
        drafts: Object.fromEntries(drafts),
        baseline: {
          ...state.baseline, name: selectedReference.theme.name, version: selectedReference.vscode.version,
          explicitColorCount: Object.keys(selectedReference.colors).length
        },
        model: {
          controlCount: controls.length, fixedRuleCount: modelDefinitions[parameters.mode].fixedRuleCount,
          exceptionCount: palette.coverage.preserved
        },
        syntax
      };
      generationError = "";
      hostError = "";
      commandNotice = "";
      pendingParameters = true;
      clearDebounce();
      debounceTimer = window.setTimeout(flushParameters, 100);
      renderControls();
      renderPalette();
      renderChrome();
    } catch (error) {
      generationError = `The local preview could not be generated: ${errorText(error)} Controls retain the last valid draft. Change a control or reset to recover.`;
      renderControls();
      renderPalette();
      renderChrome();
    }
  }

  function markAnchor(key: string, invalid: boolean): void {
    const input = get<HTMLInputElement>(`${key}-hex`);
    if (invalid) {
      invalidAnchors.add(key);
      input.setAttribute("aria-invalid", "true");
      input.setCustomValidity("Enter an opaque six-digit hex color, such as #007ACC.");
    } else {
      invalidAnchors.delete(key);
      input.removeAttribute("aria-invalid");
      input.setCustomValidity("");
    }
    get(`${key}-error`).hidden = !invalid;
  }

  for (const mode of themeModes) {
    const input = get<HTMLInputElement>(`theme-mode-${mode}`);
    input.addEventListener("change", () => {
      if (!state || state.busy || !input.checked) {
        renderControls();
        return;
      }
      if (!flushParameters()) return;
      const draft = drafts.get(mode) ?? {
        parameters: getDefaultParameters(references[mode]),
        syntaxParameters: getDefaultSyntaxParameters(references[mode])
      };
      changeDraft(draft.parameters, draft.syntaxParameters);
      flushParameters();
    });
  }

  for (const control of colorControls) {
    const key = control.id;
    const picker = get<HTMLInputElement>(`${key}-picker`);
    const input = get<HTMLInputElement>(`${key}-hex`);
    picker.addEventListener("input", () => {
      markAnchor(key, false);
      input.value = picker.value.toUpperCase();
      control.change(picker.value);
    });
    picker.addEventListener("change", () => flushParameters());
    input.addEventListener("input", () => {
      const valid = /^#[\da-f]{6}$/i.test(input.value);
      markAnchor(key, !valid);
      if (valid) {
        control.change(input.value);
      } else {
        if (key === "info" && state && state.parameters.infoSource !== "custom") {
          control.change(currentInfoColor(state));
        }
        renderChrome();
      }
    });
    input.addEventListener("change", () => {
      if (!invalidAnchors.has(key)) {
        flushParameters();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (invalidAnchors.has(key)) {
          input.reportValidity();
        } else {
          flushParameters();
        }
      }
      if (event.key === "Escape" && state) {
        input.value = control.value(state).toUpperCase();
        markAnchor(key, false);
        renderChrome();
      }
    });
  }

  for (const source of infoSources) {
    get<HTMLInputElement>(`info-source-${source}`).addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement) || !input.checked || !state || state.busy) return;
      markAnchor("info", false);
      changeParameter("infoSource", source);
      flushParameters();
    });
  }
  for (const key of personalityKeys) {
    get<HTMLInputElement>(`personality-${key}`).addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement) || !state || state.busy) return;
      changeParameter(key, input.checked);
      flushParameters();
    });
  }

  function command(message: ClientMessage, notice: string): void {
    if (!state || state.busy) {
      return;
    }
    if (message.type === "cancel" && !state.livePreview && !state.recoveryPending) {
      return;
    }
    if ((message.type === "apply" || message.type === "applyWorkspace") && state.recoveryPending) return;
    if (message.type === "applyWorkspace" && !state.workspaceAvailable) return;
    const needsValidDraft = message.type === "apply" || message.type === "applyWorkspace" || message.type === "export" ||
      (message.type === "livePreview" && message.enabled);
    if (needsValidDraft && (invalidAnchors.size > 0 || generationError)) {
      const invalid = invalidAnchors.values().next().value;
      if (invalid) {
        get<HTMLInputElement>(`${invalid}-hex`).reportValidity();
      }
      return;
    }
    if (!flushParameters()) {
      return;
    }
    hostError = "";
    commandNotice = notice;
    if (message.type === "reset" || message.type === "resetSyntax" || message.type === "cancel") {
      recoveryRequested = true;
      for (const control of colorControls) {
        const key = control.id;
        if (message.type === "resetSyntax" && !key.startsWith("syntax-")) continue;
        markAnchor(key, false);
        get<HTMLInputElement>(`${key}-hex`).value = control.value(state).toUpperCase();
      }
    }
    post(message);
    renderControls();
    renderChrome();
  }

  liveInput.addEventListener("change", () => {
    const enabled = liveInput.checked;
    liveInput.checked = state?.livePreview ?? false;
    command(
      { type: "livePreview", enabled },
      enabled ? "Waiting for host confirmation before enabling real workspace preview…" : "Disabling live workspace preview…"
    );
  });
  get("reset-button").addEventListener("click", () => command({ type: "reset" }, "Resetting to fitted baseline defaults…"));
  get("reset-syntax-button").addEventListener("click", () => command({ type: "resetSyntax" }, "Resetting syntax colors; UI controls stay unchanged..."));
  for (const { key, parameter } of syntaxModeControls) {
    for (const mode of syntaxAdjustmentModes) {
      const input = get<HTMLInputElement>(`syntax-${key}-${mode}`);
      input.addEventListener("change", () => {
        if (!state || state.busy || !input.checked) return;
        try {
          changeDraft(state.parameters, setSyntaxAdjustmentMode(syntaxFit(), state.syntax.parameters,
            getSyntaxAnchors(state.parameters, state.palette), parameter, mode));
          flushParameters();
        } catch (error) {
          hostError = `Could not change syntax adjustment mode: ${errorText(error)}`;
          renderControls();
          renderChrome();
        }
      });
    }
  }
  for (const mode of syntaxPaletteModes) {
    const input = get<HTMLInputElement>(`syntax-palette-mode-${mode}`);
    input.addEventListener("change", () => {
      if (!input.checked || !state || state.busy) return;
      try {
        for (const family of syntaxFamilies) markAnchor(`syntax-${family}`, false);
        changeDraft(state.parameters, setSyntaxPaletteMode(syntaxFit(), state.syntax.parameters,
          getSyntaxAnchors(state.parameters, state.palette), mode));
        flushParameters();
      } catch (error) {
        hostError = `Could not change syntax palette mode: ${errorText(error)}`;
        renderControls();
        renderChrome();
      }
    });
  }
  get("reset-syntax-palette").addEventListener("click", () => {
    if (!state || state.busy) return;
    try {
      for (const family of syntaxFamilies) markAnchor(`syntax-${family}`, false);
      changeDraft(state.parameters, resetSyntaxGroup(syntaxFit(), state.syntax.parameters, "autoHue"));
      flushParameters();
    } catch (error) {
      hostError = `Could not reset the syntax palette: ${errorText(error)}`;
      renderChrome();
    }
  });
  get("apply-button").addEventListener("click", () => command({ type: "apply" }, "Saving the theme to User settings…"));
  get("apply-workspace-button").addEventListener("click", () => command({ type: "applyWorkspace" }, "Saving the theme to Workspace settings…"));
  get("cancel-button").addEventListener("click", () => command({ type: "cancel" }, "Restoring the saved workspace snapshot…"));
  get("export-button").addEventListener("click", () => command({ type: "export" }, "Waiting for the theme export destination…"));
  get("all-samples-button").addEventListener("click", () => command({ type: "openSample" }, "Opening the syntax sample picker..."));
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-sample]")) {
    button.addEventListener("click", () => {
      const language = button.dataset.sample as SampleLanguage;
      command({ type: "openSample", language }, `Opening a real ${button.textContent ?? language} editor sample…`);
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-demo]")) {
    button.addEventListener("click", () => {
      get("demo-notice").textContent = "This is only a component preview. This button did not change workspace settings.";
    });
  }

  const tabs = [get<HTMLButtonElement>("components-tab"), get<HTMLButtonElement>("syntax-tab")];
  function selectTab(selected: HTMLButtonElement): void {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      get(tab.getAttribute("aria-controls") ?? "").hidden = !active;
    }
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next: HTMLButtonElement | undefined;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        selectTab(next);
        next.focus();
      }
    });
  }

  function renderControls(): void {
    const locked = !state || state.busy;
    modeFieldset.disabled = locked;
    anchorFieldset.disabled = locked;
    severityFieldset.disabled = locked;
    changeFieldset.disabled = locked;
    advancedFieldset.disabled = locked;
    personalityFieldset.disabled = locked;
    syntaxFieldset.disabled = locked;
    if (!state) return;
    const mode = state.parameters.mode;
    for (const option of themeModes) get<HTMLInputElement>(`theme-mode-${option}`).checked = mode === option;
    for (const key of personalityKeys) get<HTMLInputElement>(`personality-${key}`).checked = state.parameters[key];
    get("status-state-preview").hidden = !state.parameters.statefulStatusBar;
    const personalityWarnings = state.parameters.accentActiveItems
      ? state.evaluation.contrast.filter((check) => !check.passes && check.label.startsWith("Active item")).length : 0;
    get("personality-warning-count").hidden = personalityWarnings === 0;
    get("personality-warning-count").textContent = `${personalityWarnings} contrast ${personalityWarnings === 1 ? "advisory" : "advisories"}`;
    get("personality-contrast-warning").hidden = personalityWarnings === 0;
    get("personality-contrast-warning").textContent = `${personalityWarnings} active-item states are below 4.5:1. Some active/hover surfaces cannot share one readable accent foreground; adjust the canvas or surface separation. The model keeps the best available contrast.`;
    get("baseline-name").textContent = state.baseline.name;
    get("baseline-version").textContent = `VS Code ${state.baseline.version} · ${state.baseline.explicitColorCount} explicit colors`;
    get("baseline-limitation").textContent = state.baseline.limitation;
    if (renderedMode !== mode) {
      for (const control of colorControls) {
        markAnchor(control.id, false);
        get<HTMLInputElement>(`${control.id}-hex`).value = control.value(state).toUpperCase();
      }
      get("syntax-family-coverage").replaceChildren();
      for (const family of syntaxFamilies) {
        const entry = document.createElement("p");
        entry.textContent = `${syntaxFamilyLabels[family]}: ${syntaxFamilySourceColors(syntaxFit(), family).join(", ")}`;
        get("syntax-family-coverage").append(entry);
        get(`syntax-${family}-help`).textContent = mode === "light"
          ? `Native Light ${syntaxFamilyLabels[family]} family. Scope assignments stay fixed as you edit; inspect native color coverage below.`
          : syntaxFamilyDescriptions[family];
      }
      renderedMode = mode;
    }
    get("syntax-autoLightness-help").textContent = mode === "light"
      ? "Auto follows Primary foreground and muted text. Dark anchors ease toward a minimum OKLCH lightness of 0.4; bright anchors roll off at 0.85. Manual captures the current lightness and reveals the full-range shift. Off clears the shift and capture, restoring seed/fitted brightness."
      : `${autoLightnessDescription} Manual captures the current lightness and reveals the full-range shift. Off clears the shift and capture, restoring seed/fitted brightness.`;
    for (const source of infoSources) {
      get<HTMLInputElement>(`info-source-${source}`).checked = state.parameters.infoSource === source;
    }
    get<HTMLInputElement>("info-picker").disabled = locked;
    get<HTMLInputElement>("info-hex").disabled = locked;
    const parameters = state.syntax.parameters;
    const resolved = state.syntax.resolved;
    for (const { key, parameter } of syntaxModeControls) {
      for (const option of syntaxAdjustmentModes) {
        get<HTMLInputElement>(`syntax-${key}-${option}`).checked = parameters[parameter] === option;
      }
      get(`syntax-${key}-manual-controls`).hidden = parameters[parameter] !== "manual";
    }
    const anchored = parameters.paletteMode === "anchored";
    get("syntax-autoChroma-help").textContent = anchored
      ? "In Anchored syntax, Auto uses Color 1 chroma directly, without an extra accent-derived boost. Manual adds a global boost; Off leaves the anchor-derived chroma unchanged."
      : autoChromaDescription;
    for (const option of syntaxPaletteModes) {
      get<HTMLInputElement>(`syntax-palette-mode-${option}`).checked = parameters.paletteMode === option;
    }
    get("syntax-seed-controls").hidden = parameters.paletteMode === "auto";
    get("syntax-seed-controls").dataset.paletteMode = parameters.paletteMode;
    get("syntax-blue-label").textContent = anchored ? "Anchor" : syntaxFamilyLabels.blue;
    get("syntax-blue-picker").setAttribute("aria-label", anchored ? "Choose syntax anchor" : `Choose ${syntaxFamilyLabels.blue.toLowerCase()}`);
    get("syntax-blue-hex").setAttribute("aria-describedby",
      `hex-help syntax-blue-error ${anchored ? "syntax-palette-help" : "syntax-blue-help"}`);
    get("reset-syntax-palette").hidden = parameters.paletteMode !== "manual";
    get<HTMLButtonElement>("reset-syntax-palette").disabled = locked;
    get("syntax-auto-palette").hidden = parameters.paletteMode === "manual";
    get("syntax-autoLightness-state").textContent = parameters.lightnessMode === "auto"
      ? `Following UI text with ${mode === "light" ? "soft lower/upper lightness limits" : "a soft upper-lightness limit"}. Select Manual to capture the scaled result without a visible jump.`
      : parameters.lightnessMode === "off"
        ? "No lightness adjustment. Seed/fitted brightness is used; the shift and any Auto capture are cleared."
      : parameters.lightnessBase
        ? "Starting from captured Auto lightness. Off discards that capture and restores seed/fitted brightness."
        : "Starting from seed/fitted lightness. Off clears the shift; Auto stays off.";
    get("syntax-autoChroma-state").textContent = parameters.chromaMode === "auto"
      ? anchored ? "Chroma comes directly from Color 1. Select Manual to add a global boost."
        : `Current automatic boost: ${signedPercent(resolved.chromaBoost)}. Select Manual to keep this value.`
      : parameters.chromaMode === "off"
        ? "No chroma adjustment. The palette keeps its own chroma; the boost is zero."
        : "Manual chroma boost. Off clears the boost; Auto stays off.";
    if (anchored) {
      get("syntax-autoLightness-help").textContent = "In Anchored syntax, Auto follows Color 1 brightness for the six chromatic families. Neutral and Comments keep the UI's soft lightness limits. Manual captures these baselines and reveals the shift. Off uses the anchor-relative seed brightness.";
      get("syntax-autoLightness-state").textContent = parameters.lightnessMode === "auto"
        ? "Colors 1-6 follow Color 1 brightness. Neutral follows Primary foreground; Comments follows muted text."
        : parameters.lightnessMode === "manual"
          ? "Manual shift on the anchor-derived palette. Editing Color 1 also updates any captured wheel baseline."
          : "Anchor-relative seed brightness, without a global lightness adjustment.";
    }
    get("syntax-palette-state").textContent = parameters.paletteMode === "auto"
      ? `UI-linked palette. Wheel rotation: ${numberText(resolved.hueRotation, 1)} degrees. Gray accents retain the original orientation.`
      : anchored
        ? "Edit Anchor beside the selector to coordinate the wheel independently of Interaction accent. Selecting Manual captures this appearance and any automatic anchor adjustments."
        : "Independent seed colors. Reset palette restores the eight original fitted seeds; Manual stays selected.";
    get<HTMLOutputElement>("syntax-autoChroma-value").value = signedPercent(
      parameters.chromaMode === "auto" ? resolved.chromaBoost : parameters.chromaBoost
    );
    get<HTMLOutputElement>("syntax-autoLightness-value").value = parameters.lightnessMode === "auto"
      ? anchored ? "Anchor" : "UI linked" : signedPercent(parameters.lightnessShift);
    get("syntax-picker-help").textContent = [
      parameters.lightnessMode === "auto" ? anchored ? "Color 1 supplies wheel brightness." : "Lightness follows UI with soft brightness limits; picker brightness is overridden." :
        parameters.lightnessBase ? anchored ? "The manual shift follows Color 1 brightness; Neutral and Comments retain captured baselines." : "Lightness uses the captured Auto baseline; Off restores picker brightness." : "Lightness starts from picker brightness and fitted variations.",
      parameters.chromaMode === "auto" ? anchored ? "Color 1 supplies wheel chroma." : "Accent chroma supplies a gentle boost to your chosen chroma." :
        parameters.chromaMode === "off" ? "Chroma is unadjusted." : "Chroma boost adjusts your chosen chroma.",
      "Each seed keeps its fixed syntax family."
    ].join(" ");
    for (const family of syntaxFamilies) {
      const editable = parameters.paletteMode === "manual" || (anchored && family === "blue");
      get(`syntax-${family}-control`).hidden = !editable;
      get<HTMLInputElement>(`syntax-${family}-picker`).disabled = locked || !editable;
      get<HTMLInputElement>(`syntax-${family}-hex`).disabled = locked || !editable;
      const color = resolved.colors[family];
      get(`syntax-${family}-swatch`).style.backgroundColor = color;
      get(`syntax-${family}-derived`).textContent = color.toUpperCase();
    }
    get("model-rules").textContent = `${state.model.controlCount} available UI inputs · ${state.model.fixedRuleCount} fixed rules · ${state.model.exceptionCount} explicit exceptions`;
    for (const control of colorControls) {
      const key = control.id;
      get<HTMLInputElement>(`${key}-picker`).value = control.value(state);
      const input = get<HTMLInputElement>(`${key}-hex`);
      if (!invalidAnchors.has(key) && document.activeElement !== input) {
        input.value = control.value(state).toUpperCase();
      }
    }
    for (const [key, { input, output }] of sliders) {
      input.value = String(state.parameters[key]);
      output.value = numberText(state.parameters[key]);
    }
    for (const [key, { input }] of syntaxSliders) {
      const value = state.syntax.parameters[key];
      const text = signedPercent(value);
      input.value = String(value);
      input.setAttribute("aria-valuetext", text);
    }
  }

  function renderChrome(): void {
    const locked = !state || state.busy;
    const invalid = invalidAnchors.size > 0 || generationError.length > 0;
    get<HTMLButtonElement>("reset-button").disabled = locked;
    get<HTMLButtonElement>("reset-syntax-button").disabled = locked;
    get<HTMLButtonElement>("cancel-button").disabled = locked || (!state?.livePreview && !state?.recoveryPending);
    get<HTMLButtonElement>("apply-button").disabled = locked || state?.recoveryPending === true || invalid;
    get<HTMLButtonElement>("apply-workspace-button").disabled = locked || state?.recoveryPending === true || !state?.workspaceAvailable || invalid;
    get<HTMLButtonElement>("export-button").disabled = locked || invalid;
    get<HTMLButtonElement>("workspace-menu-button").disabled = locked;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-sample], #all-samples-button")) {
      button.disabled = locked;
    }
    liveInput.disabled = locked || state?.recoveryPending === true || (!state?.workspaceAvailable && !state?.livePreview) ||
      (invalid && !state?.livePreview);
    liveInput.checked = state?.livePreview ?? false;
    get("live-state").textContent = state?.livePreview
      ? "Live preview is on: UI and syntax changes update workspace settings."
      : "Workspace preview is off. The local gallery does not write settings.";
    get("native-preview-help").textContent = state?.livePreview
      ? "Live preview is on. Open a sample below; valid syntax edits update the real editor."
      : "Open a sample and enable Live Preview to see real syntax highlighting change.";
    get("busy-indicator").hidden = !state?.busy;
    const localStatus = pendingParameters ? " Local draft updated; sending changes…" :
      localRevision > acknowledgedRevision ? " Waiting for the extension to acknowledge the local draft…" : "";
    const validationStatus = invalidAnchors.size > 0 ? " Finish the highlighted hex color before applying or exporting." : "";
    const hostStatus = state?.status || "Waiting for fitted defaults from the extension…";
    status.textContent = `${hostStatus}${commandNotice ? ` ${commandNotice}` : ""}${localStatus}${validationStatus}`;
    errorMessage.textContent = [hostError, generationError].filter(Boolean).join(" ");
    errorMessage.hidden = !errorMessage.textContent;
    refreshPopovers();
  }

  function renderPalette(): void {
    const available = state !== undefined && !generationError;
    preview.hidden = !available;
    get("preview-unavailable").hidden = available;
    get("preview-unavailable").textContent = generationError
      ? "Preview unavailable. No replacement palette or successful evaluation has been assumed."
      : "The gallery will appear when the extension supplies its fitted palette.";
    if (!available || !state) {
      for (const id of ["metric-mean", "metric-p95", "metric-max", "metric-within", "metric-alpha-mean", "metric-alpha-max", "coverage-generated", "coverage-preserved", "coverage-unresolved"]) {
        get(id).textContent = "—";
      }
      get("evaluation-description").textContent = "Evaluation is unavailable until a valid palette is ready.";
      get("coverage-description").textContent = "No generated coverage is being claimed.";
      get("contrast-summary").textContent = "Contrast checks are unavailable.";
      get("syntax-contrast-summary").textContent = "Syntax contrast checks are unavailable.";
      get("syntax-contrast-count").textContent = "";
      get("syntax-gamut-note").textContent = "";
      get("contrast-checks").replaceChildren();
      get("color-roles").replaceChildren();
      return;
    }
    for (const property of paletteProperties) {
      preview.style.removeProperty(property);
    }
    paletteProperties.clear();
    for (const [id, color] of Object.entries(state.palette.colors)) {
      if (/^[a-z][a-z\d.]*$/i.test(id) && isThemeColor(color)) {
        const property = `--palette-${id.replace(/\./g, "-")}`;
        preview.style.setProperty(property, color);
        paletteProperties.add(property);
      }
    }
    for (const [role, color] of Object.entries(syntaxPreviewColors(state.syntax.palette))) {
      preview.style.setProperty(`--syntax-${role}`, color);
    }
    for (let index = 1; index <= 6; index++) {
      const color = state.syntax.brackets.colors[`editorBracketHighlight.foreground${index}`];
      if (!color || !isThemeColor(color)) throw new Error(`The bracket preview is missing nesting color ${index}.`);
      preview.style.setProperty(`--bracket-${index}`, color);
    }
    const unexpected = state.syntax.brackets.colors[unexpectedBracketId];
    if (!unexpected || !isThemeColor(unexpected)) throw new Error("The bracket preview is missing its unexpected-bracket color.");
    preview.style.setProperty("--bracket-unexpected", unexpected);
    const syntaxWarnings = state.syntax.contrast.filter((check) => !check.passes).length;
    get("syntax-contrast-count").textContent = `${syntaxWarnings} contrast ${syntaxWarnings === 1 ? "advisory" : "advisories"}`;
    get("syntax-gamut-note").textContent = "Each shade has its own sRGB chroma limit, never a shared ceiling. Lightness is resolved first; very pale or dark shades have less room for color. Neutral never receives a chroma boost; true grays stay gray. Only Auto Hue deliberately rotates the palette; per-shade hue variations remain within 15 degrees of their seed.";
    get("syntax-contrast-summary").textContent = `${syntaxWarnings} of ${state.syntax.contrast.length} representative syntax colors below 4.5:1 against the editor background. Variants and every language are not covered by these advisory checks.`;
    if (get("evaluation-panel").hidden) return;
    const { evaluation, palette } = state;
    get("metric-mean").textContent = numberText(evaluation.meanError);
    get("metric-p95").textContent = numberText(evaluation.p95Error);
    get("metric-max").textContent = numberText(evaluation.maxError);
    get("metric-within").textContent = Number.isFinite(evaluation.withinTolerancePercent)
      ? `${numberText(evaluation.withinTolerancePercent, 1)}%` : "—";
    get("metric-alpha-mean").textContent = numberText(evaluation.alphaMeanError, 3);
    get("metric-alpha-max").textContent = numberText(evaluation.alphaMaxError, 3);
    get("evaluation-description").textContent = `Raw RGB scores are OKLab distance × 100, without alpha compositing. Within-tolerance percentage tests raw RGB only at tolerance ${numberText(evaluation.tolerance)}; it does not test alpha or contrast. Alpha errors are absolute opacity differences (0–1). Higher differences after color edits are expected and do not alone indicate poor theme quality. Severity badge text prioritizes contrast and may differ strongly from the reference. Contrast warnings are assessed separately. This is not a full-workbench fidelity score.`;
    get("coverage-generated").textContent = String(palette.coverage.generated);
    get("coverage-preserved").textContent = String(palette.coverage.preserved);
    get("coverage-unresolved").textContent = String(palette.coverage.unresolved);
    get("coverage-description").textContent = `${palette.coverage.total} captured color IDs. Generated/preserved/unresolved counts describe that reference only. ${palette.coverage.unscoredGenerated} additional severity/change tokens are generated without a captured reference and excluded from fidelity scores. Registered defaults and runtime colors are not captured.`;

    const contrastList = get("contrast-checks");
    contrastList.replaceChildren();
    const checks = [...evaluation.contrast.filter((check) => check.label !== "Editor text"),
      ...state.syntax.contrast, state.syntax.brackets.contrast];
    const warnings = checks.filter((check) => !check.passes).length;
    get("contrast-summary").textContent = checks.length === 0
      ? "The engine returned no contrast checks for this palette."
      : `${warnings} below-target ${warnings === 1 ? "pair" : "pairs"} out of ${checks.length} UI and representative syntax checks. These checks do not guarantee accessibility for every UI state or syntax variant.`;
    for (const check of checks) {
      const item = document.createElement("li");
      item.className = check.passes ? "contrast-pass" : "contrast-warning";
      const label = document.createElement("span");
      label.textContent = `${check.passes ? "Pass" : "Below target"} · ${check.label}`;
      const ratio = document.createElement("span");
      ratio.className = "contrast-ratio";
      ratio.textContent = `${numberText(check.ratio)}:1 / ${numberText(check.target, 1)}:1 target`;
      item.append(label, ratio);
      contrastList.append(item);
    }
    const groups = get("color-roles");
    groups.replaceChildren();
    for (const role of Object.keys(roleLabels) as ColorRole[]) {
      const entries = Object.entries(palette.colors)
        .filter(([id]) => palette.roles[id] === role)
        .sort(([left], [right]) => left.localeCompare(right));
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = `${roleLabels[role]} · ${entries.length}`;
      const list = document.createElement("ul");
      list.className = "role-list";
      for (const [id, color] of entries) {
        const item = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className = "color-swatch";
        swatch.setAttribute("aria-hidden", "true");
        if (isThemeColor(color)) swatch.style.backgroundColor = color;
        const name = document.createElement("code");
        name.textContent = id;
        const value = document.createElement("span");
        value.className = "color-value";
        value.textContent = color.toUpperCase();
        item.append(swatch, name, value);
        list.append(item);
      }
      section.append(heading, list);
      groups.append(section);
    }
  }

  function receiveState(incoming: AppState): void {
    if (!incoming || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0) {
      throw new Error("The extension sent an invalid state revision.");
    }
    const parameters = parseParameters(incoming.parameters);
    const syntaxParameters = parseSyntaxParameters(incoming.syntax?.parameters);
    if (typeof incoming.workspaceAvailable !== "boolean" || typeof incoming.recoveryPending !== "boolean") {
      throw new Error("The extension sent invalid settings availability or recovery state.");
    }
    const receivedDrafts = new Map<ThemeMode, ThemeDraft>();
    for (const [key, value] of Object.entries(requireRecord(incoming.drafts, "Theme drafts"))) {
      const mode = parseThemeMode(key);
      const draft = requireRecord(value, `${mode} draft`);
      const parameters = parseParameters(draft.parameters);
      if (parameters.mode !== mode) throw new Error("A cached theme draft has the wrong mode.");
      receivedDrafts.set(mode, { parameters, syntaxParameters: parseSyntaxParameters(draft.syntaxParameters) });
    }
    if (!isRecord(incoming.palette?.colors) || !isRecord(incoming.palette?.roles) ||
        !isRecord(incoming.palette?.coverage) || !Array.isArray(incoming.evaluation?.contrast) ||
        !isRecord(incoming.baseline) || !isRecord(incoming.model) ||
        !Array.isArray(incoming.syntax.palette?.tokenColors) || !Array.isArray(incoming.syntax.contrast) ||
        !isRecord(incoming.syntax.brackets?.colors) || !isRecord(incoming.syntax.brackets.contrast)) {
      throw new Error("The extension sent an incomplete palette state.");
    }
    if (!isRecord(incoming.syntax.resolved?.colors) || !Number.isFinite(incoming.syntax.resolved.chromaBoost)) {
      throw new Error("The extension sent incomplete resolved syntax controls.");
    }
    if (!state) hostError = "";
    acknowledgedRevision = Math.max(acknowledgedRevision, incoming.revision);
    const stale = incoming.revision < localRevision;
    if (state && stale) {
      // Acknowledgements may describe an older draft, but host-owned operation flags still matter.
      state = {
        ...state, livePreview: incoming.livePreview, workspaceAvailable: incoming.workspaceAvailable,
        recoveryPending: incoming.recoveryPending, busy: incoming.busy, status: incoming.status
      };
    } else {
      if (state) drafts.set(state.parameters.mode, {
        parameters: structuredClone(state.parameters), syntaxParameters: structuredClone(state.syntax.parameters)
      });
      for (const [mode, draft] of receivedDrafts) drafts.set(mode, draft);
      drafts.set(parameters.mode, {
        parameters: structuredClone(parameters), syntaxParameters: structuredClone(syntaxParameters)
      });
      state = {
        ...incoming, parameters, syntax: { ...incoming.syntax, parameters: syntaxParameters },
        drafts: Object.fromEntries(drafts)
      };
      localRevision = Math.max(localRevision, incoming.revision);
      pendingParameters = false;
      clearDebounce();
      if (recoveryRequested) {
        generationError = "";
        recoveryRequested = false;
      }
      commandNotice = "";
      renderPalette();
    }
    renderControls();
    renderChrome();
  }

  const initializationTimer = window.setTimeout(() => {
    if (!state && !hostError) {
      hostError = "The extension has not supplied fitted defaults. Reopen Themer Lab to reconnect; no fallback palette has been generated.";
      renderChrome();
    }
  }, 12000);
  window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    const message = event.data;
    if (!isRecord(message)) return;
    try {
      if (message.type === "state") {
        receiveState(message.state);
        window.clearTimeout(initializationTimer);
      } else if (message.type === "error") {
        hostError = typeof message.message === "string" ? message.message : "The extension reported an unknown error.";
        commandNotice = "";
        renderControls();
        renderChrome();
      }
    } catch (error) {
      hostError = `Could not display the extension state: ${errorText(error)}`;
      renderControls();
      renderChrome();
    }
  });
  window.addEventListener("unload", () => {
    clearDebounce();
    window.clearTimeout(initializationTimer);
  });
  renderControls();
  renderPalette();
  renderChrome();
  post({ type: "ready" });
}

try {
  const root = document.getElementById("app");
  if (!root) throw new Error("The host did not provide the required #app element.");
  mount(root);
} catch (error) {
  const alert = document.createElement("p");
  alert.className = "error-message";
  alert.setAttribute("role", "alert");
  alert.textContent = `Themer Lab could not initialize: ${errorText(error)}`;
  (document.getElementById("app") ?? document.body).replaceChildren(alert);
}
