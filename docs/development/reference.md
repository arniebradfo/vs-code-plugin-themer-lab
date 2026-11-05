# Themer Lab: technical reference

This guide preserves the model, UI, syntax, safety, and validation details for
contributors. For installation and everyday use, see the [user guide](../../README.md).
For setup, commands, testing, capture, and packaging, start with the
[developer guide](README.md).

## Contents

- [Scope and UI model](#scope)
- [Personality and color controls](#personality)
- [Real syntax samples and palette controls](#real-syntax-samples)
- [Syntax generation and native fidelity](#syntax-generation-and-the-native-fidelity-test)
- [Workbench and webview inspection](#inspecting-workbench-and-webview-css)
- [Live preview, Apply, and recovery](#live-preview-and-safety)
- [Older theme-name migration](#upgrading-older-theme-names)
- [Export format](#export)

The two installed themes are **Themer Lab Dark** and **Themer Lab Light**.
Live Preview uses these same themes; it is a temporary workflow, not another
theme contribution.

## Scope

The **Light | Dark** selector chooses an independently fitted native baseline:

| Theme mode | Pinned VS Code | Explicit UI colors | Ordered syntax rules |
| --- | --- | ---: | ---: |
| Dark (default) | 1.143.0, Dark 2026 | 324 | 118 |
| Light | 1.143.1, Light 2026 | 340 | 113 |

Each capture includes four inherited theme files. The references do **not**
include all registered VS Code defaults, extension
defaults, user customizations, or runtime-composited pixels.

This is not a palette inversion. Light has its own native seeds, surface/text
coefficients, darker button hover, quiet validation backgrounds, opacity rules,
and syntax fitting. Both modes use the same controls and generation strategy.
High-contrast themes are not included.

Each mode keeps its own valid UI/syntax draft in memory, including adjustment modes,
manual values, and exact handoff captures. Switching back restores those edits.
Reset affects only the current mode. Drafts survive closing/reopening the panel
in the same extension session, but not a window reload; recipe save/load remains
future work. Switching modes alone does not enable live preview.

The panel generates surfaces, UI text, borders, accents, overlays, and
Info/Warning/Error and Added/Deleted/Modified colors. Six numbered syntax color seeds plus separate
Neutral and Comments inputs generate code
foregrounds, TextMate colors, and semantic colors. Debug/remote status colors
remain preserved unless **Stateful status bar** is on. Terminal ANSI and
unrelated semantic colors remain preserved, not counted as successful generation.

The UI recipe has nineteen available inputs: the theme-mode selector, nine source
colors, one Info source selector, four shape controls, and four Personality
toggles. Eight inputs stay in the main UI controls card; six severity/change
inputs are under **Advanced**. Info's color input is always editable, with its
source selector underneath.
The four finishing touches are under **Personality** and default to off.
Three independent syntax Auto behaviors are on by default. Chroma and Lightness
offer **Auto | Manual | Off**; Manual reveals the corresponding signed slider.
The **Syntax: Auto | Anchored | Manual** selector offers UI coordination, one
editable anchor, or all eight seed pickers. There is no
model-size selector. The UI model uses
fixed family rules; syntax fitting selects shared, discrete variations.
Perceptual similarity to the
original palette is separate from accessibility and from the quality of an
intentionally changed palette.

### Panel layout

Controls form one vertical stack at every width. Each grid uses complete rows:
three controls use three or one columns; four use four, two, or one; eight use
four, two, or one. Color fields fit down to 130px: three-column color rows start
at 430px of card content width. Info source choices stack inside a narrow color
column. Container widths determine the column counts.

1. **Themer Lab header:** title/help on the left; Live Preview, the three-dot
   overflow menu, Cancel, and Apply on the right. Apply saves to User settings;
   the menu includes Apply workspace and Export theme. On narrow panels the complete
   action group moves below the title. Busy status and errors remain visible.
2. **UI controls:** theme mode, Anchor colors, and Model shape. **Advanced**
   reveals Severity colors and Change colors. **Personality** reveals four
   optional finishing touches, each ordered switch, option name, help.
3. **Syntax colors:** Chroma and Lightness adjustment selectors, the
   **Syntax: Auto | Anchored | Manual** selector, and a compact real-editor sample
   row. All three default to Auto. Each adjustment row contains its label,
   segmented choices, combined help and right-aligned value. Manual adds only
   the slider below it, with no repeated label or percentage. Anchored shows an
   inline **Anchor** label, picker and hex input to the right of the Syntax
   selector when space permits; narrow cards move that intact group below.
   Manual reveals all eight seed pickers and places Reset palette beside the
   selector.
4. **Component preview:** the framed component/code window aligns with the
   cards, without an outer card, Preview heading, or host-sync badge. Its help
   icon is in the window's title bar. Code blocks have no second inner background
   and use the generated neutral editor foreground, not the inline-code accent.

Segmented choices use native radio inputs with a subtle toolbar-style selected
fill, normal text, and gaps matching the group's inner padding. Controls and
cards follow VS Code's corner-radius tokens, with small control corners and
larger card corners; fallback sizes also work in classic UI.
Boolean choices use accessible switches. Disclosures keep native details/summary
behavior with Codicon chevrons. Section separators sit above their titles, and hex inputs use an
inset themed focus border while retaining validation-error styling.
All panel icons use the default product artwork from
[VS Code Codicons](https://code.visualstudio.com/api/references/icons-in-labels),
including overflow, help, loading, disclosures, preview navigation and branch
status. SVGs are bundled locally with CC BY 4.0 attribution; there is no host
font dependency or external request. Webview SVGs use the default artwork,
not a user's custom product-icon theme.

Small info-icon buttons retain the explanations without filling the cards with help text.
Hover or focus a button to read its tooltip. Click or tap to keep it open;
click again, click outside, or press Escape to dismiss it. Tooltips use the
current VS Code theme and stay inside the viewport.

The **Baseline fidelity** card is development-only. `npm run preview:browser`
shows the report in the HTML harness; the installed extension hides it.
Syntax contrast advisories and native color coverage remain available under
**Syntax details**. The panel layout does not alter syntax generation, Auto
handoffs, resets, or workspace persistence.
The installed panel does not build the hidden development-only evaluation
lists while editing. Syntax models are fitted lazily for the selected mode and
reused; activation can check recovery journals without fitting either model.

### Native text and overlay roles

- Chat slash-command suggestions share VS Code's editor suggestion widget.
  Selected text, icons, and matched characters use explicit text-oriented
  colors, not Quick Pick/button foregrounds. A bright accent can therefore use
  black button text without making the translucent suggestion menu text black.
  Solid-accent Quick Picks retain their contrasting foreground.
- Rendered Markdown inline code uses an accent-derived
  `textPreformat.foreground`. Its hue is retained and lightness/gamut adjust
  only as needed for 4.5:1 contrast against the unchanged
  `textPreformat.background`. The component gallery includes an inline example.
  Block-code previews explicitly inherit the generated editor foreground from
  Color 7, matching uncolored punctuation in a real TypeScript editor. Individual
  illustrative syntax spans keep their generated scope colors.
- **Overlay opacity** changes selections, hover fills, applicable borders/text,
  and semantic diff overlays. Scrollbar/minimap thumbs and scrollbar shadows
  keep their fixed normal/hover/drag opacities so underlying content remains
  visible. **Tint overlays** still applies its quieter tint to them.

These roles cover both classic and Modern UI, live preview, and exported themes.

### Personality

All four toggles are off by default and are remembered separately in each mode's
in-memory draft. **Reset all** switches them off; **Reset syntax** preserves them.
Gallery, live preview, and export use one shared resolved-theme pipeline.

- **Accent active items:** active tabs, activity icons, panel titles, and
  selected menu/list items use Primary foreground lightness with the accent
  hue/chroma, limited to the display gamut. This makes Dark active text lighter
  and Light active text darker than a button-accent color. For chromatic accents,
  preferred OKLCH lightness is bounded to 0.2-0.9: pure or nearly black/white
  Primary foreground cannot otherwise display visible accent chroma. Normal
  foregrounds inside that range are unchanged. Gray accents keep Primary
  foreground. Lightness then adjusts as needed toward 4.5:1 against
  modeled active/hover fills, including native CSS alpha rounding.
  Solid accent fills keep readable black/white text. If conflicting
  surfaces cannot share a readable foreground, the best available contrast is
  used and a Personality advisory remains visible even with the development
  report hidden. Native new/modified file and warning/error decorations take
  priority when enabled in VS Code; no decoration settings are changed.
  Unsaved dots and optional modified-tab borders remain native. Quick Pick
  accent-fill text keeps its existing behavior.
- **Tint overlays:** covers the nonsemantic **Overlay opacity** pipeline plus
  fixed-opacity scrollbar/minimap sliders and shadows, including neutral and
  already accent-derived selection/hover fills, translucent borders/focus
  indicators, and faint text. It is not limited to a separate list of background IDs.
  Source lightness moves 65% toward the accent lightness; hue comes from the
  accent and chroma is `min(accent chroma * 0.65, 0.14)`, limited to gamut.
  This gives black/white sources a visible color instead of a one-channel
  paint difference. Accents below chroma 0.01 leave original colors unchanged.
  Opaque selected/inactive-selection and hover fills also participate:
  unfocused list/terminal selections, classic activity-bar indicators, Modern
  activity pills, selected tabs and unfocused active/hovered tabs. These fills
  retain their modeled lightness and opacity instead of being excluded for
  lacking transparency. Ordinary resting canvas/chrome is not tinted.
  Neutral interaction fills then cap their **painted** OKLCH chroma against the
  shared active-selection tint at the current Overlay opacity over the same region's
  backdrop. This prevents an opaque/high-opacity inactive selection from
  exposing several times the saturation of a translucent active selection.
  The cap checks encoded and native CSS alpha; it changes source chroma only.
  It does not flatten state lightness, change alpha, or remove existing
  backdrop color. Terminal backdrops follow explicit terminal, then panel,
  then editor background, matching the model's existing backdrop policy.
  Scrollbar/minimap sliders, scrollbar shadows, and resize grips use only 35%
  of the normal tint chroma and lightness movement, so structural UI stays
  quieter than selected items. Normal/hover/drag thumb opacities stay distinct.
  Alpha follows Overlay opacity except for fixed scrollbar/minimap/shadow
  opacities and the existing inactive-selection safety cap.
  Opaque interaction fills remain opaque; their saturation cap
  follows active selection strength as the slider changes. Severity/change
  overlays retain their semantic hues. Other opaque
  and fully clear colors remain unchanged, including opaque Quick Pick fills.
  The internal draft key remains `tintNeutralOverlays` for compatibility.
- **Monochrome brackets:** all six nesting levels use resolved Neutral 7,
  including its Auto/manual adjustments. Guide opacities remain `40`/`a6`;
  guide visibility is unchanged. Unexpected brackets retain vivid Error
  coloring. Syntax tokens themselves are not recolored.
- **Stateful status bar:** normal/inactive workspaces use the interaction
  accent, debugging uses resolved Color 2, and no-folder windows use the quiet
  surface. Remote items use a separate accent-derived normal/hover fill.
  Each fill chooses readable black/white text. Color 2 remains the debug source
  even with monochrome brackets on. VS Code switches states natively and
  `debug.enableStatusBarColor` is respected, not changed. This does not invent
  whole-bar error/task/remote states.

Classic and Modern UI are both model targets, not optional coverage modes.
The pinned Modern UI contract's 31 shared/frame/tab/activity/status IDs have
explicit shared-family assignments. Classic tab colors also drive the Modern
editor-tab counterparts; shared pane tabs and activity bars retain their
surface roles. Missing supported IDs are emitted as **unscored** additions,
not claimed as captured defaults. Explicit nulls remain unresolved. Unknown
future IDs are not assumed to be supported. The extension does not enable
Modern UI or change layout/density settings.

The pre-Personality palette's 344 Dark and 361 Light color values remain
byte-identical with the switches off. Added classic/Modern counterparts bring
default outputs to 369/384 colors, with 45/44 unscored additions. The explicit
305/324 Dark and 308/340 Light fit statistics are unchanged. The model reports
51/53 fixed coefficients, including the grip opacity, active-text lightness bounds and optional tint/contrast
constants; no learned or per-token numeric residuals were added.

Quiet Chat/Markdown prose remains deferred. CSS variables alone are not
independent theme-color APIs; Markdown preview supports contributed CSS, while
native Chat has no equivalent arbitrary-CSS contribution.

Adjust hue, saturation, and lightness with the source color inputs; there are no
separate accent saturation/lightness sliders.

- **Info:** choose **Accent** (default), **Foreground**, or **Custom**.
  Linked modes preserve the source hue and add 0.08 OKLCH lightness in Dark or
  0.02 in Light, reducing
  chroma only if needed to stay within sRGB. The default Dark linked mark is
  `#4492B9`, within the default tolerance of the native `#3A94BC`.
  The color input always occupies the first row, aligned with Warning and Error.
  The source radios sit underneath. Linked modes show the actual derived Info
  color in both inputs; either input remains editable. Editing the picker or hex
  field selects Custom, including while a hex edit is incomplete. Only valid
  colors update the theme. Selecting a linked source replaces the displayed
  value and clears an invalid edit. Custom uses its seed unchanged, and its last
  valid color is remembered while a linked mode is selected.
- **Warning** and **Error:** independent source colors. Resolved severity colors
  drive marks, notification icons, validation backgrounds/borders, and badges.
  Validation text follows the primary foreground; solid badges choose readable
  black/white text automatically. Severity edits do not recolor accents,
  successes, diffs, or terminal ANSI colors.
- Editor severity marks are generated even when their three supported color
  IDs are absent from the reference file. These additional tokens are listed
  separately as **unscored**, not treated as captured defaults.
- **Added**, **Deleted**, and **Modified:** independent source colors for file
  labels, change gutters, minimap/overview markers, and diff/merge backgrounds.
  Added also covers untracked files; Deleted covers staged deletions; Modified
  covers staged modifications, renamed/copied files, and edited-file indicators.
  Conflicts, ignored files, terminal ANSI, severity colors, and syntax stay
  independent.

Diff line backgrounds use 15% opacity. Changed-word overlays use 30% in Dark
and 15% in Light, following the quieter native Light treatment. Both are
scaled by **Overlay opacity**. They retain the selected source RGB and
remain translucent. Normal diff replacements use removed plus inserted colors;
there is no separate modified-line background. Modified drives file/marker
colors and merge-editor change backgrounds. The component gallery previews
all three file-label colors and an illustrative diff.

Defaults come from each mode's native Git decoration colors:

| Mode | Added | Deleted | Modified |
| --- | --- | --- | --- |
| Dark | `#73C991` | `#F48771` | `#E5BA7D` |
| Light | `#587C0C` | `#AD0707` | `#667309` |

This intentionally unifies native
inconsistencies, such as blue modified gutters versus gold modified file labels.
Their reconstruction errors remain visible in the development report. The
severity/change/prominent-hover subset contributes twenty unscored tokens in
Dark and twenty-one in Light. Including the classic/Modern counterparts,
the totals are 45/44; these are not counted as captured defaults.
Light does not explicitly define the two diff line backgrounds; these supported
tokens are generated from Added/Deleted too, instead of leaving them at unrelated
registered fallback colors.

Text and icons on generated accent fills automatically use black or white,
whichever has higher WCAG contrast against the generated sRGB background. This
uses relative luminance, independently of the primary foreground input. For
example, an accent of `#00AEFF` selects black text; a dark blue selects white.
This applies to primary/prominent buttons, prominent status-bar items, accent
badges, and focused Quick Pick rows. Prominent status items use the same fill,
foreground, and hover transform as primary buttons. Debug/remote status palettes
stay independent unless Stateful status bar is enabled. Button hover
contrast is checked separately because VS Code shares one foreground across
normal and hover states.

- **Surface separation:** -3 to 3, default 1. Zero flattens canvas-derived
  layers; negative values invert their order. On a dark canvas, layers become
  darker instead of lighter. A near-black canvas has little darker headroom.
  In Light, normal layers get darker and negative separation makes them
  lighter. A white canvas has no lighter headroom. Light selection and active/
  hover fills retain their normal strength instead of scaling or reversing with
  structural layers, so negative values do not erase state cues and high values
  do not make them overly dark.
  Structural extremes can clip to black/white. Borders, foreground-derived selection
  overlays, and accent/status backgrounds stay independent.
- **Muted text contrast:** adjusts secondary text independently of primary text.
- **Border definition:** -2 to 2, default 1. Zero matches canvas RGB;
  positive values move neutral borders toward the foreground, while negative
  values reverse that direction. On a dark canvas this makes borders darker
  than the canvas. Transparency is unchanged; extremes can clip to black/white.
  In Light, positive values darken borders and negative values lighten them.
  Clear borders remain clear, and accent/status borders retain their meaning.
- **Overlay opacity:** adjusts translucent generated colors.

### Inactive selections and slider focus

`editor.inactiveSelectionBackground` retains its generated RGB (including any
overlay tint) but reduces opacity
when needed for **4.5:1** contrast with Primary foreground and the actual generated
code foreground. The cap checks the composited canvas color, including VS Code's
two-decimal CSS alpha rounding. Already-readable defaults stay unchanged. Gallery,
live preview, and standalone export share the guard, including manual syntax
foregrounds. Active selection and occurrence-highlight colors are unchanged.

If text already fails 4.5:1 on the plain canvas, the cap must not make that
contrast worse. This can require a fully transparent inactive selection for a
poor input combination; it does not silently recolor the text. Contrast advisories
remain visible. The guard is not a guarantee for every independently chosen
syntax shade or overlapping editor decoration.

Range sliders suppress focus outlines during mouse/touch interaction, including
after previous keyboard use. Keyboard focus still has a themed outline and the
native arrow/Page/Home/End controls remain available.

### Chat color bindings

- `chat.linesAddedForeground` follows **Added**.
- `chat.linesRemovedForeground` follows **Deleted**, not Error.
- `chat.editedFileForeground` already follows **Modified**.
- The animated input border and slash-command colors already follow the accent.
  Existing request bubbles use the shared surface/overlay profile for their mode.
- Counter tokens absent from the reference are supported **unscored** outputs;
  they are not mislabeled as captured native values.

Other useful candidates for a future focused pass are request/code borders and
checkpoint separators (neutral borders), `chat.statusBackground` (quiet text
overlay), session-state indicators (Warning/Added/Error), and
`chat.voiceGlowBaseColor` (accent). These have **not** been newly overridden here.
Voice listening/speaking glows can remain unset so VS Code derives their states.
`chat.inputWorkingBorderColor2` and `3` are deprecated and unused in the current
VS Code source; avoid building new controls around them.

The [official color catalog](https://code.visualstudio.com/api/references/theme-color#chat-colors)
and [current pinned chat registrations](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vs/workbench/contrib/chat/common/widget/chatColors.ts)
describe the supported IDs. Theme keys use dots; their exposed CSS variables
use hyphens, for example `chat.linesAddedForeground` becomes
`--vscode-chat-linesAddedForeground`.

See [the long-term plan and review gates](../../PLAN.md).

## Develop

Setup and validation commands are in the [developer guide](README.md).

Dark evaluation writes its fidelity report to
[`reports/model-evaluation.md`](../../reports/model-evaluation.md), with full metrics
and provenance in [`reports/model-evaluation.json`](../../reports/model-evaluation.json).
Light writes separate [readable](../../reports/model-evaluation-light.md) and
[full](../../reports/model-evaluation-light.json) reports. Preserved and unscored
colors never inflate either mode's fit statistics. Contrast warnings are
separate; reproducing native Light colors does not guarantee that every
native warning color meets the advisory contrast target.

The panel provides source-color controls, shape controls, component
previews, fidelity/contrast information, and buttons to open real editor samples.
The code illustration in the webview is not a substitute for the real editor's
grammar and semantic highlighting.

Panel headings and ordinary text follow the UI primary foreground, not the
syntax Neutral input. Range controls use theme-colored tracks/thumbs and keep
native keyboard operation.

## Real syntax samples

The [`samples`](../../samples) directory contains 24 source-file types. Open them
directly from this repository, or use **Themer Lab: Open Syntax Sample** in the
Command Palette. The panel's **All languages...** button opens the same native
picker. The TypeScript, JSON, and Python shortcuts open these files too, rather
than creating untitled copies.

- **Programming:** [TypeScript](../../samples/theme.ts), [TSX / JSX](../../samples/card.tsx),
  [JavaScript](../../samples/palette.js), [Python](../../samples/theme.py),
  [Go](../../samples/theme.go), [Rust](../../samples/theme.rs), [Java](../../samples/Theme.java),
  [C#](../../samples/Theme.cs), [C](../../samples/theme.c), [C++](../../samples/theme.cpp),
  [Ruby](../../samples/theme.rb), [PHP](../../samples/theme.php), and [SQL](../../samples/themes.sql).
- **Web and text:** [HTML](../../samples/index.html), [CSS](../../samples/theme.css),
  [SCSS](../../samples/theme.scss), [XML](../../samples/theme.xml), and
  [Markdown](../../samples/guide.md), including embedded code.
- **Configuration and scripts:** [JSON](../../samples/theme.json),
  [JSON with Comments](../../samples/theme.jsonc), [YAML](../../samples/theme.yaml),
  [Bash](../../samples/preview.sh), [PowerShell](../../samples/preview.ps1), and
  [Dockerfile](../../samples/Dockerfile).

Samples are bundled with the extension, so they also work in the isolated
development workspace and installed builds. Opening a sample does not execute
it, enable live preview, or change theme settings. These are highlighting
examples, not complete application projects or importable theme recipes.
TypeScript, TSX, and JavaScript have a small, dependency-free
[sample project](../../samples/tsconfig.json) for real language-service highlighting.
Other languages can need their usual language extensions for semantic tokens;
Themer Lab does not install those extensions.

Place the cursor on a token and run **Developer: Inspect Editor Tokens and
Scopes**. The inspector shows the grammar scopes, any semantic token
type/modifiers, and the rules that produce the final foreground. This is the
right inspection tool for syntax colors; workbench CSS variables do not show
individual token colors.

### Try the syntax pickers

1. Open **Themer Lab: Open Theme Builder** and find **Syntax colors**.
2. Change a picker or its hex value. The **Syntax** illustration updates
   immediately using generated colors; it does not write settings.
3. Open a TypeScript/JSON/Python sample, or use **All languages...**.
4. Enable **Live workspace preview** and accept the confirmation. Valid changes
   now recolor the real editor, including grammar and semantic highlighting.
5. Use **Cancel** to undo the preview, **Apply** to save to User settings,
   **Apply workspace** in the overflow menu to save only to this workspace, or
   **Export theme** to save a separate generated theme file.

The six movable color seeds are numbered because their chosen hues can change.
Their original native color names stay in the descriptions:

| Picker | Original native group |
| --- | --- |
| Color 1 | Blue, accent-linked/anchor family; bracket nesting level 1 |
| Color 2 | Violet; bracket nesting level 2 |
| Color 3 | Red; bracket nesting level 3 |
| Color 4 | Amber/gold; bracket nesting level 4 |
| Color 5 | Green; bracket nesting level 5 |
| Color 6 | Teal; bracket nesting level 6 |
| Color 7 - Neutral | Cool-gray code text and punctuation |
| Comments | Muted blue-gray comment text and delimiters |

In Manual syntax, Comments has its own input, not a variation of Color 7. Changing one does
not recolor the other. Each native color is assigned to a group once, so editing
a seed cannot move tokens between groups. Hue offsets are capped at **+/-15
degrees** before RGB quantization. A manually chosen red seed cannot generate
unrelated green or blue shades. Auto and Anchored deliberately rotate the entire
six-color wheel; fitted variations are still bounded relative to each rotated
seed. Neutral and comment variants have no fitted hue rotation.

This is primarily color grouping with small semantic safeguards: syntax error
tokens/deletions follow Color 3, insertions Color 5, and warnings Color 4.
Other unrelated purposes can still share a native color. In Dark, Color 1
covers strings, constants, attributes, and headings; Color 5 covers tags, JSON
keys, and numeric shades. Light has its own native assignments, and a family
need not appear in every language. Comment scopes always use Comments, regardless of
their native hue. Picker descriptions and **Inspect native color coverage**
show the assignments. UI severity marks keep their separate UI inputs.

**Reset syntax** restores the original seeds, clears manual shifts/captures,
and enables all three Auto modes using the current UI anchors, without changing
UI inputs. The main reset restores both palettes in the current theme mode,
leaving the other mode's draft unchanged. The illustration
uses representative generated scopes, not a second tokenizer.

### Bracket colors: no extra inputs

Native bracket pair colorization cycles through Colors 1-6, then repeats.
Opening/closing pairs share a color. Bracket colors use the seeds directly
with the same Auto/manual hue, chroma, and lightness handling; there is no
additional bracket-only hue rotation. The TypeScript sample includes six nested pairs.

Active/inactive bracket guides use the same colors at 65%/25% opacity.
Guides are lines that trace matching bracket pairs, not recolored whitespace
or ordinary indentation guides. Themer supplies their colors but leaves guide
visibility and independent color-pool settings unchanged.

Unexpected brackets use the UI **Error hue**, boosted to the greatest
displayable chroma (up to 0.3) that meets 4.5:1 contrast
against the editor background. This highlight ignores ordinary syntax
adjustments, so a muted palette does not mute errors. Near-neutral Error
inputs (OKLCH chroma below 0.01) explicitly fall back to vivid red. The selected
Error color itself is unchanged. A mid-gray background can restrict both
contrast and chroma; readability takes priority. This highlights unexpected
brackets, not every possible missing bracket or syntax error.

Live preview enables workspace `editor.bracketPairColorization.enabled`.
Cancel/panel close restores its previous value or absence. **Apply** saves enabled
bracket colorization to User settings after restoring the workspace preview;
**Apply workspace** keeps it enabled in workspace settings. Existing workspace
and language-specific overrides may still take precedence.
Export includes all 19 bracket/guide colors in the theme's `colors` section,
but theme files cannot enable editor behavior settings. Current-pair matching
boxes continue to use UI focus/border colors, not another bracket picker.

### Global syntax adjustments

All three automatic behaviors start **on** and are independent:

| Control | Automatic behavior | Manual controls |
| --- | --- | --- |
| Lightness: Auto / Manual / Off | Code/brackets follow Primary foreground; comments follow generated muted text. Both modes soften very bright anchors; Light also protects very dark anchors | Lightness shift |
| Chroma: Auto / Manual / Off | Accent chroma supplies a gentle boost bounded to -25% through +25% | Chroma boost |
| Syntax: Auto / Anchored / Manual | Auto links Color 1 to accent hue and rotates the wheel. Anchored derives the wheel from one chosen Color 1. Both link Neutral/Comments to UI text | One seed picker in Anchored; eight in Manual |

The wheel retains its original spacing and fixed syntax assignments. In Auto, Color 1
matches accent **hue**, not exact RGB; the independent lightness/chroma modes
still apply. Near-gray accents (OKLCH chroma below 0.01) use the original wheel
orientation rather than an arbitrary hue. UI text anchors do not rotate.
Auto Chroma is neutral at the pinned default accent and varies smoothly with
accent chroma: `0.25 * (accentChroma - defaultChroma) / (accentChroma + defaultChroma)`.
White softly reduces chroma without erasing colors; vivid accents cannot force
the full manual boost.

**Anchored** starts with the currently visible Color 1, independent of Interaction
accent. Its hue rotates the wheel; its chroma scales the native chroma ratios.
With Lightness Auto, all six chromatic families use the chosen brightness.
With Lightness Manual or Off, seed brightness follows the anchor while retaining
the native ordering. Neutral still uses Primary foreground, and Comments still
uses generated muted text. Chroma Auto uses the chosen chroma directly, without
another UI-accent boost. Manual global adjustments remain available.

Entering Anchored clears prior global offsets/captures because the visible
Color 1 already includes them. It preserves the Chroma/Lightness mode choices.
The chosen anchor can reach black and white; it is not silently softened by the
UI lightness limits. Existing contrast advisories still apply. Editing Color 1
also updates a captured wheel-lightness baseline so its brightness remains
editable. Selecting Manual from Anchored captures any Auto adjustments as Manual
values to preserve the exact current palette.

In UI-linked Auto, Lightness is not an exact brightness copy at the extremes. In both themes,
above OKLCH lightness 0.8, a smooth roll-off reaches a maximum
of **0.85** for white. This leaves room for syntax color instead of washing all
hues out to white. The same scale applies to comments when their generated
muted-text anchor is very bright. It preserves lightness ordering and leaves UI
colors themselves unchanged. In Light mode, anchors below 0.5 also ease toward
a minimum of **0.4** at black. This leaves enough chroma for dark, readable
syntax on a white canvas instead of collapsing every hue to black. Dark mode's
behavior below 0.8 is unchanged. Manual Lightness shift keeps its full black-to-white range.

Selecting **Manual** from Auto preserves the exact current appearance. Chroma reveals
the latest calculated boost; the palette captures the current derived seeds. Lightness
captures the two scaled automatic text/comment lightness targets and reveals a 0%
shift from that distribution. Precision snapshots avoid a second RGB rounding
step during palette handoff. Editing a seed replaces only that seed's snapshot.
Re-enabling Auto resumes following the current anchors, not an older manual
draft.

**Off** replaces the former Chroma and Lightness Reset buttons:

- **Lightness Off:** shift to 0%, discard the captured automatic targets,
  and return to unshifted seed/fitted lightness.
- **Chroma Off:** boost to 0%, preserving the palette's own color rather than
  making it grayscale.
- Both hide their slider and clear the previous manual adjustment. Returning
  to Manual starts from that neutral state. Manual at zero stays Manual:
  mode choice is explicit, not inferred from the slider value.
- **Reset palette** appears beside the Syntax selector only in Manual. It
  restores the eight original seed colors and discards captured seeds without
  changing the mode or the independent Chroma/Lightness adjustments.

Other groups' values/modes are unchanged; their enabled automation continues
to apply. Selecting Manual and selecting Off are intentionally different.
Derived swatches replace ignored pickers in Auto; Anchored shows one picker plus
the derived palette. Manual picker help
explains which independent Auto modes still override or adjust color values.

| Manual slider | Range | Off value | Meaning |
| --- | --- | --- | --- |
| Chroma boost | -100% to +100% | 0% | Reduce color or use each shade's own available chroma |
| Lightness shift | -100% to +100% | 0% | Shift each shade toward black or white, preserving brightness ordering |

**Chroma boost replaces the old chroma target and equalization pair.** Zero
preserves the fitted palette. Negative values reduce each shade's chroma:
-50% retains half, and -100% makes ordinary syntax and bracket nesting colors
grayscale. Positive values use each shade's own remaining sRGB chroma headroom:
+50% moves halfway to its maximum, and +100% uses that maximum at its current
hue and perceptual lightness. This is not a simple chroma multiplier or a
shared equalization target. A pale shade cannot hold back another color.
Unexpected-bracket errors remain independently vivid.

**Color 7 follows reductions only.** Positive boost preserves its existing
tint; negative boost reduces it proportionally. Comments have their own seed
and follow both directions of the boost. True gray shades and black/gray/white
seeds are not colorized. Black remains a source color, not a mute switch:
lighter variations and global lightness can still make it gray.

The former Lightness/Lightness equalization pair is replaced by **Lightness
shift**. A shift of -50% halves each shade's perceptual lightness; +50% moves
each halfway toward white. -100% is black, +100% is white. Intermediate shifts
retain relative brightness ordering. At zero, the starting point is
the captured Auto distribution if present, otherwise the seed/fitted palette.
Lightness Off clears the capture as well as zeroing the slider.

Gamut limits use each shade's actual adjusted lightness and hue, never another
seed's limit. Very pale or dark shades have
less room to gain chroma. Chroma boost does not change lightness or rotate hue
to force more color. Lightness edits can still require chroma reduction to fit
sRGB, even at zero boost. Hex encoding introduces small rounding differences.

Syntax and bracket nesting colors follow only the UI dependencies enabled by
their Auto toggles. With all three off they are independent of UI foreground,
accent, and muted contrast. Only unexpected brackets use the Error hue.
The editor background supplies the muted-text context and advisory contrast
checks, not a hidden hue source. Low-contrast syntax edits show warnings without silently changing
the selected colors. Invalid hex edits must be completed, escaped, or reset
before Apply/Export; edits in the other palette do not discard them.

## Syntax generation and the native fidelity test

The pure [syntax generator](../../src/syntax/index.ts) fits the pinned theme to the
six color groups, Neutral, Comments, and a shared vocabulary of OKLCH lightness offsets, chroma
multipliers, and tightly bounded hue offsets. It generates both TextMate and semantic rules.
Fitting selects discrete recipes; generation does not read the original RGB
or apply per-token numeric corrections. The report includes the complete
vocabulary and categorical assignments, not just the input count.

Run the real editor comparison against an installed VS Code executable whose
bundled theme files match the pinned source hashes:

```powershell
$env:VSCODE_EXECUTABLE_PATH = 'C:\Program Files\Microsoft VS Code\Code.exe'
npm run test:syntax
npm run test:syntax -- --mode=light
# Optional: choose another strict maximum error.
npm run test:syntax -- --tolerance=3
```

This opens a disposable VS Code profile, copies the 24 samples, and reads
computed foreground colors through a loopback-only development debugging
connection. It captures the untouched native theme first, then the generated
output through the plugin's actual theme-scoped PreviewSession, in grammar-only
and semantic-enabled modes. Third-party extensions are
disabled. Missing source text or colors fails the test. A deliberately wrong
Color 3 edit must also be detected, preventing a no-op customization from
passing. Fidelity is scored using the original fitted **manual** baseline,
with automation off. Automatic colors intentionally differ and are tested
separately against the generated palette, not counted as native reconstruction.
All eight seed edits and two manual sliders must affect a real sample. Seed
checks select witnesses from native color usage across the corpus, rather
than requiring every family to appear in TypeScript. Reports record the
witness file and changed-character count for each seed.
The test verifies comment/neutral isolation, monotonic chroma adjustment,
per-color gamut limits, preserved hue/lightness, true-gray preservation,
non-boosting neutral behavior, and exact Cancel restoration. Automatic checks
verify linked text/comment lightness, bounded accent chroma, hue/gray fallback,
exact per-axis handoffs, frozen manual state, and manual-only group resets.
The sample code
is never executed.

At tolerance **3** in OKLab distance x 100, **all 18,744 non-whitespace
characters in each theme/highlighting combination pass**. Maximum error is
**2.644 in Dark** and **2.519 in Light**. Four built-in
semantic providers are exercised: TypeScript, TSX, JavaScript, and HTML.
Other samples test native grammars, not semantic providers that are absent.
This measures CSS foregrounds, not antialiased pixel colors or accessibility.

The original syntax comparisons use temporary language-scoped bracket-off
overrides so automatic workspace bracket enabling cannot inflate or corrupt
grammar/semantic fidelity. A separate bracket-enabled sample checks all six
slots, guide paint, unexpected-bracket contrast, enabled-state recovery, and
exact native palette restoration. Native defaults are captured at runtime;
the rainbow/guide slots are absent from the pinned theme JSON. Themer's six-seed
rainbow is an intentional palette change, not a claim of native reconstruction.
Run only that focused integration check with `npm run test:brackets`, or add
`-- --mode=light` for Light.

Results:
- [Native comparison and limitations](../../reports/syntax-evaluation.md).
- [Full results, fitted assignments, and sample hashes](../../reports/syntax-evaluation.json).
- [Native baseline color counts and provenance](../../reports/syntax-native-baseline.json).
- Light equivalents: [comparison](../../reports/syntax-evaluation-light.md),
  [full results](../../reports/syntax-evaluation-light.json), and
  [native baseline](../../reports/syntax-native-baseline-light.json).

`npm run capture:syntax` captures only the native baseline; add `-- --mode=light`
for Light. Regular unit tests
check the stored evidence against the current generated output and sample
hashes; change either and the native test must be rerun. Rule-level errors are
reported separately because inherited/overridden rules do not necessarily
appear in the samples.

The unused inherited navy `header` color and overridden green comment rule
exceed tolerance in the separate source-rule report. They remain generated and
visible; hue limits and comment isolation are not relaxed to hide mismatches.

Dark remains pinned to VS Code 1.143.0; Light is pinned to 1.143.1.
Native tests use the installed 1.143.1, whose four Dark theme files still
have identical SHA-256 hashes. Reports record
the actual runtime version/commit separately; a changed source theme fails the
test and requires a new capture. Tests do not change the normal editor or
install extensions.

### Inspecting workbench and webview CSS

To inspect VS Code's HTML/CSS, run **Developer: Toggle Developer Tools**, open
**Elements**, and use the element picker (**Ctrl+Shift+C**). Inspect **Styles**
for CSS rules and **Computed** for resolved values. For a webview, focus it and
use **Developer: Open Webview Developer Tools** when available. With an element
selected, the DevTools console can read a theme variable:

```javascript
getComputedStyle($0).getPropertyValue('--vscode-button-background')
```

To list the chat variables available in the current workbench (or webview):

```javascript
const root = document.querySelector('.monaco-workbench') ?? document.documentElement;
const css = getComputedStyle(root);
console.table([...css]
  .filter(name => name.startsWith('--vscode-chat-'))
  .sort()
  .map(name => ({ variable: name, value: css.getPropertyValue(name).trim() })));
```

The list shows currently exposed variables, not every registered optional/null
color. For the registered catalog, edit `workbench.colorCustomizations`, start a
`"chat."` key, and use **Ctrl+Space**. Inspecting the actual chat element also
reveals which variables its styles consume. The public extension API does not
provide a complete resolved-workbench color enumeration.

The focused native test for status/chat variables and real inactive-selection
rectangles runs both modes without recapturing the full syntax corpus:

```powershell
$env:VSCODE_EXECUTABLE_PATH = 'C:\Program Files\Microsoft VS Code\Code.exe'
npm run test:syntax -- --ui-colors-only
```

Draft controls currently remain in memory for the extension session. Export a
theme or explicitly apply it to User or Workspace settings before restarting if you want to
retain the output. Saving and reopening a small-input recipe is future work.

## Live preview and safety

Except for the legacy-name upgrade below, opening the panel or editing its
controls does not change theme settings.

When you explicitly enable live preview and accept its confirmation:

1. Themer Lab switches the **workspace** to **Themer Lab Dark** or
   **Themer Lab Light**, with the correct native VS Code theme kind.
2. It writes generated UI/bracket/guide colors and independent code foreground under
   `[Themer Lab Dark][Themer Lab Light]` in workspace
   `workbench.colorCustomizations`.
3. It writes generated TextMate and semantic rules under the same theme scope
   in `editor.tokenColorCustomizations` and
   `editor.semanticTokenColorCustomizations`.
4. It enables workspace bracket pair colorization, leaving guide visibility alone.
5. It records previous, applied, and pending settings in a recovery journal
   before writing, including managed color IDs being removed. Older UI/syntax journals restore without touching bracket behavior
   that they did not own.

**Cancel** or closing the panel restores the settings owned by the preview.
Mode switches during preview keep the original session snapshot; Cancel still
returns to the pre-preview theme and settings, not the last intermediate mode.
Old single-theme version-1 journals restore their original scope safely.
Newly acquired color IDs are checked against that snapshot before writing.
Cancel preserves even malformed external color values and restores other owned
settings instead of letting one invalid property block recovery.

### Apply targets

- **Apply** is the default save action. It writes the generated theme selection,
  theme-scoped UI/bracket colors, TextMate rules, semantic rules and enabled
  bracket colorization to **User settings** in the current VS Code profile.
  If workspace live preview is active, its temporary changes are restored first.
  Deliberate workspace overrides remain intact and may still take precedence;
  Themer Lab reports this instead of deleting them.
- **Apply workspace** is in the three-dot menu. It writes the same generated
  settings only to **Workspace settings**, leaving User settings unchanged.
  An active preview is kept; with preview off, Themer saves the current draft
  directly.
- Both save actions work with Live Preview off. User Apply also works in an
  empty window. Apply workspace and Live Preview require a folder/workspace.
  Invalid draft colors or unfinished recovery block applying.
- Saving ends live preview. Later gallery edits remain local until explicitly
  applied or previewed again. Neither action saves a reloadable input recipe.
- Each save replaces Themer-managed color IDs in its own theme scope. Switching
  modes or turning a Personality option off removes obsolete generated keys,
  rather than leaving the previous mode's colors active. Unknown IDs, other
  theme scopes and unrelated settings remain intact. Preview journals those
  removals so Cancel can restore the original values exactly.

User saves affect other windows/workspaces in the same profile unless their own
settings override those values. Workspace saves normally live in the folder's
`.vscode\settings.json`, or in the `settings` section of a saved `.code-workspace`
file, and can appear as version-controlled project changes.

Unrelated settings are preserved, including settings for other themes.
Conflicting external edits to owned values stop updates and are
preserved/reported during restoration. TextMate rule arrays and semantic rule
maps are owned as whole values; edits inside them are conflicts, not merged
automatically. VS Code has no
atomic compare-and-swap settings API; do not edit the same theme keys from
another window during preview.

After an interruption, use **Themer Lab: Restore Unfinished Preview** or the recovery
notification. **Themer Lab: Review Unfinished Theme Settings** reopens the recovery
choices if the notification was dismissed. Keep is offered only for completed
writes; interrupted writes must be restored. Notification actions are tied to
the prompted operation and target, so an old notification cannot keep a newer
preview or restore a different target. Workspace preview and User-save journals are stored separately
and checked against their settings target; older workspace journals remain
supported. A failed direct save attempts to restore its previous settings.
If clearing recovery fails after taking effect, Themer attempts to save its
journal again before continuing. If rollback also fails, the retained journal
supports explicit recovery. If recovery storage itself fails, Themer reports
that it cannot confirm saved recovery and asks you to keep the window open and
retry restoration; it does not claim the journal was retained.
Opening/closing a panel does not silently resolve a previously interrupted save.
Malformed or unsupported journal data is retained and reported. Themer still
refuses activation in that case rather than guessing at a recovery snapshot;
a diagnostic/manual-repair workflow remains future work.

### Upgrading older theme names

Older builds named these themes **Themer Lab Preview** and **Themer Lab Light
Preview**. On activation, the extension updates those exact User/Workspace theme
selections to the new names and copies their UI/TextMate/semantic customization
scopes to the new names. Original scopes remain as a backup. Existing new-name
scopes are authoritative and are never overwritten or refilled from the old
ones. Unrelated settings and bracket behavior do not change.

Migration does not enable Live Preview or apply a new palette. It is deferred
for any target with an unfinished recovery journal until that operation is
restored or kept. Old single-theme and paired-theme journals remain recoverable.
If copying fails, the original scopes remain intact and the error is reported;
the operation can be retried without losing the previous values.

Live preview requires an open folder/workspace. It changes workspace settings
on disk; it is not an in-memory-only theme API. Outside the legacy-name upgrade,
Preview and Apply workspace do not write User settings; the main Apply action explicitly does. An empty settings
file or directory created by VS Code may remain after
restoring the values.

## Export

Use **Export theme** to save a standalone color-theme JSON file. The export
includes generated workbench/severity colors, the additional editor severity
and change tokens, Added/Deleted/Modified colors, independent code text, and
generated TextMate/semantic syntax colors, and the bracket/guide palette.
The exported `type` is `dark` or `light` according to the selected mode.
There is no dependency on the installed default theme files.

To distribute the exported JSON, include it in an extension's
[`contributes.themes`](https://code.visualstudio.com/api/references/contribution-points#contributes.themes).
Use `uiTheme: "vs"` for a Light export or `"vs-dark"` for Dark so registered
fallback colors and native workbench styling use the matching theme kind.
Exporting a theme does not install or publish it.

For reference capture, isolated host checks, browser layout checks, packaging,
and official API references, return to the [developer guide](README.md).