# Themer Lab: scope, milestones, and review gates

## Product goal

Make a VS Code color theme from a small number of meaningful controls. Show
component previews and real editor samples, update the workbench during an
explicit preview session, and export a standalone theme.

Marketplace listing: **Themer Lab: Live Theme Builder**. Native theme names:
**Themer Lab Dark** and **Themer Lab Light**. Live Preview is the temporary
workflow, not part of a saved theme's name. Upgrades retain legacy scoped data
and recovery support without adding legacy entries to the theme picker.

Optimize two separate outcomes:

1. Fidelity to a pinned reference palette.
2. Useful, coherent behavior when the user changes the inputs.

A low reconstruction error alone is not evidence of a good theme generator.

## Current checkpoint

The first experimental extension is implemented, tested, packaged, and installed
locally with user approval. The user reviewed it as a promising start and
requested a source checkpoint. This does not freeze the color model or approve
publication.

One shared UI generator now has independent Dark and Light fitted profiles.
Dark generates 305 of 324 explicit reference colors with 49 fixed coefficients
and preserves 19. Light generates 308 of 340 with 51 fixed coefficients and
preserves 32. Both use nine source colors, one Info source selector, four shape
controls, the theme-mode selector, and four default-off Personality switches.
Forty-eight additional Dark classic/Modern/severity/change/status/suggestion
tokens and forty-five in Light are generated without captured
reference values and excluded from fidelity scores.
Type checking, focused unit tests, packaging, and isolated VS Code integration
checks pass.
There are nineteen available inputs. The stacked panel keeps eight primary
inputs visible, with Severity/Change and Personality controls in separate
disclosures. Linked Info hides its custom picker. Model-size selection has
been removed. Automatic inverse fitting and full
resolved-color capture remain unfinished.

Selecting Light uses a captured Light 2026 baseline from VS Code
1.143.1, not an inversion of Dark. It uses light-specific surfaces, muted text,
button hover direction, validation mixing, opacities, and syntax seeds.
The Light addition preserved Dark output. Later focused fixes intentionally
bind prominent status items to primary-button colors and chat line counters
to Added/Deleted. Each mode retains its own valid UI/syntax
draft and exact handoff captures for the extension session. Reset affects only
the current mode. Live mode switches use native dark/light contributions
while retaining one original recovery snapshot; export emits the correct type.

The first input refinement removes separate accent saturation/lightness sliders
in favor of the color input. Surface separation now ranges from -3 to 3:
zero flattens structural canvas-derived layers and negative values reverse their order.
Light selection and active/hover fills keep their normal strength instead of
scaling with structural separation, preserving state cues across the signed range.
Canvas, borders, foreground-derived overlays, and accent/status backgrounds
are independent of this reversal. Signed border definition ranges from -2 to 2.
Zero matches canvas RGB and negative values invert neutral border lightness.
Both signed controls can clip at black/white.

Text and icons on generated accent fills automatically select black or white
using the higher WCAG contrast against the generated sRGB background. This adds
no control and does not change neutral or preserved status text.

Editor/Chat suggestion text, icons and matched characters have explicit
text-oriented colors, independent of solid-accent Quick Pick/button text.
Rendered Markdown inline code follows the accent, adjusting lightness/gamut
only as needed for 4.5:1 against the unchanged inline-code background.
These are intentional default text-color refinements, not Personality switches.
Scrollbar/minimap thumbs and scrollbar shadows retain fixed opacities across
the Overlay opacity range, while still receiving the optional quiet tint.
All panel icons use locally bundled default VS Code product artwork, including
overflow, loading and the component preview, with the required attribution.

Info has three exclusive source choices: Accent (default), Foreground, and
Custom. Linked modes add 0.08 OKLCH lightness in Dark or 0.02 in Light, preserving hue and limiting
chroma only for the display gamut. The default linked mark remains within
tolerance 3 of the captured native Info color. Custom retains its fitted/edited
seed while linked modes are selected. Warning and Error remain independent.
Resolved severity colors control marks, notification icons, validation colors,
and readable badges. Supplemental editor mark tokens are tracked separately
rather than inventing their reference values.

Added/Deleted/Modified now have independent inputs seeded from Git decoration
colors. They drive Explorer/SCM labels, gutters, minimap/overview markers, and
translucent diff/merge backgrounds. Replacements use removed plus inserted,
not an invented modified-line diff background. Conflicts, ignored files, and
other unrelated semantic colors stay preserved.

Panel body text explicitly uses UI foreground rather than the webview's default
editor foreground; changing syntax Neutral no longer recolors section titles.
Slider tracks/thumbs use native theme colors while retaining keyboard controls.
Pointer interaction no longer leaves the range focus outline visible after
keyboard use; keyboard focus keeps its themed indicator.

Inactive editor selections keep generated RGB, including optional tint, but cap opacity against both Primary
foreground and the generated code foreground. The composited result must meet
4.5:1, or preserve existing canvas contrast if it was already lower. The cap
accounts for native CSS alpha rounding and is shared by gallery, preview and
export. Active selection, occurrence highlights, syntax colors and unrelated
status palettes remain unchanged by that guard. Registered chat variable inspection and
possible future bindings are documented without a broad chat recoloring pass.

Four Personality switches reuse existing sources: Accent active items,
Tint overlays, Monochrome brackets, and Stateful status bar.
Classic/Modern parity covers the pinned 31 shared/Modern color IDs explicitly,
including absent tab tokens previously left to native fallbacks.
With the switches off, optional Personality overrides do not run. Native checks cover
actual classic/Modern tabs, all six bracket levels, real debugging state and
the user's debug-color setting. Quiet Chat/Markdown prose remains deferred.

Active text starts at Primary foreground lightness with the accent hue, rather
than using button-accent lightness. Chromatic accents bound preferred OKLCH
lightness to 0.2-0.9 so black/white Primary foreground still permits visible
color; contrast may adjust it further. Gray accents retain Primary foreground.
Native resource/problem decorations take
priority when enabled; dirty dots and modified-tab borders remain native.
Tint overlays now shares the whole nonsemantic Overlay opacity pipeline,
including existing accent selections, translucent borders and faint text.
Sources move 65% toward accent lightness and use 65% of its chroma, capped at
0.14. Opaque selected/inactive-selection/activity/hover fills also tint while
retaining their lightness and opacity. Scrollbar/minimap sliders, shadows and
resize grips use 35% of the normal tint. Neutral interaction fills cap visible
chroma to the current active-selection tint over their region backdrop;
opaque/high-opacity inactive fills no longer expose the full source chroma.
Native alpha rounding and existing backdrop color are accounted for without
flattening state lightness. Alpha is unchanged except the selection
safety cap; semantic severity/change hues and ordinary opaque chrome are
unchanged. Tests measure actual inactive Explorer rows, activity indicators and
scrollbar paint, not just changed source hex values.

## Independent syntax palette: controls, preview, and native test

The syntax groundwork now includes 24 checked-in source-file types, bundled with
the extension and accessible through a native sample picker. Existing sample
shortcuts open those files rather than untitled copies. Opening samples does
not change settings or execute their code.

The syntax model uses six numbered color seeds plus Neutral and
Comments. It fits shared, quantized
OKLCH variations and generates TextMate and semantic rules. It has no learned
numeric coefficients or per-token numeric corrections; the shared vocabulary
and categorical assignments are fully reported.

Three independent automatic behaviors start on, separately from the nineteen
available UI inputs. Chroma and Lightness offer Auto/Manual/Off; Manual reveals
their signed sliders. Syntax offers Auto/Anchored/Manual: UI-linked coordination,
one editable Color 1 anchor, or eight independent seed pickers.
Original color names stay in descriptions rather than labels.
Generated colors update the illustration immediately; real sample editors
update during opt-in live preview. Syntax-only reset preserves UI edits.
Export includes generated syntax and independent code foreground.

The same six wheel seeds now drive native bracket nesting colors, with no
additional controls or hue rotations. Derived inactive/active guide colors
use 25%/65% opacity without changing guide visibility. Unexpected brackets use
a high-chroma, contrast-aware version of the UI Error hue; near-neutral Error
inputs use an explicit red fallback. This error highlight ignores ordinary
syntax adjustments. Matching-pair boxes keep UI focus/border styling.

Families are primarily assigned by native color, not syntax purpose. Diagnostic
and diff safeguards keep syntax errors/deletions in Color 3, additions in
Color 5, and warnings in Color 4. Comments are a semantic exception with their
own seed, independent of Color 7's code text and punctuation. Other unrelated purposes can share a family;
descriptions and native-color coverage expose those relationships.
Hue offsets are bounded to +/-15 degrees, with no neutral/comment rotation.
Changing a seed does not regroup scopes or mix seed hues. One signed Chroma
boost replaces the common chroma target/equalization pair: -100% is grayscale,
0% preserves the fitted palette, and +100% uses each shade's own sRGB chroma
limit at its final hue/lightness. Negative values scale existing chroma;
positive values blend through available headroom, not a shared ceiling.
Color 7 follows reductions only; Comments follows both directions.
Achromatic shades are not colorized. A single Lightness shift replaces the
target/equalization pair, moving each shade toward black or white while
retaining brightness ordering. Gamut limits use actual adjusted lightness
and do not rotate hue.

Auto Lightness uses Primary foreground lightness for code/brackets and actual
generated muted-text lightness for comments, with a smooth high-lightness
roll-off: inputs up to 0.8 are unchanged, and white maps to 0.85 so syntax hues
retain chroma. Light also softens anchors below 0.5 toward a minimum of 0.4
at black, preventing dark syntax from losing all chroma on white.
UI colors and manual lightness endpoints remain unchanged.
The same monotonic scale protects bright comment anchors and is captured
exactly during Auto-to-manual handoffs. Auto Chroma derives a restrained,
smooth accent-chroma boost bounded to +/-25%, neutral at the reference accent.
Palette Auto aligns Color 1 to accent hue and rotates the original wheel together;
Neutral and Comments use UI text anchors. Near-gray accents retain the original
orientation. These three automatic behaviors are independent and on by default.
The six families are ordered blue, violet, red, amber, green and teal so the
accent-linked family is first in the panel and native bracket cycle. Scope
assignments stay unchanged.

Anchored captures the visible Color 1 as a single editable source independent of
Interaction accent. Its hue/chroma/brightness drive the six-color wheel; Neutral
and Comments retain UI text links. Chroma Auto adds no extra UI boost; Lightness
Auto follows the anchor for chromatic families and preserves separate UI-linked
Neutral/Comments targets. Manual/Off retain anchor-relative seed brightness.
Entering Anchored clears offsets already baked into the visible source. Its
chosen brightness is not softened by UI lightness limits. Manual capture
preserves exact colors, including any Auto anchor adjustments. Legacy autoHue
booleans normalize to Auto/Manual without changing output; mixed representations
are rejected.

Selecting Manual from Auto captures its latest result without a visible jump: the current
chroma boost, unquantized derived seed snapshots, or the two automatic lightness
targets with a zero manual shift. Re-enabling follows current anchors. Off clears
the corresponding adjustment: zero chroma boost, or zero lightness shift with its
capture cleared. Off hides the slider; returning to Manual starts at that neutral
state. Manual at zero is an explicit, separate mode. Reset palette appears only
beside the palette selector in Manual and restores the eight fitted seeds with snapshots
cleared. Other groups are untouched. Overall Reset syntax restores seeds,
clears manual captures/adjustments, and enables all Auto modes without resetting
UI inputs. Auto shows derived swatches instead of ineffective seed controls;
manual help explains still-active lightness/chroma dependencies.

The title and workspace actions share one compact header. Controls use segmented
radios, switches, local Codicon info/chevron artwork, top section separators, and
inset hex-input focus borders. Count-specific container grids keep complete rows.
The component window aligns with the cards without an outer Preview card or
host-sync badge; real-editor sample actions sit inside Syntax colors. Native
details/summary keyboard behavior and existing workspace ownership remain intact.

Live preview owns theme-scoped TextMate and semantic values as well as UI
colors. Preview also enables workspace bracket colorization. Snapshots,
pending-write recovery, conflicts, Apply, and restoration cover all settings;
old UI/syntax journals remain recoverable without changing bracket behavior.
Apply saves generated colors, syntax and enabled brackets to User settings by
default; Apply workspace in the overflow menu saves only to the workspace.
User Apply first restores temporary workspace preview settings, preserving
pre-existing overrides and reporting their possible precedence. Both save
actions also work with preview off; User Apply does not require a workspace.
Target-specific journals protect direct saves and retain recovery if rollback
fails. Guide visibility remains the user's choice.
The shared scope names both preview themes. Mode changes journal the applied
and pending theme kind as well as colors, so interrupted switches restore
safely. Legacy single-theme journals retain their original scope.

The native test applies the plugin's actual PreviewSession and measures computed
foregrounds, not a duplicated scope
resolver. All 24 sample files pass in grammar-only and semantic-enabled modes
for both Dark and Light: 18,744 non-whitespace characters per combination,
all within tolerance 3. Maximum error is 2.644 in Dark and 2.519 in Light.
Four built-in semantic providers are exercised; third-party extensions
are disabled. Theme/application and sample hashes pin the evidence. A negative
control must detect a deliberately changed input. All eight seed edits and two
manual sliders affect the native editor. Native checks verify comment/neutral
isolation, monotonic per-color chroma boost, independent lightness adjustment,
non-boosting neutral behavior, true-gray preservation,
and exact Cancel restoration. Reconstruction uses the fitted manual baseline,
not the intentionally changed automatic defaults. Separate native Auto checks
verify actual UI-linked output, bounded chroma, hue/gray fallback, exact handoffs,
frozen manual state, and reset semantics. A separate bracket-enabled native sample captures
registered defaults absent from the theme fixture, then checks six-slot cycling,
derived guide paint, vivid errors and exact setting/palette restoration. The
generated rainbow deliberately uses the six seeds, not the native order, and
does not inflate syntax/UI fidelity scores. The
latest run uses VS Code 1.143.1 with byte-identical pinned theme files; runtime
version/commit is recorded separately rather than mislabeled as 1.143.0.
See [the native report](reports/syntax-evaluation.md) for coverage and limits.

1. **Review real tokens first.** Use the samples and **Developer: Inspect Editor
   Tokens and Scopes** to identify grammar scopes and semantic token types.
   Include code, markup, configuration, scripts, and embedded languages. Semantic
   coverage depends on available language providers; grammar-only coverage must
   not be described as a semantic-color test.
2. **Review the color-family palette.** Numbered color seeds, separate neutral
   text/comments, per-color chroma boost, signed lightness shift, and independent Auto axes replace the
   earlier purpose-based seeds and wide rotations. The first renderer is
   checkpointed in `c47c620`; the reviewed seven-family/shared-equalization
   version is checkpointed in `16de910`.
   Review predictable seed edits and independent adjustments before adding controls.
   UI inputs affect only the enabled Auto axes; manual syntax remains independent.
3. **Map both highlighting systems.** Generate ordered TextMate `tokenColors`
   and matching `semanticTokenColors` from the same syntax sources. Retain
   meaningful modifiers and font styles. Use the pinned syntax rules as the
   baseline, then measure shared-family reconstruction separately from
   workbench-color fidelity. Do not hide semantic overrides by disabling them.
4. **Safe preview and export are wired.** Both generated syntax rule sets and
   independent code text are exported alongside workbench colors. The journal,
   theme-scoped writes, conflict checks, and restoration tests now cover
   TextMate and semantic customization settings.
5. **Check independence and readability.** UI accents must not recolor syntax;
   syntax edits must not recolor UI components. The editor background remains
   shared context for contrast checks, not a hidden syntax-color input.

Human review: try the family seeds and global sliders across the sample files before
expanding the controls. Representative syntax contrast warnings are implemented;
checks for every generated variant, third-party semantic providers, and broader
changed-palette quality remain future work.

## Prioritized remaining steps

1. **Save and reopen recipes.** Persist the source inputs, model version, and
   reference version separately from exported theme colors. Support draft
   recovery and explicit save/load without enabling live preview automatically.
2. **Complete reference coverage.** Capture runtime-resolved workbench CSS
   variables in the pinned development environment, compare against the color
   catalog, and account for registered defaults with honest provenance.
3. **Implement constrained inverse fitting.** Learn shared family coefficients
   under configurable RGB, alpha, and complexity budgets. Compare the real
   accuracy/complexity trade-off without hidden per-token residuals. Refine the
   controls of the single model rather than introducing selectable model sizes.
4. **Reduce fidelity outliers.** Address slash-command colors, inherited legacy
   accents, alpha differences, and multi-layer compositing. Keep mismatch and
   preservation counts visible instead of excluding difficult cases.
5. **Refine previews and accessibility.** Cover more component states and real
   editor samples, test extreme user palettes, broaden contrast checks, and
   review keyboard, screen-reader, and performance behavior.
6. **Refine and extend palette families.** Review the interactive syntax controls
   across languages and broaden variant contrast/provider coverage.
   Explore remaining statuses and terminal colors that are currently preserved.
   Extend the severity mapping without changing unrelated successes or categories.
7. **Add high-contrast models.** Light now has its own captured profile and
   native contribution. Extend the same independent capture/constraint approach
   to high contrast rather than simply inverting another palette.
8. **Investigate arbitrary-theme import.** Resolve supported theme-file includes
   and runtime workbench colors while documenting API and syntax-data limits.
9. **Harden and release.** Expand multi-window, multi-root, remote-workspace,
   interruption, and packaging tests; add CI and a reference-upgrade process.
   Review licensing, repository metadata, publisher identity, and release UX
   before a separately approved publication.

Human review is still required before accepting the fitted model, making major
behavior changes, reloading the current editor, or publishing. At each
human-review checkpoint, build with `npm run package`, then install with
`code --install-extension ".\artifacts\themer-lab-0.1.0.vsix" --force`.
The user has authorized this workflow. Then instruct the user to close the open
Themer panel and run **Developer: Reload Window**; do not reload automatically
or add profile-selection steps.

## Initial scope

- Baseline: Dark 2026 from VS Code 1.143.0, commit
  `2d0b7506a36c1d6db9a466440131a8e01eab2289`.
- Fit workbench surfaces, text, borders, accents, and overlays.
- Generate severity and Added/Deleted/Modified palettes from independent source
  colors; preserve unrelated status/terminal palettes and report them separately.
  Syntax has its own independent generator.
- Maintain one extensible UI generator with Dark/Light profiles and fifteen available inputs.
- Use perceptual color operations and explicit alpha handling.
- Provide a webview editor, component gallery, real editor samples, and export.
- Make live preview explicit, workspace-scoped, reversible, and recoverable.
- Build and reinstall the local VSIX at human-review checkpoints, then ask the
  user to close the panel and reload the window themselves.

## Non-goals for the first prototype

- Reproducing every registered fallback color in VS Code. Three explicitly
  supported editor severity tokens are generated and labeled unscored.
- Importing the complete resolved palette of an arbitrary active theme.
- Supporting old VS Code versions.
- Arbitrary workbench CSS, layout changes, or internal component imports.
- High-contrast themes.
- Publishing to the Marketplace.

## Milestones and expected results

### 1. Reproducible reference capture

Deliver:
- A capture command accepting an installed VS Code application directory.
- A JSON fixture with version, commit, file hashes, include order, color
  provenance, syntax rules, and explicit coverage limitations.
- Tests for include merging, JSONC, malformed inputs, and cycle detection.

Accept when:
- Capturing the same installation twice produces identical output.
- Child overrides win, parent syntax rules retain their ordering, and
  unresolved/default-only colors are not invented.
- Every captured workbench color has provenance.

### 2. Pure color model and evaluation

Deliver:
- A typed, deterministic engine independent of VS Code and the webview.
- Shared role-level rules, not a hidden per-token residual table.
- A reproducible single-model fidelity and complexity report.
- Configurable perceptual tolerance, alpha metrics, coverage, worst errors,
  contrast checks, and visible exception counts.

Accept when:
- All generated values are valid sRGB colors.
- Generated, preserved, and unresolved coverage is reported separately.
- Accent changes affect accent roles without recoloring diagnostic statuses.
- Surface edits preserve a defined hierarchy.
- Fixed model complexity is reported separately from user-control count.

Human review:
- Review measured accuracy and control usefulness before freezing the model.
- Do not invent an acceptance threshold before measuring the first baseline.

### 3. Safe end-to-end prototype

Deliver:
- A webview editor with source colors and always-available shape controls.
- Component/state previews, fidelity metrics, and contrast warnings.
- Real TypeScript, JSON, and Python sample documents.
- A standalone theme export preserving the initial syntax palette.
- An explicit live-preview session using a contributed baseline theme.

Accept when:
- The gallery responds immediately without depending on settings writes.
- Live settings writes are debounced and serialized.
- Preview writes only theme-scoped colors and theme selection at workspace
  scope, after an explicit confirmation.
- Cancel restores owned settings without overwriting unrelated edits.
- A journal supports recovery after interruption.
- Closing the panel restores an uncommitted preview; keeping changes is an
  explicit persistent action.
- Apply defaults to User settings; Apply workspace is explicit in the overflow
  menu. Preview remains workspace-scoped. User saves remove temporary preview
  writes without deleting intentional workspace overrides, and both targets
  preserve unrelated settings. User Apply works without an open workspace.
- Errors are surfaced to the user and recorded in an output channel.

Human review:
- Review the controls, preview behavior, and persistence explanation.
- No changes to the current window's theme/settings during development.

### 4. Validation and local package

Deliver:
- Passing unit tests, type checks, a production build, and a local VSIX.
- Extension-host smoke tests in an isolated profile/workspace when feasible.
- Clear developer and user instructions.

Accept when:
- The extension opens, exchanges messages, exports, and handles activation
  and preview lifecycle errors correctly.
- The VSIX contains the built extension, webview, baseline theme, and notices,
  not development dependencies or temporary data.
- Any unverified UI or lifecycle behavior is explicitly documented.

Human review:
- Approve installation into the current VS Code instance.
- Approve a window reload if required. A separate Extension Development Host
  is the default development path.

### 5. Broader coverage and design refinement

After review:
- Capture runtime-resolved webview CSS variables in the pinned development
  environment and measure coverage against the registered/documented catalog.
- Make alpha/compositing tests more representative of real component stacks.
- Improve role assignments and compare additional constrained model families.
- Add accessible light and high-contrast models with independent baselines.
- Explore a small syntax palette with real grammar/semantic-token tests.
- Evaluate arbitrary-theme import only within supported API constraints.
- Add selective advanced overrides without disguising their complexity.

### 6. Release

Deliver:
- Reviewed UX, accessibility, performance, recovery, documentation, and samples.
- A versioned theme format and reference-upgrade procedure.
- Marketplace metadata and a signed-off package.

Human review:
- Approve scope/quality and publishing identity.
- Never publish, upload project data, or create a release automatically.

## Architecture

- `src/shared`: typed reference data and webview message contracts.
- `src/color` and `src/model`: pure color science, role mapping, generation,
  fitting, and evaluation.
- `src/extension`: commands, panel, workspace preview, recovery, and export.
- `src/webview`: accessible controls and component previews.
- `tools`: reproducible capture, evaluation, and build tooling.
- `fixtures`: pinned source data with provenance and limitations.
- `test`: unit and extension-host validation.

Use a single TypeScript project initially. Add abstractions only when a second
real use case requires them.

## Safety and operating rules

- Read theme files and official public sources, not private user settings.
- Do not use unsupported workbench internals at extension runtime.
- Do not silently substitute fallback colors for missing values.
- Preserve pre-existing settings and report conflicting external edits.
- Do not reload this editor, install an extension, commit, or publish without
  explicit approval.
- Stop and request input when a decision changes these boundaries.
