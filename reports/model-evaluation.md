# Themer Lab model evaluation

Baseline: **2026 Dark**, VS Code **1.143.0** (2d0b7506a36c1d6db9a466440131a8e01eab2289).

324 explicit workbench entries; 118 ordered syntax rules; 4 semantic token styles.
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
| 19 | 51 | 305 | 19 | 0 | 48 | 1.785 | 0.333 | 8.518 | 100.000 | 89.180% |

## Alpha and approximate rendered fidelity

| Alpha mean | Alpha max | Exact alpha matches | Transparent entries | Transparent alpha mean / max | Rendered samples | Unavailable | Rendered mean ΔE | p50 | p95 | Max | Rendered within tolerance |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.002 | 0.251 | 92.131% | 59 | 0.013 / 0.251 | 305 | 0 | 1.591 | 0.340 | 6.386 | 100.000 | 89.180% |

Rendered scores cannot replace raw color or alpha errors. A fully transparent wrong RGB value can have zero rendered error.

## Interpretable fixed rules

Explicit anchor colors with fixed semantic families; no optimization or per-token numeric residuals.

51 fixed rules / numeric coefficients: 26 shared color transforms, 16 shared opacity transforms, and linked Info/selection plus Personality tint/contrast constants. 162 semantic selectors (including counterpart aliases, optional assignments, preservation patterns and the preserve-unknown fallback).
These are hand-specified family rules, not learned per-token corrections. Learned coefficients: 0; per-token numeric residuals: 0.

Anchors: background from `editor.background`, foreground from `foreground`, accent from `button.background`, info from `notificationsInfoIcon.foreground`, warning from `notificationsWarningIcon.foreground`, error from `errorForeground`, added from `gitDecoration.addedResourceForeground`, deleted from `gitDecoration.deletedResourceForeground`, modified from `gitDecoration.modifiedResourceForeground`. Missing or non-opaque fit anchors cause an error.

- **background**: L = background.L + sign(foreground.L - background.L) * amount * surfaceSpread; keep background a,b. Zero flattens canvas-derived layers; negative separation reverses their order. Borders, foreground-derived overlays and accent/status backgrounds are independent.
- **foreground**: L = background.L + (foreground.L - background.L) * amount; keep foreground a,b. Muted text amounts (<1) scale by mutedContrast.
- **border**: Signed borderStrength scales neutral border lightness offsets around the canvas. Zero matches canvas RGB; negative reverses the foreground direction. Foreground-derived border a,b also pivot around the canvas. Alpha, clear borders, and accent borders are unchanged.
- **accent**: L = accent.L + amount; keep accent chroma and hue. Adjust the source color to change saturation or lightness.
- **onAccent**: Text on generated accent fills selects opaque black or white, whichever has higher WCAG contrast with the gamut-mapped sRGB accent background. This is independent of the primary foreground input.
- **info**: Info defaults to the accent source. Accent/foreground links add 0.08 OKLCH lightness, preserving hue and reducing chroma only when needed to fit sRGB. Custom uses the independent Info seed unchanged; linked modes retain that seed. The default linked mark stays within tolerance 3 of the captured native Info color.
- **source**: Use the resolved Info color or matching Warning/Error/change input directly for marks, labels and filled badges. Validation backgrounds/borders mix the canvas and source in OKLab. Diff/merge backgrounds use the selected change color with shared translucent opacities; normal diff replacements are removed plus inserted. Badge text chooses black/white by contrast. Syntax is generated independently.
- **alpha**: Fixed opacity; multiply non-opaque opacities by overlayOpacity and clamp to [0,1], except scrollbar/minimap thumbs and scrollbar shadows, which retain their distinct fixed opacities.
- **inlineCode**: Inline-code foreground starts at the accent hue, chroma and lightness. Reuse the accent-text contrast search to adjust lightness/gamut only as needed for 4.5:1 against the unchanged textPreformat background. Explicit null colors remain unresolved.
- **inactiveSelection**: Preserve generated RGB, including optional tint; reduce inactive-selection alpha only when needed for 4.5:1 primary/code text contrast after sRGB compositing on canvas. Test both encoded alpha and VS Code's two-decimal CSS alpha. If the canvas already fails, never reduce its existing contrast. Choose the highest safe 8-bit alpha at or below requested opacity. Other selection states and syntax colors remain unchanged by the guard.
- **personality**: Default-off switches: active text starts at Primary foreground lightness with the accent hue/chroma, limited to gamut. Chromatic accents bound that preferred lightness to 0.2-0.9 so nearly black/white primary text retains room for visible color; contrast may adjust it further. Gray accents retain Primary foreground. Native file decorations retain precedence. Nonsemantic opacity-controlled colors share a tint: L moves 65% toward accent L and C is min(accent.C * 0.65, 0.14), gamut-limited at the accent hue. Opaque selected/inactive-selection/activity/hover fills participate too, retaining their existing lightness. Neutral interaction fills cap painted chroma to the shared active-selection tint at the current Overlay opacity over their region backdrop, including native CSS alpha rounding and a floor for existing backdrop color. This prevents opaque/high-opacity inactive fills from becoming much more saturated than active ones; source alpha/lightness are preserved. The cap follows opacity changes without suppressing the stronger active tint. Scrollbar/minimap sliders, shadows and resize grips keep the quieter 35% tint. Accents below C 0.01 leave colors unchanged. Alpha remains exact except the existing inactive-selection safety cap; opaque surfaces stay opaque while their saturation cap follows active selection strength. Semantic severity/change/preserved colors keep their meaning. Resolved Neutral 7 optionally replaces all six bracket levels. Status fills use accent/resolved Color 2/quiet surface for native normal/debug/no-folder states; remote items remain separate.
- **clipping**: Clamp OKLab/OKLCH lightness to [0,1], then culori OKLCH-to-sRGB gamut mapping and 8-bit hex quantization.

| Family | Anchor | Amount |
| --- | --- | ---: |
| canvas | background | 0 |
| chrome | background | 0.03 |
| raised | background | 0.06 |
| control | background | 0.08 |
| selected | background | 0.13 |
| active | background | 0.22 |
| text | foreground | 1 |
| muted | foreground | 0.73 |
| disabled | foreground | 0.43 |
| faint | foreground | 0.33 |
| strongText | foreground | 1.32 |
| selectedText | foreground | 1.23 |
| slider | foreground | 0.9 |
| border | background | 0.11 |
| controlBorder | background | 0.14 |
| strongBorder | background | 0.42 |
| accent | accent | 0 |
| accentHover | accent | 0.01 |
| accentFocus | accent | 0.09 |
| accentLink | accent | 0.13 |
| accentLinkHover | accent | 0.15 |
| accentSelection | accent | -0.06 |
| sourceColor | source | 1 |
| sourceBackground | source | 0.25 |
| sourceBorder | source | 0.75 |
| clear | black | 0 |

Opacity rules: opaque=1, clear=0, quiet=0.075, subtle=0.1, hover=0.13, active=0.2, highlight=0.3, selection=0.5, inactiveSelection=0.38, focus=0.7, strongSelection=0.87, overlay=0.15, grip=0.4, slider=0.52, sliderHover=0.56, sliderActive=0.61.

Severity and change selectors run before generic preservation. Info/Warning/Error and Added/Deleted/Modified are independent of each other, UI accent, and syntax. Conflicts, ignored files, success/chart/terminal ANSI palettes, and unknown identifiers remain preserved. Every preserved ID and ordered selector is listed in model-evaluation.json.

## Controls and generated palette

Controls: mode, background, foreground, accent, info, warning, error, added, deleted, modified, infoSource, surfaceSpread, mutedContrast, borderStrength, overlayOpacity, accentActiveItems, tintNeutralOverlays, monochromeBrackets, statefulStatusBar. All controls are active; there is no model-size selection.

Parameters: `{"mode":"dark","background":"#121314","foreground":"#bfbfbf","accent":"#297aa0","info":"#3a94bc","warning":"#cca700","error":"#f48771","added":"#73c991","deleted":"#f48771","modified":"#e5ba7d","accentActiveItems":false,"tintNeutralOverlays":false,"monochromeBrackets":false,"statefulStatusBar":false,"infoSource":"accent","surfaceSpread":1,"mutedContrast":1,"borderStrength":1,"overlayOpacity":1}`

Generated reference roles: surface 85, text 82, border 51, accent 52, info 3, warning 7, error 8, added 6, deleted 6, modified 5. Preserved exceptions: 19 (excluded).
Unresolved IDs: none.
Supplemental generated IDs without a captured reference (excluded from fidelity): editorInfo.foreground, editorWarning.foreground, editorError.foreground, chat.linesAddedForeground, chat.linesRemovedForeground, gitDecoration.renamedResourceForeground, minimapGutter.addedBackground, minimapGutter.deletedBackground, minimapGutter.modifiedBackground, diffEditorGutter.insertedLineBackground, diffEditorGutter.removedLineBackground, diffEditorOverview.insertedForeground, diffEditorOverview.removedForeground, scmGraph.historyItemHoverAdditionsForeground, scmGraph.historyItemHoverDeletionsForeground, mergeEditor.change.background, mergeEditor.change.word.background, mergeEditor.changeBase.background, mergeEditor.changeBase.word.background, statusBarItem.prominentHoverForeground, editorSuggestWidget.selectedForeground, editorSuggestWidget.selectedIconForeground, editorSuggestWidget.focusHighlightForeground, modernUI.shellBackground, modernUI.inactiveShellBackground, modernPanel.border, modernTab.activeBackground, modernTab.activeForeground, modernTab.hoverBackground, modernTab.hoverForeground, modernEditorTab.activeBackground, modernEditorTab.activeActionBackground, modernEditorTab.activeForeground, modernEditorTab.activeHoverBackground, modernEditorTab.activeHoverActionBackground, modernEditorTab.inactiveBackground, modernEditorTab.hoverBackground, modernEditorTab.hoverActionBackground, modernEditorTab.hoverForeground, modernEditorTab.selectedActionBackground, modernActivityBar.background, modernActivityBar.inactiveBackground, editor.border, modernSash.gripForeground, modernActivityBarItem.activeForeground, modernActivityBarItem.hoverForeground, activityBarTop.foreground, list.inactiveSelectionIconForeground.
Rendered-unavailable IDs: none.

### Contrast checks (advisory, not acceptance)

| Check | Rendered foreground | Rendered background | Ratio | Target | Result |
| --- | --- | --- | ---: | ---: | --- |
| Active item tab.activeForeground | #bfbfbf | #121314 | 10.115 | 4.5 | pass |
| Active item hover tab.activeForeground | #bfbfbf | #191a1b | 9.478 | 4.5 | pass |
| Active item tab.unfocusedActiveForeground | #8b8b8b | #121314 | 5.460 | 4.5 | pass |
| Active item hover tab.unfocusedActiveForeground | #8b8b8b | #191a1b | 5.115 | 4.5 | pass |
| Active item tab.selectedForeground | #ffffff | #313233 | 12.847 | 4.5 | pass |
| Active item modernTab.activeForeground (sRGB compositing approximation) | #ededed | #373839 | 10.037 | 4.5 | pass |
| Active item hover modernTab.activeForeground (sRGB compositing approximation) | #ededed | #2a2b2c | 12.117 | 4.5 | pass |
| Active item modernEditorTab.activeForeground | #bfbfbf | #121314 | 10.115 | 4.5 | pass |
| Active item hover modernEditorTab.activeForeground | #bfbfbf | #191a1b | 9.478 | 4.5 | pass |
| Active item activityBar.foreground | #bfbfbf | #313233 | 6.986 | 4.5 | pass |
| Active item modernActivityBarItem.activeForeground (sRGB compositing approximation) | #bfbfbf | #373839 | 6.390 | 4.5 | pass |
| Active item hover modernActivityBarItem.activeForeground (sRGB compositing approximation) | #bfbfbf | #2a2b2c | 7.714 | 4.5 | pass |
| Active item panelTitle.activeForeground | #bfbfbf | #191a1b | 9.478 | 4.5 | pass |
| Active item menu.selectionForeground (sRGB compositing approximation) | #bfbfbf | #263239 | 7.148 | 4.5 | pass |
| Active item menubar.selectionForeground | #bfbfbf | #242627 | 8.266 | 4.5 | pass |
| Active item list.activeSelectionForeground (sRGB compositing approximation) | #ededed | #373839 | 10.037 | 4.5 | pass |
| Active item list.activeSelectionIconForeground (sRGB compositing approximation) | #ffffff | #373839 | 11.750 | 4.5 | pass |
| Active item list.inactiveSelectionForeground | #ededed | #313233 | 10.973 | 4.5 | pass |
| Active item list.inactiveSelectionIconForeground | #bfbfbf | #313233 | 6.986 | 4.5 | pass |
| Active item list.focusForeground (sRGB compositing approximation) | #bfbfbf | #373839 | 6.390 | 4.5 | pass |
| Status bar text | #8b8b8b | #191a1b | 5.115 | 4.5 | pass |
| Debug status bar text | #ffffff | #3994BC | 3.422 | 4.5 | fail |
| No-folder status bar text | #8b8b8b | #191a1b | 5.115 | 4.5 | pass |
| Status item hover text | #ffffff | #313233 | 12.847 | 4.5 | pass |
| Remote status item text | #ffffff | #0078D4 | 4.529 | 4.5 | pass |
| Editor text | #bfbfbf | #121314 | 10.115 | 4.5 | pass |
| Workbench text on editor | #bfbfbf | #121314 | 10.115 | 4.5 | pass |
| Muted description on editor (context approximation) | #8b8b8b | #121314 | 5.460 | 4.5 | pass |
| Input text | #bfbfbf | #191a1b | 9.478 | 4.5 | pass |
| Primary button text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Primary button hover text | #ffffff | #2d7da3 | 4.591 | 4.5 | pass |
| Prominent status item text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Prominent status item hover text | #ffffff | #2d7da3 | 4.591 | 4.5 | pass |
| Primary text on inactive editor selection (sRGB compositing approximation) | #bfbfbf | #113342 | 7.246 | 4.5 | pass |
| Prominent extension button text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Prominent extension button hover text | #ffffff | #2d7da3 | 4.591 | 4.5 | pass |
| Badge text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Activity bar badge text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Agents badge text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Agents unread badge text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Quick input focus text | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Quick input focus highlight | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Quick input focus icon | #ffffff | #297aa0 | 4.788 | 4.5 | pass |
| Suggestion text (sRGB compositing approximation) | #ededed | #414243 | 8.603 | 4.5 | pass |
| Suggestion icon (sRGB compositing approximation) | #ededed | #414243 | 8.603 | 4.5 | pass |
| Suggestion match highlight (sRGB compositing approximation) | #ededed | #414243 | 8.603 | 4.5 | pass |
| Inline code | #4896bd | #242627 | 4.613 | 4.5 | pass |
| Info validation text | #bfbfbf | #202f38 | 7.488 | 4.5 | pass |
| Warning validation text | #bfbfbf | #3a341e | 6.758 | 4.5 | pass |
| Error validation text | #bfbfbf | #432e2a | 6.868 | 4.5 | pass |
| Warning badge text | #000000 | #cca700 | 9.095 | 4.5 | pass |
| Error badge text | #000000 | #f48771 | 8.551 | 4.5 | pass |
| Info notification icon | #4492b9 | #202122 | 4.653 | 3 | pass |
| Warning notification icon | #cca700 | #202122 | 6.985 | 3 | pass |
| Error notification icon | #f48771 | #202122 | 6.567 | 3 | pass |
| Editor info mark (non-text approximation) | #4492b9 | #121314 | 5.366 | 3 | pass |
| Editor warning mark (non-text approximation) | #cca700 | #121314 | 8.056 | 3 | pass |
| Editor error mark (non-text approximation) | #f48771 | #121314 | 7.574 | 3 | pass |
| Sidebar text | #bfbfbf | #191a1b | 9.478 | 4.5 | pass |
| Added file label | #73c991 | #191a1b | 8.708 | 4.5 | pass |
| Deleted file label | #f48771 | #191a1b | 7.096 | 4.5 | pass |
| Modified file label | #e5ba7d | #191a1b | 9.670 | 4.5 | pass |
| Inactive tab text | #8b8b8b | #191a1b | 5.115 | 4.5 | pass |
| Selected list text (context approximation) (sRGB compositing approximation) | #ededed | #373839 | 10.037 | 4.5 | pass |
| Focus indicator on editor (non-text approximation) (sRGB compositing approximation) | #386e8b | #121314 | 3.341 | 3 | pass |

### Worst raw source-color outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| activityErrorBadge.foreground | error | #FFFFFF | #000000 | 100.000 | 0.000 | 100.000 | opaque |
| editorGutter.modifiedBackground | modified | #0078D4 | #e5ba7d | 35.701 | 0.000 | 35.701 | opaque |
| activityWarningBadge.foreground | warning | #202020 | #000000 | 24.353 | 0.000 | 24.353 | opaque |
| chat.slashCommandBackground | accent | #26477866 | #4895bd26 | 24.225 | 0.251 | 2.439 | sideBar.background |
| diffEditor.insertedLineBackground | added | #347d3926 | #73c99126 | 24.085 | 0.000 | 4.458 | editor.background |
| diffEditor.removedLineBackground | deleted | #c93c3726 | #f4877126 | 17.986 | 0.000 | 3.946 | editor.background |
| editorOverviewRuler.modifiedForeground | modified | #6ab890 | #e5ba7d | 15.817 | 0.000 | 15.817 | opaque |
| inputValidation.errorBorder | error | #BE1100 | #b56858 | 13.538 | 0.000 | 13.538 | opaque |
| inputValidation.infoBorder | info | #3994BC | #396f8b | 11.736 | 0.000 | 11.736 | opaque |
| chat.slashCommandForeground | accent | #85B6FF | #54a2ca | 10.510 | 0.000 | 10.510 | opaque |
| diffEditor.insertedTextBackground | added | #57ab5a4d | #73c9914d | 10.336 | 0.000 | 6.459 | diffEditor.insertedLineBackground → editor.background |
| editorOverviewRuler.warningForeground | warning | #e5ba7d | #cca700 | 10.064 | 0.000 | 10.064 | opaque |

### Retained generated slash-command mismatches (human review)

chat.slashCommandBackground and chat.slashCommandForeground remain generated from shared accent families. Their source blue palette differs from the default teal accent. Remaining color/alpha errors are reported for human review, not hidden by preservation.

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| chat.slashCommandBackground | accent | #26477866 | #4895bd26 | 24.225 | 0.251 | 2.439 | sideBar.background |
| chat.slashCommandForeground | accent | #85B6FF | #54a2ca | 10.510 | 0.000 | 10.510 | opaque |

### Worst alpha outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| chat.slashCommandBackground | accent | #26477866 | #4895bd26 | 24.225 | 0.251 | 2.439 | sideBar.background |
| editorOverviewRuler.findMatchForeground | accent | #3a94bc99 | #4895bd80 | 1.131 | 0.098 | 3.982 | editor.background |
| editor.findMatchBackground | accent | #27678290 | #0f688d80 | 1.971 | 0.063 | 1.922 | editor.background |
| peekViewEditor.matchHighlightBackground | accent | #3994BC33 | #4895bd26 | 1.194 | 0.051 | 2.166 | peekViewEditor.background |
| peekViewResult.matchHighlightBackground | accent | #3994BC33 | #4895bd26 | 1.194 | 0.051 | 2.166 | peekViewResult.background |
| terminal.selectionBackground | accent | #3994BC33 | #4895bd26 | 1.194 | 0.051 | 2.166 | terminal.background |

### Worst approximate rendered outliers

| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| activityErrorBadge.foreground | error | #FFFFFF | #000000 | 100.000 | 0.000 | 100.000 | opaque |
| editorGutter.modifiedBackground | modified | #0078D4 | #e5ba7d | 35.701 | 0.000 | 35.701 | opaque |
| activityWarningBadge.foreground | warning | #202020 | #000000 | 24.353 | 0.000 | 24.353 | opaque |
| editorOverviewRuler.modifiedForeground | modified | #6ab890 | #e5ba7d | 15.817 | 0.000 | 15.817 | opaque |
| inputValidation.errorBorder | error | #BE1100 | #b56858 | 13.538 | 0.000 | 13.538 | opaque |
| inputValidation.infoBorder | info | #3994BC | #396f8b | 11.736 | 0.000 | 11.736 | opaque |

## Source provenance

- `extensions/theme-defaults/themes/dark_vs.json` — SHA-256 `38db2163183afd088cf621115087b60a23726856488eabc9fb893aff15b35470`
- `extensions/theme-defaults/themes/dark_plus.json` — SHA-256 `88f5b662378cbe39473a4a8d916a1b4ec580f85858876eaec440288aee2852df`
- `extensions/theme-defaults/themes/dark_modern.json` — SHA-256 `24e2c79cd2c37769a83f1a89c5e97c8107fd0ec084cd7a021c2ab835d3809074`
- `extensions/theme-defaults/themes/2026-dark.json` — SHA-256 `54aa033434ff9d073ef32ae19f40023e2c3bf921b40d00557511dbf2f2971299`

Full unrounded metrics, selectors, preserved IDs, per-color raw/alpha/rendered errors, and background choices: [model-evaluation.json](model-evaluation.json).
