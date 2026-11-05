# Themer Lab model evaluation

Baseline: **2026 Light**, VS Code **1.143.1** (e646868227c3e3a9e3f24277c8c7220be42c0be7).

340 explicit workbench entries; 113 ordered syntax rules; 4 semantic token styles.
This is an explicit theme-chain capture, not registered defaults or a runtime-resolved palette. Syntax has its own generator and native-editor report; it is not scored here.

## Method and limitations

- Euclidean OKLab distance multiplied by 100; NOT CIEDE2000.
- Primary: Raw, unpremultiplied source RGB converted to OKLab. Alpha is not included in deltaE.
- Tolerance: **3**. Percentage of generated colors whose raw deltaE <= tolerance; this rate does not test alpha or contrast. RGB black/white endpoints are canonical; no threshold epsilon is added.
- Alpha: Absolute difference in alpha on [0,1], reported independently; exactMatchPercent requires equal alpha.
- Rendered: Secondary approximation: encoded-sRGB source-over, then Euclidean OKLab x 100. Each palette uses its own explicit state/subsystem background and an explicit editor fallback where needed.
- No runtime layer tree is available. Background choices are heuristics; nested overlays, CSS effects, and actual compositing space may differ. Composition is quantized to 8-bit hex at each layer. Missing backdrops are listed, not invented.
- Percentiles: Linear interpolation between sorted sample values at (count - 1) * quantile.
- Zero samples produce numeric zeros and a 0% success rate, not a claim of perfect fidelity.
- Preserved workbench colors, unresolved/null entries, unscored supplemental tokens, syntax rules, and semantic token styles never inflate generated fit statistics.
- Info defaults to an accent/foreground link or remembered custom seed. Warning/Error and Added/Deleted/Modified stay independent. Added/Deleted drive chat counters; edited files follow Modified. Prominent status items share primary-button fills/readable text/hover. Suggestion text/icons/matches use explicit text colors independent of Quick Pick/button text. Inline-code foreground follows the accent with a 4.5:1 contrast guard against its unchanged background. Scrollbar/minimap thumbs and scrollbar shadows retain fixed opacities independently of Overlay opacity. Inactive selections cap opacity; interactive generation also protects code text. Classic and pinned Modern counterparts are always modeled; supported missing IDs are unscored and nulls stay unresolved. Personality switches default off: active accent text at Primary foreground lightness, bounded to 0.2-0.9 for chromatic accents before contrast adjustment, with native decoration precedence; accent tint across nonsemantic overlays and opaque interaction fills, with neutral painted chroma capped against active selection at current opacity on the region backdrop while retaining alpha/lightness; quieter 35% tint on scrollbars/minimap/shadows/grips; Neutral 7 brackets; native status fills from accent/resolved Color 2/quiet surfaces. Semantic overlays retain their hues. These variants are not native reconstruction. This baseline has all switches off and preserves debug/remote statuses, conflicts, ignored files, terminal ANSI and unrelated statuses.
- chat.slashCommandBackground and chat.slashCommandForeground remain generated from shared accent families. Their source blue palette differs from the default teal accent. Remaining color/alpha errors are reported for human review, not hidden by preservation.
- WCAG relative sRGB luminance. Text target 4.5:1 and illustrative focus-indicator target 3:1; missing pairs are omitted and transparent pairs are approximated.
- Only explicit values in the bundled theme include chain are captured.
- Registered VS Code defaults, extension-contributed defaults, and user customizations are not captured.
- Alpha values are source colors, not runtime-composited pixels.
- Missing and null colors are not replaced with invented defaults.

**No quality acceptance is asserted. Human review in the actual VS Code UI is required.**

## Model complexity and raw source-color fidelity

| Controls | Fixed rules | Generated (scored) | Preserved (excluded) | Unresolved | Additional unscored | Mean ΔE | p50 | p95 | Max | Raw within tolerance |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 19 | 53 | 308 | 32 | 0 | 45 | 2.222 | 0.000 | 15.023 | 49.321 | 87.662% |

## Alpha and approximate rendered fidelity

| Alpha mean | Alpha max | Exact alpha matches | Transparent entries | Transparent alpha mean / max | Rendered samples | Unavailable | Rendered mean ΔE | p50 | p95 | Max | Rendered within tolerance |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.012 | 1.000 | 94.481% | 51 | 0.072 / 1.000 | 308 | 0 | 2.047 | 0.000 | 10.879 | 52.163 | 88.312% |

Rendered scores cannot replace raw color or alpha errors. A fully transparent wrong RGB value can have zero rendered error.

## Interpretable fixed rules

Explicit Light 2026 anchors with light-specific shared families, opacities and selectors; no per-token numeric residuals.

53 fixed rules / numeric coefficients: 26 shared color transforms, 18 shared opacity transforms, and linked Info/selection plus Personality tint/contrast constants. 199 semantic selectors (including counterpart aliases, optional assignments, preservation patterns and the preserve-unknown fallback).
These are hand-specified family rules, not learned per-token corrections. Learned coefficients: 0; per-token numeric residuals: 0.

Anchors: background from `editor.background`, foreground from `foreground`, accent from `button.background`, info from `notificationsInfoIcon.foreground`, warning from `notificationsWarningIcon.foreground`, error from `errorForeground`, added from `gitDecoration.addedResourceForeground`, deleted from `gitDecoration.deletedResourceForeground`, modified from `gitDecoration.modifiedResourceForeground`. Missing or non-opaque fit anchors cause an error.

- **background**: Structural layers use L = background.L + sign(foreground.L - background.L) * amount * surfaceSpread; keep background a,b. Light selection, active and hover fills use surfaceSpread 1, independent of signed structural separation, so inverted layers do not erase state cues and large separation does not over-darken them. Borders and accent/status backgrounds remain independent.
- **foreground**: L = background.L + (foreground.L - background.L) * amount; keep foreground a,b. Muted text amounts (<1) scale by mutedContrast.
- **border**: Signed borderStrength scales neutral border lightness offsets around the canvas. Zero matches canvas RGB; negative reverses the foreground direction. Foreground-derived border a,b also pivot around the canvas. Alpha, clear borders, and accent borders are unchanged.
- **accent**: Light-specific accent offsets keep links/focus at the accent and darken button hover instead of brightening it.
- **onAccent**: Text on generated accent fills selects opaque black or white, whichever has higher WCAG contrast with the gamut-mapped sRGB accent background. This is independent of the primary foreground input.
- **info**: Linked Info adds 0.02 OKLCH lightness to the Light accent/foreground, preserving hue and limiting chroma only for sRGB. Custom stays unchanged.
- **source**: Use the resolved severity/change source. Light validation backgrounds use a quieter 0.08 canvas/source mix and borders use the source directly. Diff word opacity is 0.15 in Light; other change semantics remain shared.
- **alpha**: Fixed opacity; multiply non-opaque opacities by overlayOpacity and clamp to [0,1], except scrollbar/minimap thumbs and scrollbar shadows, which retain their distinct fixed opacities.
- **inlineCode**: Inline-code foreground starts at the accent hue, chroma and lightness. Reuse the accent-text contrast search to adjust lightness/gamut only as needed for 4.5:1 against the unchanged textPreformat background. Explicit null colors remain unresolved.
- **inactiveSelection**: Preserve generated RGB, including optional tint; reduce inactive-selection alpha only when needed for 4.5:1 primary/code text contrast after sRGB compositing on canvas. Test both encoded alpha and VS Code's two-decimal CSS alpha. If the canvas already fails, never reduce its existing contrast. Choose the highest safe 8-bit alpha at or below requested opacity. Other selection states and syntax colors remain unchanged by the guard.
- **personality**: Default-off switches: active text starts at Primary foreground lightness with the accent hue/chroma, limited to gamut. Chromatic accents bound that preferred lightness to 0.2-0.9 so nearly black/white primary text retains room for visible color; contrast may adjust it further. Gray accents retain Primary foreground. Native file decorations retain precedence. Nonsemantic opacity-controlled colors share a tint: L moves 65% toward accent L and C is min(accent.C * 0.65, 0.14), gamut-limited at the accent hue. Opaque selected/inactive-selection/activity/hover fills participate too, retaining their existing lightness. Neutral interaction fills cap painted chroma to the shared active-selection tint at the current Overlay opacity over their region backdrop, including native CSS alpha rounding and a floor for existing backdrop color. This prevents opaque/high-opacity inactive fills from becoming much more saturated than active ones; source alpha/lightness are preserved. The cap follows opacity changes without suppressing the stronger active tint. Scrollbar/minimap sliders, shadows and resize grips keep the quieter 35% tint. Accents below C 0.01 leave colors unchanged. Alpha remains exact except the existing inactive-selection safety cap; opaque surfaces stay opaque while their saturation cap follows active selection strength. Semantic severity/change/preserved colors keep their meaning. Resolved Neutral 7 optionally replaces all six bracket levels. Status fills use accent/resolved Color 2/quiet surface for native normal/debug/no-folder states; remote items remain separate.
- **clipping**: Clamp OKLab/OKLCH lightness to [0,1], then culori OKLCH-to-sRGB gamut mapping and 8-bit hex quantization.

| Family | Anchor | Amount |
| --- | --- | ---: |
| canvas | background | 0 |
| chrome | background | 0.012 |
| raised | background | 0.012 |
| control | background | 0.063 |
| selected | background | 0.125 |
| active | background | 0.05 |
| text | foreground | 1 |
| muted | foreground | 0.675 |
| disabled | foreground | 0.425 |
| faint | foreground | 0.275 |
| strongText | foreground | 1.32 |
| selectedText | foreground | 1 |
| slider | foreground | 0.655 |
| border | background | 0.043 |
| controlBorder | background | 0.12 |
| strongBorder | background | 0.38 |
| accent | accent | 0 |
| accentHover | accent | -0.025 |
| accentFocus | accent | 0 |
| accentLink | accent | 0 |
| accentLinkHover | accent | 0 |
| accentSelection | accent | 0 |
| sourceColor | source | 1 |
| sourceBackground | source | 0.08 |
| sourceBorder | source | 1 |
| clear | black | 0 |

Opacity rules: opaque=1, clear=0, quiet=0.075, subtle=0.083, hover=0.145, active=0.2, highlight=0.15, selection=0.25, inactiveSelection=0.1, focus=1, strongSelection=0.6, overlay=0.15, grip=0.4, slider=0.75, sliderHover=0.815, sliderActive=0.878, controlBorder=0.4, commandBorder=0.667.

Severity and change selectors run before generic preservation. Info/Warning/Error and Added/Deleted/Modified are independent of each other, UI accent, and syntax. Conflicts, ignored files, success/chart/terminal ANSI palettes, and unknown identifiers remain preserved. Every preserved ID and ordered selector is listed in model-evaluation.json.

## Controls and generated palette

Controls: mode, background, foreground, accent, info, warning, error, added, deleted, modified, infoSource, surfaceSpread, mutedContrast, borderStrength, overlayOpacity, accentActiveItems, tintNeutralOverlays, monochromeBrackets, statefulStatusBar. All controls are active; there is no model-size selection.

Parameters: `{"mode":"light","background":"#ffffff","foreground":"#202020","accent":"#0069cc","info":"#0069cc","warning":"#b69500","error":"#ad0707","added":"#587c0c","deleted":"#ad0707","modified":"#667309","accentActiveItems":false,"tintNeutralOverlays":false,"monochromeBrackets":false,"statefulStatusBar":false,"infoSource":"accent","surfaceSpread":1,"mutedContrast":1,"borderStrength":1,"overlayOpacity":1}`

Generated reference roles: surface 83, text 86, border 54, accent 51, info 3, warning 8, error 8, added 5, deleted 5, modified 5. Preserved exceptions: 32 (excluded).
Unresolved IDs: none.
Supplemental generated IDs without a captured reference (excluded from fidelity): editorInfo.foreground, editorWarning.foreground, editorError.foreground, chat.linesAddedForeground, chat.linesRemovedForeground, gitDecoration.renamedResourceForeground, minimapGutter.addedBackground, minimapGutter.deletedBackground, minimapGutter.modifiedBackground, diffEditor.insertedLineBackground, diffEditor.removedLineBackground, diffEditorGutter.insertedLineBackground, diffEditorGutter.removedLineBackground, diffEditorOverview.insertedForeground, diffEditorOverview.removedForeground, scmGraph.historyItemHoverAdditionsForeground, scmGraph.historyItemHoverDeletionsForeground, mergeEditor.change.background, mergeEditor.change.word.background, mergeEditor.changeBase.background, mergeEditor.changeBase.word.background, editorSuggestWidget.focusHighlightForeground, modernUI.shellBackground, modernUI.inactiveShellBackground, modernPanel.border, modernTab.activeBackground, modernTab.activeForeground, modernTab.hoverBackground, modernTab.hoverForeground, modernEditorTab.activeBackground, modernEditorTab.activeActionBackground, modernEditorTab.activeForeground, modernEditorTab.activeHoverBackground, modernEditorTab.activeHoverActionBackground, modernEditorTab.inactiveBackground, modernEditorTab.hoverBackground, modernEditorTab.hoverActionBackground, modernEditorTab.hoverForeground, modernEditorTab.selectedActionBackground, modernActivityBar.background, modernActivityBar.inactiveBackground, editor.border, modernSash.gripForeground, activityBarTop.foreground, list.inactiveSelectionIconForeground.
Rendered-unavailable IDs: none.

### Contrast checks (advisory, not acceptance)

| Check | Rendered foreground | Rendered background | Ratio | Target | Result |
| --- | --- | --- | ---: | ---: | --- |
| Active item tab.activeForeground | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Active item hover tab.activeForeground | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Active item tab.unfocusedActiveForeground | #606060 | #fbfbfb | 6.077 | 4.5 | pass |
| Active item hover tab.unfocusedActiveForeground | #606060 | #ffffff | 6.289 | 4.5 | pass |
| Active item tab.selectedForeground | #000000 | #d6d6d6 | 14.449 | 4.5 | pass |
| Active item modernTab.activeForeground | #202020 | #eaeaea | 13.543 | 4.5 | pass |
| Active item hover modernTab.activeForeground (sRGB compositing approximation) | #202020 | #e8e8e8 | 13.298 | 4.5 | pass |
| Active item modernEditorTab.activeForeground | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Active item hover modernEditorTab.activeForeground | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Active item activityBar.foreground | #202020 | #d6d6d6 | 11.210 | 4.5 | pass |
| Active item modernActivityBarItem.activeForeground | #202020 | #eaeaea | 13.543 | 4.5 | pass |
| Active item hover modernActivityBarItem.activeForeground | #202020 | #eeeeee | 14.043 | 4.5 | pass |
| Active item panelTitle.activeForeground | #202020 | #fbfbfb | 15.745 | 4.5 | pass |
| Active item menu.selectionForeground (sRGB compositing approximation) | #202020 | #e1ecf6 | 13.601 | 4.5 | pass |
| Active item menubar.selectionForeground | #202020 | #eaeaea | 13.543 | 4.5 | pass |
| Active item list.activeSelectionForeground (sRGB compositing approximation) | #202020 | #d7d7d7 | 11.321 | 4.5 | pass |
| Active item list.activeSelectionIconForeground (sRGB compositing approximation) | #000000 | #d7d7d7 | 14.591 | 4.5 | pass |
| Active item list.inactiveSelectionForeground (sRGB compositing approximation) | #202020 | #e5e5e5 | 12.934 | 4.5 | pass |
| Active item list.inactiveSelectionIconForeground (sRGB compositing approximation) | #202020 | #e5e5e5 | 12.934 | 4.5 | pass |
| Active item list.focusForeground (sRGB compositing approximation) | #202020 | #d7d7d7 | 11.321 | 4.5 | pass |
| Status bar text | #606060 | #fbfbfb | 6.077 | 4.5 | pass |
| Debug status bar text | #ffffff | #0069CC | 5.395 | 4.5 | pass |
| No-folder status bar text | #606060 | #fbfbfb | 6.077 | 4.5 | pass |
| Status item hover text | #000000 | #d6d6d6 | 14.449 | 4.5 | pass |
| Remote status item text | #ffffff | #005FB8 | 6.308 | 4.5 | pass |
| Editor text | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Workbench text on editor | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Muted description on editor (context approximation) | #606060 | #ffffff | 6.289 | 4.5 | pass |
| Input text | #202020 | #ffffff | 16.293 | 4.5 | pass |
| Primary button text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Primary button hover text | #ffffff | #0061c4 | 5.988 | 4.5 | pass |
| Prominent status item text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Prominent status item hover text | #ffffff | #0061c4 | 5.988 | 4.5 | pass |
| Primary text on inactive editor selection (sRGB compositing approximation) | #202020 | #e5f0fa | 14.102 | 4.5 | pass |
| Prominent extension button text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Prominent extension button hover text | #ffffff | #0061c4 | 5.988 | 4.5 | pass |
| Badge text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Activity bar badge text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Agents badge text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Agents unread badge text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Quick input focus text | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Quick input focus highlight | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Quick input focus icon | #ffffff | #0069cc | 5.395 | 4.5 | pass |
| Suggestion text (sRGB compositing approximation) | #202020 | #d6d6d6 | 11.210 | 4.5 | pass |
| Suggestion icon (sRGB compositing approximation) | #202020 | #d6d6d6 | 11.210 | 4.5 | pass |
| Suggestion match highlight (sRGB compositing approximation) | #202020 | #d6d6d6 | 11.210 | 4.5 | pass |
| Inline code | #0067c8 | #eaeaea | 4.625 | 4.5 | pass |
| Info validation text | #202020 | #edf4fd | 14.710 | 4.5 | pass |
| Warning validation text | #202020 | #f9f7ee | 15.181 | 4.5 | pass |
| Error validation text | #202020 | #fbedeb | 14.288 | 4.5 | pass |
| Warning badge text | #000000 | #b69500 | 7.288 | 4.5 | pass |
| Error badge text | #ffffff | #ad0707 | 7.472 | 4.5 | pass |
| Info notification icon | #0e6fd3 | #fbfbfb | 4.794 | 3 | pass |
| Warning notification icon | #b69500 | #fbfbfb | 2.785 | 3 | fail |
| Error notification icon | #ad0707 | #fbfbfb | 7.221 | 3 | pass |
| Editor info mark (non-text approximation) | #0e6fd3 | #ffffff | 4.961 | 3 | pass |
| Editor warning mark (non-text approximation) | #b69500 | #ffffff | 2.881 | 3 | fail |
| Editor error mark (non-text approximation) | #ad0707 | #ffffff | 7.472 | 3 | pass |
| Sidebar text | #202020 | #fbfbfb | 15.745 | 4.5 | pass |
| Added file label | #587c0c | #fbfbfb | 4.716 | 4.5 | pass |
| Deleted file label | #ad0707 | #fbfbfb | 7.221 | 4.5 | pass |
| Modified file label | #667309 | #fbfbfb | 5.047 | 4.5 | pass |
| Inactive tab text | #606060 | #fbfbfb | 6.077 | 4.5 | pass |
| Selected list text (context approximation) (sRGB compositing approximation) | #202020 | #d7d7d7 | 11.321 | 4.5 | pass |
| Focus indicator on editor (non-text approximation) | #0069cc | #ffffff | 5.395 | 3 | pass |

### Worst raw source-color outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| list.focusAndSelectionOutline | border | #005FB8 | #f1f1f1 | 49.321 | 0.000 | 49.321 | opaque |
| editorCommentsWidget.rangeBackground | accent | #EEF4FB | #0069cc26 | 46.527 | 0.851 | 4.097 | editor.background |
| peekView.border | border | #0069CC | #f1f1f1 | 46.332 | 0.000 | 46.332 | opaque |
| editorCommentsWidget.rangeActiveBackground | accent | #E6EDFA | #0069cc26 | 44.390 | 0.851 | 2.073 | editor.background |
| editorSuggestWidget.highlightForeground | text | #0069CC | #202020 | 33.370 | 0.000 | 33.370 | opaque |
| chat.slashCommandBackground | accent | #ADCEFF7A | #0069cc26 | 33.015 | 0.329 | 1.390 | sideBar.background |
| tab.selectedForeground | text | #333333 | #000000 | 32.109 | 0.000 | 32.109 | opaque |
| editorOverviewRuler.modifiedForeground | modified | #0069CC | #667309 | 27.314 | 0.000 | 27.314 | opaque |
| editorGutter.modifiedBackground | modified | #005FB8 | #667309 | 26.190 | 0.000 | 26.190 | opaque |
| activityWarningBadge.foreground | warning | #202020 | #000000 | 24.353 | 0.000 | 24.353 | opaque |
| problemsWarningIcon.foreground | warning | #895503 | #b69500 | 19.326 | 0.000 | 19.326 | opaque |
| tab.selectedBorderTop | accent | #68a3da | #0069cc | 18.395 | 0.000 | 18.395 | opaque |

### Retained generated slash-command mismatches (human review)

chat.slashCommandBackground and chat.slashCommandForeground remain generated from shared accent families. Their source blue palette differs from the default teal accent. Remaining color/alpha errors are reported for human review, not hidden by preservation.

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| chat.slashCommandBackground | accent | #ADCEFF7A | #0069cc26 | 33.015 | 0.329 | 1.390 | sideBar.background |
| chat.slashCommandForeground | accent | #26569E | #0069cc | 8.291 | 0.000 | 8.291 | opaque |

### Worst alpha outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| terminal.tab.activeBorder | accent | #005FB8 | #0069cc00 | 3.964 | 1.000 | 52.163 | panel.background |
| editorCommentsWidget.rangeActiveBackground | accent | #E6EDFA | #0069cc26 | 44.390 | 0.851 | 2.073 | editor.background |
| editorCommentsWidget.rangeBackground | accent | #EEF4FB | #0069cc26 | 46.527 | 0.851 | 4.097 | editor.background |
| agentsPanel.border | border | #E4E5E6AA | #f1f1f1 | 3.677 | 0.333 | 0.985 | agentsPanel.background |
| chat.slashCommandBackground | accent | #ADCEFF7A | #0069cc26 | 33.015 | 0.329 | 1.390 | sideBar.background |
| statusBarItem.prominentBackground | accent | #0069CCDD | #0069cc | 0.000 | 0.133 | 5.498 | statusBar.background |

### Worst approximate rendered outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| terminal.tab.activeBorder | accent | #005FB8 | #0069cc00 | 3.964 | 1.000 | 52.163 | panel.background |
| list.focusAndSelectionOutline | border | #005FB8 | #f1f1f1 | 49.321 | 0.000 | 49.321 | opaque |
| peekView.border | border | #0069CC | #f1f1f1 | 46.332 | 0.000 | 46.332 | opaque |
| editorSuggestWidget.highlightForeground | text | #0069CC | #202020 | 33.370 | 0.000 | 33.370 | opaque |
| tab.selectedForeground | text | #333333 | #000000 | 32.109 | 0.000 | 32.109 | opaque |
| editorOverviewRuler.modifiedForeground | modified | #0069CC | #667309 | 27.314 | 0.000 | 27.314 | opaque |

## Source provenance

- `extensions/theme-defaults/themes/light_vs.json` — SHA-256 `fa7d01466a6a32a2b7be30529d12b1fec528959aa5e9938e1a9802550bf19a52`
- `extensions/theme-defaults/themes/light_plus.json` — SHA-256 `bf64f3ec2a80788fad115086bd10fd4136dd1d760ec478f4107756f098d101ea`
- `extensions/theme-defaults/themes/light_modern.json` — SHA-256 `7dab7baec54f572441013a7896cc438b2e55fbdaf383fb2ee6e2c78d33316d3c`
- `extensions/theme-defaults/themes/2026-light.json` — SHA-256 `33c2eeb1813ec9f90cb083d111020b42050a3403e41cfbe0059ad86c5aa05fea`

Full unrounded metrics, selectors, preserved IDs, per-color raw/alpha/rendered errors, and background choices: [model-evaluation-light.json](model-evaluation-light.json).
