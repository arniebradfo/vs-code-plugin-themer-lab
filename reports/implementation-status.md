# Implementation checkpoint: 2026-10-25

## Outcome

A working experimental extension is implemented and packaged locally. After
explicit approval at the review gate, version 0.1.0 was installed through the
stable VS Code CLI. The current window was not reloaded, normal theme settings
were not changed, and nothing was published. The user subsequently reviewed the
prototype as a promising start and approved a source checkpoint.

The [long-term plan](../PLAN.md) remains the scope and review contract.
It now includes the prioritized remaining work. Model acceptance, the next
research direction, and release approval remain open.

## Approved local installation

- Installed ID/version: `themer-local.themer-lab` / `0.1.0`.
- Location: `%USERPROFILE%\.vscode\extensions\themer-local.themer-lab-0.1.0`.
- At installation time, the installed extension, webview script/style, and
  baseline theme hashes matched both the VSIX payload and the project build.
- The CLI reported successful installation and no reload requirement.
- No automatic reload, theme switch, or live preview was performed.
- The CLI did not identify the active window profile. Installation is verified;
  availability/activation in this specific window still needs confirmation.
  Run **Themer Lab: Open Theme Builder** from the Command Palette.

Review builds are now rebuilt and force-installed at the user's request.
The user closes the Themer panel and reloads the window manually. F5 remains
available for isolated development without replacing the installed extension.

## Current checkpoint: public source and release preparation

- The public repository is `arniebradfo/vs-code-plugin-themer-lab`, with `main`
  prepared as a single parentless snapshot. Earlier local development history
  and personal user notes are not included in the public branch.
- Manifest repository, homepage, and issue links point to the public project.
  Packaging rewrites README links to `main` and derives the artifact filename
  from the manifest version.
- The lockfile uses public npm tarball URLs. All 386 package versions and
  integrity values were preserved; a clean public-registry install succeeds.
  Git attributes preserve the exact CRLF sample bytes used by native evidence.
- CI checks Windows and Linux and creates an installable review VSIX on Windows.
  It also checks runtime dependency advisories on Linux. Local audit endpoints
  failed TLS negotiation, without disabling certificate validation.
- All 359 unit tests, type checking, build, 28 actual extension-host groups,
  and four empty-window groups pass locally. Package inspection verifies
  runtime parity, rewritten links, notices, and private/development exclusions.
- Manual publishing is environment-gated and refuses the local publisher,
  `UNLICENSED`, or an absent project license. A separate tooling-hardening
  change upgrades VSCE from 3.9.2 to the verified stable 4.1 release, adds an
  actual CLI capability regression, and switches the workflow to short-lived
  OIDC credentials. The initial `main` snapshot stays parentless until that
  follow-up is reviewed. No publishing credential is stored in source.
- The [publishing checklist](../docs/development/publishing.md) covers owner
  decisions, publisher identity changes, protected authentication, artwork,
  compatibility review, and release acceptance. Nothing is published to the
  Marketplace by this source-repository setup.

## Previous checkpoint: user-facing README and developer documentation

- The root README is now the Marketplace/extension-detail user guide. It leads
  with features and setup, then explains UI/syntax controls, real-editor
  samples, User versus Workspace saves, Cancel/recovery, export, and the limits
  of editable-draft persistence. Contributor commands and model internals no
  longer dominate the product page.
- [The developer guide](../docs/development/README.md) contains startup, isolated
  tests, evaluation, capture, packaging, publication prerequisites, and official
  references. [The technical reference](../docs/development/reference.md)
  preserves the detailed UI/color model, syntax fitting/handoffs, native
  evidence, ownership/recovery, and migration context from the previous README.
  Relative links were adjusted for the new folder.
- The user guide links to both developer documents. Developer source/report
  links require a repository checkout; the guides explicitly distinguish those
  resources from the installed extension.
- All 72 local document links/anchors pass, and the user README is 174 lines
  rather than the previous 948. A fresh typecheck, all 356 unit tests, and build
  pass for the outstanding branding changes. Native tests were not rerun for
  this documentation-only pass; their prior evidence is recorded below.
- Local VSIX packaging passes: 222,480 bytes and 39 entries. The packaged root
  README and both developer documents match their source SHA-256 values; all
  user-guide relative links have packaged targets. Branding metadata and
  source/test/report/user-note exclusions remain intact. Nothing was published,
  installed, reloaded, or activated during this pass.
- User notes and workspace settings remain outside the change scope. This work
  does not publish an extension or choose a publisher, license, or public
  repository URL.

## Previous checkpoint: Marketplace branding and final theme names

- The Marketplace display name is **Themer Lab: Live Theme Builder**, with the
  benefit-focused description and 14 search keywords covering theme editing,
  building, making, generation, customization, color palettes and live syntax
  previews. The README leads with **A complete theme from a few colors**.
- The only two contributed themes are now **Themer Lab Dark** and **Themer Lab
  Light**. Manifest IDs/labels, base JSON names, captured baseline generation,
  applied selection values and current customization scope
  `[Themer Lab Dark][Themer Lab Light]` agree. Live Preview remains the temporary
  editing feature; no extra legacy themes were added to the picker.
- Command Palette labels now use **Themer Lab: Open Theme Builder** and the
  matching **Themer Lab:** sample/recovery labels. Panel/error/export copy and
  current documentation follow the brand. Extension ID, publisher, command IDs,
  theme file paths and journal storage keys stay stable.
- Existing exact legacy theme selections and UI/TextMate/semantic scope names
  migrate per User/Workspace target. The original scope data is retained as a
  backup, an existing new-name scope wins without being overwritten/refilled,
  and selection renaming happens only after scope copying. Failed copies are
  surfaced and retryable; migration does not generate/apply a new palette,
  enable preview or change bracket behavior.
- A target with unfinished recovery is left untouched until restored or kept.
  Older single-theme and paired-theme journals still check ownership against
  their original theme names and restore their original scopes. Recovery then
  permits the naming migration, preserving saved appearance and external edits.
- Typecheck, build and all 356 unit tests pass. New guards cover metadata,
  stable extension/command identity, exact contribution/base JSON parity,
  retries, new-name scope precedence, obsolete-color non-reintroduction, and
  completed/interrupted legacy recovery in both targets and modes.
- All 28 standard extension-host groups, four empty-window groups and 56 native
  UI groups pass in isolated profiles. Added actual-host coverage migrates both
  settings scopes, preserves original colors/syntax/brackets, and confirms that
  Cancel restores the renamed Light theme and native Light kind. Three
  in-memory checks of the actual controller verify startup migration and
  deferral until legacy Restore or Keep finishes.
- Color generation and pinned native syntax evidence remain unchanged. Current
  documentation describes the naming migration; historical checkpoints keep
  the names that were valid at the time.
- Review version 0.1.0 is rebuilt and force-installed: 216,421 bytes and 37 ZIP
  entries. All six runtime/notice/base-theme payloads match project, VSIX and
  installed byte lengths/SHA-256. The new display name, description, 14 keywords,
  both final theme identities, all four command labels, all 25 samples and
  runtime exclusions are verified. No real window reload, theme migration or
  preview activation was performed during installation.
- No Marketplace publication or identity/license decision was made. The local
  publisher remains `themer-local`; existing publishing prerequisites still
  apply. User notes, staging and real window/theme settings remain untouched;
  no commit or push was added.

## Previous checkpoint: visible active accents and concise preview confirmation

- Reproduced an Accent active items no-op at pure white Dark Primary foreground
  and pure black Light Primary foreground. Preserving those exact OKLCH
  lightness endpoints leaves zero displayable accent chroma; near-white/black
  inputs can also make the tint too subtle to see. The new regression failed
  against the previous implementation before the production fix.
- Chromatic active text now bounds preferred OKLCH lightness to 0.2-0.9 before
  the existing gamut/contrast checks. Ordinary Primary foregrounds inside that
  range retain the previous behavior. Gray accents, solid-accent black/white
  text, primary/muted UI text, Markdown inline code, native file decorations
  and all default-off outputs remain unchanged. There are no new user inputs.
  The two explicit bounds are included in the model's fixed coefficients:
  51 Dark / 53 Light. Refreshed UI reports retain the same tolerance-three rates:
  89.180% Dark and 87.662% Light.
- The Live Preview confirmation is now three short sentences covering workspace
  theme/bracket changes, Cancel/close restoration and User Apply. Detailed scope,
  recovery and Workspace Apply explanations remain in the panel help/README.
  A regression limits the warning to 160 characters and checks those essentials.
- Typecheck, build and all 319 unit tests pass. All 26 standard extension-host
  groups and 56 native UI groups pass in isolated profiles. New native coverage
  uses the actual Personality switch and foreground picker, checking on/off
  gallery text and real classic/Modern active-tab paint at both normal and
  endpoint foregrounds in Dark and Light. Existing contrast, geometry, save,
  sample-command, syntax and sticky-scroll checks remain intact.
- The first added native test used an editor-selection probe while the webview
  was the only visible editor. It was corrected to use the existing native
  active-tab paint probe; the actual switch/color assertions were retained.
  Default syntax output and stored native evidence remain unchanged, so no
  full syntax recapture was needed.
- Review version 0.1.0 is rebuilt and force-installed: 215,107 bytes and 37 ZIP
  entries. All six runtime/notice/base-theme payloads match project, VSIX and
  installed byte lengths/SHA-256. Source CSS, manifest identity, both themes,
  all four commands, all 25 sample/configuration files and runtime exclusions
  are verified. No real window reload, theme change or preview activation was
  performed.
- User notes and real theme settings remain untouched. No commit, push or
  publication was added.

## Previous checkpoint: saved-color ownership and recovery hardening

- Saves now use a shared UI/bracket/editor-foreground composition and an explicit
  Themer-managed color-ID set. Separate Dark/Light saves and Stateful status bar
  on/off saves remove obsolete generated keys in the selected scope. Unknown
  IDs, other theme scopes and unrelated settings remain intact.
- Preview journals record managed-key removals before writing. Cancel restores
  their original values, including after failed writes and mode changes.
  Optional removal data preserves older version-1 journal recovery. Acquiring
  new or previously released color keys checks the original snapshot, so an
  external edit cannot be overwritten and later removed without a conflict.
- Recovery actions capture an operation token. Old notifications cannot Keep or
  Restore a newer preview. Pending writes do not offer Keep, and a target-specific
  recovery choice affects only that target. The new **Themer: Review Unfinished
  Theme Settings** command reopens dismissed recovery choices.
- Failed journal clearing attempts to re-save the snapshot. Combined clear-after
  and rollback-write failures remain recoverable for both targets. If recovery
  storage also fails, the error explicitly asks the user to keep the window open
  and retry; it does not claim durable recovery. Cancel preserves malformed
  external color properties while restoring other owned settings.
- User Apply no longer flushes temporary workspace values just before restoring
  them. On conflict, it restores non-conflicting preview values, preserves the
  external edits and refuses User writes. Sample commands acknowledge success
  and picker cancellation so the webview clears their progress notices.
- Syntax fitting is lazy and cached per pinned reference. Host and webview use
  static UI model counts/defaults instead of full fits, and the shared theme
  pipeline resolves syntax once. The installed panel skips hidden development
  evaluation-list rendering; browser development preview remains supported.
- Typecheck, build and all 317 unit tests pass. All 26 standard extension-host
  groups, four empty-window groups and 54 native UI groups pass in isolated
  profiles. Actual UI checks include sample-button success, picker cancellation,
  empty hidden evaluation lists, exact managed User colors and the existing
  five-width, mode, contrast, sticky-scroll and Apply regressions. Three focused
  in-memory checks of the actual controller also verify pending recovery choices,
  stale-notification safety and per-target recovery isolation.
- Generator output and stored native syntax evidence remain unchanged; full
  native syntax recapture was not needed. Workspace Trust/remote placement,
  automatic scheme detection, ambiguous Info/syntax transitions and broad
  coordinator/webview rewrites remain deferred. Malformed recovery-journal
  parsing still fails closed; a safe diagnostic/manual-repair UI needs separate
  design rather than automatic discard.
- Review version 0.1.0 is rebuilt and force-installed: 214,654 bytes and 37 ZIP
  entries. All six runtime/notice/base-theme payloads match project, VSIX and
  installed lengths/SHA-256. Source CSS, both theme contributions, all four
  commands (including recovery review), all 25 sample/configuration files and
  runtime exclusions are verified. The installed ID/version is listed by the
  stable CLI. No real window reload, theme change or preview activation was
  performed.
- User notes and staging remain untouched. No recipe persistence, theme library,
  commit, push or publication was added.

## Previous checkpoint: compact syntax rows and Light interaction fills

- Personality options read switch, option name, then help. Chroma and Lightness
  put their label, segmented choices, combined help and right-aligned value on
  one line. Manual adds only a slider on the second line, without repeated
  labels, percentages or help. Accessible slider labels, descriptions and
  output associations remain intact.
- Syntax keeps its label, mode choices and help together. Anchored places the
  Anchor label, picker and hex input on the right of that row when space permits;
  narrow cards move the intact Anchor group below. It reuses the existing
  Color 1 inputs, labels them Color 1 again in Manual, and combines Anchored
  help with the mode explanation. Reset palette remains beside Manual.
- Color grids allow 130px fields: three-color rows start at 430px of card
  content width, and eight-color grids use two columns at 280px and four at
  580px. All rows remain complete. Info source options stack within a narrow
  color column without disturbing alignment with Warning and Error.
- Light interaction fills retain their normal strength independently of signed
  structural Surface separation. Negative values no longer clip those state
  fills to white, and large positive values do not over-darken them. Structural
  surfaces retain their signed behavior. The policy reuses the existing shared
  interaction selectors and family coefficients; defaults, Dark output,
  opacity/tint policies and syntax output remain unchanged.
- Block-code previews explicitly inherit the generated neutral editor foreground
  instead of the webview's Markdown inline-code accent. Actual TypeScript
  punctuation verifies that native role in both modes; illustrative colored
  spans and the accent-colored inline Markdown example retain their own roles.
- The reported black Dark sticky-scroll background could not be reproduced.
  Actual sticky content and gutter already follow a nonblack custom canvas at
  Surface separation -3, 0 and 3 in both modes. Those native checks are now
  regression coverage; no speculative color-mapping change was made.
- Type checking, build and all 126 focused model/Light/Personality/UI-color,
  syntax, export, icon and stored-native-evidence tests pass. All 26 standard
  extension-host groups and 52 native UI groups pass in isolated profiles.
  Native checks cover classic/Modern Light state fills, real sticky-scroll paint,
  TypeScript punctuation, exact widths 320, 400, 540, 800 and 1200px, every
  adjustment mode, actual Manual slider input, Anchored/Manual transitions,
  three-column fields, invalid Info recovery and both Apply targets.
- Review version 0.1.0 is rebuilt and force-installed: 213,200 bytes and 37 ZIP
  entries. All six runtime/notice/base-theme payloads match project, VSIX and
  installed byte lengths/SHA-256; source CSS also matches the installed stylesheet.
  Manifest identity, both theme contributions, all 25 sample/configuration files
  and runtime-only exclusions are verified. The installed ID/version is listed
  by the stable CLI. No real window reload, theme change or preview activation
  was performed.
- User notes and git staging remain untouched. No theme recipe persistence,
  preset library, named-theme picker or theme contribution was added.

## Previous checkpoint: User-default and explicit Workspace Apply

- The main Apply button saves theme selection, theme-scoped UI/bracket colors,
  TextMate rules, semantic rules and enabled bracket colorization to User
  settings in the current VS Code profile. Apply workspace is a separate
  overflow-menu action that saves the same output only to Workspace settings.
  Both actions work with Live Preview off. User Apply also works in an empty
  window; workspace-only actions require an open folder/workspace.
- Live Preview remains workspace-only and reversible. User Apply first
  restores its temporary workspace overrides, then writes User settings.
  Pre-existing workspace settings are preserved and their possible precedence
  is explained in the status/help and a notification. Workspace Apply keeps
  an active preview instead. Unrelated settings and other theme scopes remain
  untouched in either target. Applying ends preview; later edits stay local.
- The existing journal engine is reused through target-aware adapters.
  Workspace preview journals remain in workspace storage; User-save journals
  use separate extension User storage. Target mismatches and malformed journals
  are rejected, while legacy workspace journals remain recoverable.
  Direct saves attempt rollback after a failed setting/journal write; failed
  rollback retains an explicit recovery path rather than claiming success.
  Previously interrupted operations are not silently resolved on panel close.
- Apply targets and recovery/workspace availability are wired through the host
  protocol, actual webview controls, accessible labels, validation, development
  harness and test API. Invalid colors block both saves; Cancel remains
  available for preview/recovery. The overflow keeps its native product icon.
- Type checking, build and 165 focused persistence/validation/export/queue,
  Light/Personality/syntax and native-evidence tests pass. Failure injection
  covers both targets before/after color, theme, TextMate, semantic, bracket and
  journal writes, plus failed rollback and target-specific recovery.
- All 26 standard extension-host groups and four empty-window groups pass in
  isolated VS Code profiles. They verify exact writes to both scopes, original
  workspace restoration during User Apply, effective workspace precedence,
  unrelated-key preservation, refused conflicting writes and persistence after
  panel close. The empty-window run verifies default User Apply in both modes
  without preview/workspace writes and rejects workspace-only actions.
- All 44 native UI groups pass, including Dark/Light and classic/Modern color
  checks. Actual webview Apply clicks write User settings; actual overflow
  Apply workspace clicks write only Workspace settings with preview off.
  Both actions reject invalid color input. Existing five-width layout, Info,
  syntax-mode, suggestion/Markdown, scrollbar, decoration, bracket, debugger
  and Cancel checks remain intact. Stored native syntax evidence remains fresh;
  generator output has not changed.
- No recipe library, preset system, named-theme picker or additional theme
  contribution was added. User notes and git staging remain untouched.
- Review version 0.1.0 is rebuilt and force-installed: 211,931 bytes and
  37 ZIP entries. The six runtime/notice/base-theme files match project, VSIX
  and installed lengths/SHA-256; source CSS matches the installed stylesheet
  byte-for-byte. Both theme contributions, all 24 samples, sample configuration,
  both apply actions and ten icon attributions are verified. Runtime-only
  exclusions remain intact. No real user window was reloaded, theme changed,
  preview enabled, commit made, push performed or package published.

## Previous checkpoint: editable Info and anchored syntax

- Info uses the same always-visible color-input row as Warning and Error.
  Its Accent/Foreground/Custom radios sit underneath. Linked modes display
  the actual derived Info color, not the remembered custom seed. Editing either
  input selects Custom, including incomplete hex edits; only valid colors
  reach theme generation. Selecting a linked source replaces the displayed
  value and clears an invalid edit. Source changes preserve the custom color.
  Color-label rows share the existing 20px help-button height so the three
  severity inputs align exactly.
- The wheel is rotated to blue, violet, red, amber, green and teal. The
  accent-linked family is now Color 1 in the panel and native bracket cycle.
  Scope assignments, default syntax colors and the debugging color's violet
  family remain unchanged; that debugging family is now labeled Color 2.
- Syntax offers Auto/Anchored/Manual. Auto preserves the previous Simple syntax
  behavior. Anchored starts from visible Color 1 and exposes only that picker.
  Its hue/chroma/brightness drive the wheel independently of Interaction accent.
  Chroma Auto adds no second UI boost; Lightness Auto uses the chosen anchor
  brightness for chromatic families. Neutral and Comments retain their UI text
  links. Manual/Off lightness retain anchor-relative seed brightness.
- Entering Anchored clears offsets already baked into its new source. Editing
  the anchor also updates a captured wheel-lightness baseline. Selecting Manual
  captures exact current colors, including automatic anchor adjustments, and
  reveals all eight seed inputs. Reset palette appears beside the selector
  only in Manual; it restores seeds without changing the independent adjustment
  modes. Legacy `autoHue` booleans normalize to Auto/Manual, with mixed
  representations rejected. Serialized syntax parameters remain at fifteen.
- Type checking and 164 focused unit/evidence tests pass. All 22 real
  extension-host groups and 42 focused native UI groups pass, including
  Dark/Light draft isolation, workspace/export parity, always-editable Info,
  invalid-input recovery and mode-radio messages reaching the actual host.
  All three palette choices use complete grids without clipped labels at exact
  webview widths 320, 400, 540, 800 and 1200 px in both themes. Classic and
  Modern native color checks remain covered.
- Both native syntax reports were regenerated at schema 8. All 24 samples
  pass in grammar-only and semantic-enabled rendering for Dark and Light:
  96 sample/mode comparisons, each fully within tolerance 3. Maximum recorded
  errors remain 2.644 in Dark and 2.519 in Light. Additional actual-code and
  bracket/guide checks verify anchored edits, UI-accent independence, UI-linked
  Neutral/Comments, exact Manual handoffs and Cancel restoration. The deliberate
  wrong-color negative controls still fail as required.
- Review version 0.1.0 is rebuilt and force-installed: 209,577 bytes and
  37 ZIP entries. All six runtime/notice/base-theme files match project, VSIX
  and installed byte lengths/SHA-256; source CSS matches the installed style.
  Both theme contributions, 24 samples, sample configuration and all ten icon
  attributions remain present. Sources/tests/tools/reports/notes/maps/logs
  and test bundles remain excluded. User notes and git staging are untouched.
  No user window was reloaded, theme switched, preview enabled, commit made,
  push performed or package published.

## Previous checkpoint: native text, scrollbar opacity and product icons

- The native suggestion widget's selected text/icon defaults inherit
  `quickInputList` colors, which intentionally choose black text for a bright
  solid accent. Its generated selection background is translucent instead.
  Explicit `editorSuggestWidget.selectedForeground`,
  `editorSuggestWidget.selectedIconForeground` and
  `editorSuggestWidget.focusHighlightForeground` now use the shared selected
  text family. Both classic and Modern layouts receive all three tokens.
  Quick Pick/button foregrounds retain their contrasting black/white behavior.
- `textPreformat.foreground` is accent-derived rather than muted prose.
  The existing accent-text search adjusts lightness/gamut only as needed for
  4.5:1 against the unchanged `textPreformat.background`; no new numeric
  coefficient or input is introduced. A gallery inline-code example uses the
  generated pair. Native evidence reads the actual built-in Markdown preview,
  not hover code, which has a separate native foreground rule.
- Scrollbar/minimap normal, hover and drag thumbs plus scrollbar shadows
  bypass Overlay opacity, including at zero and two. Their fixed, distinct
  opacities retain visibility of underlying content. The render-family cache
  keys actual alpha so fixed and scaled opacity policies cannot collide.
  The optional quieter 35% tint remains independent and unchanged.
- All panel icons now use locally bundled default VS Code product artwork:
  help, chevrons, overflow, loading, window, layout, code, terminal and branch.
  There are no text-glyph stand-ins or host icon-font dependency. Native SVG
  view boxes and multi-path fill rules are retained, including the 24-unit
  terminal icon. Updated Codicons attribution is packaged with the notices.
  Narrow preview navigation accommodates the full-size icons without clipping.
- Type checking, 81 focused unit/evidence tests, 21 real extension-host groups
  and 38 focused native groups pass. Actual native suggestions, icons and
  match highlights stay readable with black-on-yellow primary-button text
  in Dark/Light and classic/Modern layouts. Real Markdown preview foreground/
  background and exported colors match. Native scrollbar paint stays unchanged
  when Overlay opacity changes; existing decoration, bracket, debugging and
  Cancel checks still pass.
- The shared browser tool was disconnected, so icon/layout evidence uses
  the real Themer VS Code webview instead. Ten native cases cover both modes
  at exact widths 320, 400, 540, 800 and 1200 px. They check actual mode-radio
  messages reaching the host, all ten icon IDs, accessible overflow labeling,
  centered SVGs, artwork bounds, navigation text and horizontal overflow.
- Regenerated [Dark](model-evaluation.md) and
  [Light](model-evaluation-light.md) UI reports retain 305/324 and 308/340
  generated explicit colors, 19/32 preserved, and 49/51 fixed numeric
  coefficients. Additional unscored outputs are now 48/45, for 372/385
  total UI colors. Raw tolerance-three rates are 89.180%/87.662%.
  The deliberate Dark inline-code color lowers its reconstruction score
  slightly; this is reported, not hidden. The frozen legacy-color check
  retains its original hashes with only the approved inline-code and Light
  selected-suggestion foreground changes excluded from that old contract.
  Stored syntax/bracket evidence stays fresh and was not recaptured.
- Review version 0.1.0 is rebuilt and force-installed: 207,166 bytes and
  37 ZIP entries. All six runtime/notice/base-theme files match project, VSIX
  and installed byte lengths and SHA-256; source CSS matches the installed
  stylesheet. Both theme contributions, all runtime samples and ten icon
  attributions remain present. Sources/tests/reports/notes/maps/logs are
  excluded. No user window was reloaded, theme switched, preview enabled,
  user notes edited, or commit made.

## Previous checkpoint: compact controls and complete-row layout

- The title and workspace actions share one header: Themer Lab/help on the
  left; Live Preview, overflow Export, Cancel, and Apply on the right. Narrow
  panels move the complete action group below the title. Busy/error status,
  host confirmation, valid-edit flushing, and restoration behavior remain intact.
- Theme and Info-source choices use segmented native radios. Chroma and
  Lightness each have explicit Auto/Manual/Off modes. Auto-to-Manual preserves
  exact generated syntax and brackets. Off matches the former group Reset:
  zero chroma boost, or zero lightness shift with its captured baseline cleared.
  It hides the slider, does not make syntax grayscale/black, and discards the
  previous manual adjustment. Manual at zero remains a distinct state.
- Both adjustment modes survive the atomic protocol, cached panel state,
  per-theme drafts, live settings, and export. Older boolean syntax parameters
  normalize explicitly, including stored native evidence; mixed old/new axis
  keys and nonzero hidden Off adjustments are rejected. No fitting coefficients
  or generated baseline colors changed, and native evidence was not rewritten.
- Boolean choices are accessible switches. Small local Codicon info/chevron
  artwork replaces the letter icon and browser disclosure marker, without an
  icon font, external request, or new dependency. Distribution notices include
  the Codicons attribution. Native details/summary keyboard behavior is retained.
- Section separators sit above their titles. Hex focus borders are inset and
  themed; invalid-input borders remain visible. Existing quiet range pointer
  focus and visible keyboard focus remain intact.
- Count-specific container grids use complete rows rather than auto-fit:
  three items use 3/1 columns; four use 4/2/1; eight use 4/2/1. Layout queries
  are independent of reduced-motion settings. Segment widths respect label
  content instead of allowing Manual to overlap its neighboring option.
- The component window aligns with the cards without an outer Preview card,
  heading, or host-sync badge. Its help is in the title bar, and preview code
  blocks have no second inner background. Compact real-editor sample actions
  now sit inside Syntax colors.
- Validation passes type checking, 139 focused unit/evidence tests, 21 real
  extension-host groups, and the standard 32 native groups covering both
  themes and actual classic/Modern layouts. Browser checks pass 101 interaction
  assertions and 792 layout cases across 33 widths from 320 to 1600 px, both
  theme-variable palettes, all adjustment modes, Simple syntax on/off, and both
  motion preferences. Checks include actual column density, complete rows,
  no horizontal overflow, segment text fit, preview alignment, unique IDs,
  exact handoffs, mode drafts, legacy/stale state, input errors, busy locking,
  tooltip bounds, and keyboard behavior.
- Review version 0.1.0 is rebuilt and force-installed: 203,385 bytes, 37 ZIP
  entries, all 24 advertised samples plus their tsconfig. Six runtime,
  attribution, and base-theme payloads have identical byte lengths and SHA-256
  across project, ZIP, and installed extension. Both native theme contributions
  remain present, and the installed host app root has no development-preview
  opt-in. No user window was reloaded, preview enabled, notes changed, or commit made.

### Existing Light-start native-test limitation

An additional `--mode light --ui-colors-only` run fails its initial-profile
snapshot comparison after the first Cancel: `chat.linesRemovedForeground`
changes from initial `#fc6a6a` to restored `#bc2f32`. The exact same assertion
and values reproduce against untouched commit `53ce7b8`, after 15 passing
groups. This is not introduced by the control changes. The standard focused
invocation already passes all 32 groups across Dark/Light and classic/Modern;
no unrelated chat-color or snapshot change is included in this pass.
The isolated baseline comparison and its dependency junction were cleaned up.

## Previous checkpoint: Personality and classic/Modern parity

- A collapsed Personality disclosure adds four independent, default-off
  switches: Accent active items, Tint overlays, Monochrome brackets,
  and Stateful status bar. They follow each mode's existing in-memory drafts.
  Reset all clears them; Reset syntax preserves them.
- The previous model handled Modern IDs present in the explicit references,
  but omitted some absent Modern counterparts. The pinned Modern UI contract's
  31 shared/frame/tab/activity/status IDs now have explicit generation rules,
  alongside classic tokens. Missing IDs are unscored; nulls remain unresolved.
- Active foregrounds start at Primary foreground lightness with the accent
  hue/chroma, gamut-limited, rather than button-accent lightness. Gray accents
  preserve Primary foreground. Contrast checks cover modeled active/hover
  backdrops and native alpha rounding. Solid accent fills retain readable
  black/white text; neutral surfaces that happen to match an achromatic accent
  are not mistaken for accent fills. Incompatible states have a visible
  Personality contrast advisory.
- Tint overlays shares the same opacity-controlled pipeline for nonsemantic
  surface/text/border/accent roles, not a separate neutral-background list.
  Existing accent selections, faint text and translucent borders participate.
  Lightness moves 65% toward the accent and chroma uses 65% of accent chroma,
  capped at 0.14. Alpha stays exact except the existing inactive-selection
  safety cap. Opaque selected/inactive-selection/activity/hover fills also tint,
  retaining their modeled lightness and opacity; this covers Dark inactive
  Explorer rows, terminal selections and the classic active-item indicator,
  plus opaque Light Modern activity pills. Ordinary opaque canvas/chrome,
  gray accents, clear colors and semantic overlays stay unchanged.
- A painted-chroma cap keeps opaque/high-opacity interaction fills near the
  shared active-selection tint at the current opacity on their own region backdrop.
  The previous inactive selection could expose 4-6 times the active selection's
  painted chroma. The cap lowers source chroma only, retaining alpha/lightness
  and the backdrop's existing color; both encoded and native CSS alpha are
  checked. Terminal backdrops follow terminal -> panel -> editor policy.
  The reference follows the slider, preserving the active tint at higher
  opacity and matching inactive saturation at lower opacity. Opaque fills stay
  opaque while their saturation cap tracks that reference.
  No new numeric fitting coefficient or per-token residual is introduced.
- Scrollbar/minimap normal/hover/drag fills, scrollbar shadows and resize grips
  use 35% of the regular tint chroma/lightness movement. Tests require at least
  a 50% chroma reduction against the previous full tint while preserving exact
  alpha and retaining strong interaction tint. Tint profiles are included in
  the family-render cache key so unrelated colors sharing a family do not
  inherit the wrong profile.
- Painted differences are tested at default opacity, including native CSS
  alpha rounding. The exercised native hover deltaE is 1.967 Dark and 1.230
  Light, versus the earlier near-invisible changes around 0.1-0.2. Raw source
  changes alone are not accepted as evidence.
- All six monochrome bracket levels follow resolved Neutral 7. Guide alpha
  remains distinct, unexpected brackets keep vivid Error treatment, and syntax
  tokens are unchanged.
- Stateful status uses accent for normal/inactive workspaces, resolved Color 6
  for debugging, and a quiet no-folder surface. Remote-item normal/hover colors
  remain separate. Text selects black/white by contrast. No debug-color,
  layout/density, or guide-visibility setting is changed by the extension.
- A shared resolved-theme pipeline drives controller state, live start/update,
  local gallery, browser host, and export. It avoids the debug source following
  monochrome bracket slot 6 accidentally.
- Fingerprints protect every previous default UI color byte (344 Dark, 361
  Light). Default output is now 369/384 colors, with 45/44 unscored additions.
  Captured generation stays 305/324 and 308/340, preserving 19/32. Raw fit rates
  remain 89.508%/87.662%; fixed coefficients are 49/51 and UI input count is 19.
- Native checks pass both themes and classic/Modern layouts, read all supported
  variables, inspect actual active-tab/status paint, score all 12 brackets
  across six levels, and run the real Node debugger. Debug coloring switches
  to Color 6 and respects `debug.enableStatusBarColor`; Cancel restores exactly.
  The isolated renderer is brought to the front before real Quick Input blur
  checks to avoid OS-focus races. No editor DOM focus mocking is used.
- Real file-decoration-provider new/modified colors and actual error/warning
  diagnostics override ordinary active accent text in both layouts. Native
  dirty tab icons change on a real unsaved edit and restore after save. The
  extension does not override user decoration settings to enforce this.
- Native checks read actual unfocused Explorer selection paint, classic activity
  indicators/Modern pills and visible scrollbar thumbs. The native test uses
  its isolated profile's effective Modern setting and verifies the real
  `modern-ui` marker. In the pinned runtime, the dynamic classic activity-fill
  rule can outrank Modern CSS; either selected token is generated and tinted.
- Actual active/inactive painted chroma is closely matched in the exercised
  native cases: 0.0199/0.0194 Dark and 0.0145/0.0131 Light. Native checks also
  cover Overlay opacity 0.5 and 2. The active selection keeps its requested
  strength, inactive saturation follows it, and opaque fills remain opaque.
- Final validation passes type checking, 213 unit/evidence tests, 20 real-host
  groups, and 32 focused native groups. The stored full syntax-corpus hashes
  remain fresh. Browser checks cover both modes at 320/480/800/1280/1600 px,
  expanded controls, all four gallery bindings, mode drafts, exact resets,
  stale acknowledgements, tooltips/busy states, and visible contrast advisories.
  The current consistency fix adds independent painted-chroma checks at
  0.5/1/2 opacity in both modes, exact reset restoration, and tooltip/layout
  checks at 320/800/1280 px.
  The fidelity report stays available in the HTML harness and hidden in
  production context.
- Quiet Chat/Markdown prose is deferred. User notes are not edited.

## Earlier checkpoint: focus, status/chat colors, and inactive selections

- Range controls suppress outlines during pointer interaction, even if Chromium
  retains `:focus-visible` from previous keyboard use. Keydown restores normal
  themed keyboard focus; blur clears the local pointer state. No hard-coded
  focus color or global keyboard-focus suppression is introduced.
- Prominent status items now share primary-button accent fills, contrast-selected
  black/white text and hover backgrounds. The supported hover foreground is
  generated even when absent from the Dark reference. Debug/remote status
  palettes remain preserved.
- Chat added/removed line counters use Added/Deleted; edited files still use
  Modified. Counter IDs are verified against the pinned native chat registry
  and emitted as unscored when absent from the explicit reference. Missing IDs
  are not treated as native capture success; explicit nulls remain unresolved.
  Other possible chat bindings are documented, not broadly overridden.
- Inactive editor selections preserve accent RGB and lower opacity only as
  needed for 4.5:1 against primary and actual code foreground on the composed
  canvas. Already-readable selections are unchanged. If the plain canvas is
  below target, the guard must not worsen its existing contrast.
- The cap checks both encoded 8-bit alpha and VS Code's actual three-decimal
  internal/two-decimal CSS alpha rounding. It searches the highest safe encoded
  opacity without assuming colored-background contrast is monotonic. Source RGB
  is never gamut-mapped again when changing alpha.
- Gallery state, real preview, updates and standalone export share the same
  manual/automatic syntax-aware guard. Active selections, occurrence highlights,
  syntax palettes, and unrelated UI colors keep their behavior. The contrast
  guarantee covers primary/code foreground, not every manually chosen token
  color or overlapping decoration.
- Type checking and all 192 unit/evidence tests pass. The real extension-host
  suite still passes 19 groups. Browser checks cover all six sliders in both
  modes using pointer/keyboard/blur events, with theme-colored keyboard outlines
  retained and pointer/touch outlines suppressed. Native pointer/keyboard
  testing also reproduces and verifies the original sticky-outline case.
- A focused isolated native test reads actual CSS variables and real unfocused
  selection rectangles through the existing loopback renderer. Both modes pass
  defaults, extreme accents, independent manual code foregrounds and exact
  Cancel restoration (eight checks). Native Dark code contrast improves from
  the reproduced 1.422 to 4.575; the independent manual case remains at 4.504.
  The tested extreme Light/manual cases retain 4.601.
- Existing native syntax evidence remains fresh for both generated palettes;
  the full corpus was not unnecessarily recaptured for these UI-only changes.
  Run the focused test with `npm run test:syntax -- --ui-colors-only`.
- Regenerated UI reports score 305/324 Dark entries, preserving 19, and 308/340
  Light entries, preserving 32. Additional unscored outputs are 20/21. Fixed
  coefficients are 43/45, including the contrast target, with no new controls.
  Raw within-tolerance rates are 89.508% Dark and 87.662% Light; UI fit metrics
  remain separate from contrast and native syntax fidelity.
- The README documents the current chat bindings, registered future candidates,
  DevTools CSS-variable enumeration, setting-key completion and the official
  registry source. User notes and their pre-existing local edits are untouched.

## Earlier checkpoint: native Light mode (`2569f34`)

- The Light theme toggle selects an independent Light 2026 capture from
  VS Code 1.143.1, commit `e646868227c3e3a9e3f24277c8c7220be42c0be7`.
  Its 340 explicit UI colors, 113 ordered syntax rules, four semantic styles,
  include order and four source hashes are recorded. Dark remains pinned to
  its existing capture; this is not a color inversion or a historical-theme mode.
- The same controls drive mode-specific native anchors and shared transforms.
  Light has quieter surface spacing and validation mixes, darker button hover,
  its own opacity profile, a 0.02 linked Info lift, and explicit native syntax
  seeds. Its syntax vocabulary adds positive-lightness headroom for inherited
  pale styles while retaining the same 15-degree hue bound and no per-token
  numeric corrections.
- Fifteen available UI inputs include the mode toggle; fourteen are visible by
  default. Dark uses 42 fixed coefficients; Light uses 44. Both have zero learned
  coefficients and zero per-token numeric residuals.
- Each mode keeps its valid UI and syntax draft, including precision snapshots,
  for the extension session. Switching back restores it. Reset and Reset syntax
  affect only the current mode. Closing/reopening the panel retains host-side
  drafts; window-reload recipe persistence remains future work.
- Native `vs-dark` and `vs` contributions select the correct workbench kind.
  Both use the shared `[Themer Lab Preview][Themer Lab Light Preview]` scope.
  Journals record applied/pending mode switches while retaining the original
  session snapshot. Cancel/close, Keep, interruptions and external edits are
  tested. Old version-1 single-theme journals restore their original scope.
  Export uses the selected mode's standalone `dark`/`light` metadata and colors.
- Light Auto Lightness softens anchors below 0.5 toward a 0.4 floor at black.
  Both modes retain the 0.85 white ceiling. UI endpoints and full manual shift
  endpoints stay unchanged. Exact captures and independent Auto axes still work.
  Native Light checks retain ten colored foregrounds with black UI text
  (minimum wheel chroma 0.07225), and eight with white (minimum 0.07518).
- Light omits the two diff line background IDs from its explicit reference.
  They now join the supported derived colors instead of staying at unrelated
  registered defaults. Light has 19 unscored colors versus Dark's 17. Native
  diff line/word paint responds to Added/Deleted and restores exactly on Cancel.
- All 184 unit/evidence tests and type checking pass. The real extension-host
  suite passes 19 groups. Browser checks verify native Light defaults, actual
  gallery paint, separate exact drafts, mode-specific resets, invalid-input
  recovery, stale mode/header protection, busy locking, and no overflow at
  measured CSS widths 360/700/1200 in both modes.
- Both full native suites pass all 24 samples in both highlighting modes,
  scoring every one of 18,744 non-whitespace characters per combination within
  tolerance 3. Maximum error remains 2.644 in Dark and is 2.519 in Light.
  Schema-7 evidence verifies the actual native theme kind, Auto guards/handoffs,
  brackets, guide paint, diff backgrounds and exact restoration.
- Every manual seed must change actual native characters in a corpus sample
  that uses its family. Witness files/counts are recorded; Light's gold family
  is exercised in Python rather than being forced into TypeScript. Manual
  controls are checked against exact encoded RGB outputs. The fitted-shade
  lightness algebra is unit-tested before black RGB quantization.
- Dark's 341 UI colors, manual/automatic syntax and bracket output remain exact.
  Light generates 304 explicit UI entries and preserves 36. Its raw UI fit
  has mean 2.267, p95 15.832, maximum 49.321 and 87.5% within tolerance 3.
  These explicit-theme measurements are not a claim of full registered-default
  fidelity or universal accessibility. Native Warning contrast advisories stay
  visible rather than silently changing the chosen source.
- References, base themes, current controls, CLI mode flags, reports and
  third-party provenance notices are updated. User notes and fonts are untouched.

## Earlier UI checkpoint: Info sources and signed surfaces (`53175c4`)

- Info has three exclusive native radio choices: Accent (default), Foreground,
  and Custom. Linked modes use the corresponding UI anchor, add 0.08 OKLCH
  lightness, preserve hue, and reduce chroma only when needed to fit sRGB.
  Custom uses its stored color unchanged and remembers it across linked edits.
  Only Custom shows an editable Info picker; linked modes show a derived swatch.
  Warning and Error remain independent.
- The default linked Info is `#4492B9`, with raw OKLab distance x100 of 0.828
  from the native `#3A94BC`, below tolerance 3. Only four Info-role outputs
  change by default; all 337 other UI colors are byte-identical. Selecting
  Custom with its original seed restores all 341 previous UI colors exactly.
  Marks, notification icons, validation colors, live preview, and export share
  the resolved Info color.
- The model reports fourteen available UI inputs and 42 fixed coefficients.
  Linked Info hides its custom seed, leaving thirteen visible inputs by default.
  The source selector is explicit and validated across the draft protocol;
  missing or unsupported source values are rejected, not silently defaulted.
- Surface separation now ranges from -3 to 3, with default 1. Zero flattens
  canvas-derived layers and negative values reverse their lightness order.
  The canvas, borders, foreground-derived overlays, accent/status backgrounds,
  syntax, and brackets stay independent. Opacity is unchanged. Near-black
  canvases have little darker headroom; extreme offsets can clip to black/white.
- Type checking and all 164 unit/evidence tests pass. The real extension-host
  suite passes 17 groups, including every Info source, inverted/flat surfaces,
  standalone export, Cancel/Keep, external-edit conflicts, and global-setting
  preservation.
- Browser checks cover source isolation, remembered Custom colors, hidden-field
  validation recovery, stale acknowledgements, busy locks, syntax independence,
  reset, signed slider bounds/steps, and actual gallery sidebar paint at
  -3/-1/0/1/3. Linked and Custom layouts have no horizontal overflow at measured
  CSS viewport widths 360/700/1200.
- UI fidelity reports are regenerated with the linked default and signed
  bounds. Stored native syntax evidence still matches current generation;
  syntax output and its existing native fidelity results are unchanged.

## Earlier syntax checkpoint: independent automatic axes (`6754dff`)

- Auto Lightness, Auto Chroma, and Auto Hue / Simple syntax are independent and
  on by default. Each hides its manual controls and Reset button while active.
  Auto Hue shows eight derived swatches, not ignored editable pickers.
- Auto Lightness uses UI Primary foreground lightness for ordinary code and
  brackets, and actual generated muted-text lightness for comments. Muted text
  contrast therefore controls comment brightness. One signed Lightness shift
  replaces the old target/equalization pair in manual mode.
- Bright anchors use a smooth automatic lightness roll-off: lightness through
  0.8 stays unchanged; higher values ease toward a maximum of 0.85 at white.
  A white Primary foreground no longer washes syntax/brackets out to white.
  The same monotonic curve protects bright comment anchors. UI colors, the
  full manual slider range, hue/chroma modes, and exact handoffs are unchanged.
- Auto Chroma derives a smooth accent-dependent boost bounded to +/-25% and
  neutral at the reference accent. White does not erase color and highly
  saturated accents do not force full manual boost. Each shade still uses its
  own gamut boundary. Neutral follows reductions only; true grays stay gray.
- Auto Hue aligns Color 5 to accent hue, not exact RGB, and rotates Colors 1-6
  by one shared angle. Original spacing, fixed scope assignments, and bounded
  per-seed variations remain. Neutral/Comments use UI foreground/muted anchors.
  Near-gray accents retain the original wheel orientation.
- Disabling Auto inherits its latest output without a jump: an exact boost,
  precision seed snapshots, or captured text/comment lightness targets with a
  zero manual shift. Re-enabling follows current anchors. Editing a captured
  seed replaces only its own snapshot.
- Manual group resets leave Auto off and other axes unchanged. Lightness resets
  shift to zero and clears captured targets; Chroma resets boost to zero;
  Palette restores original eight fitted seeds and clears snapshots. Overall
  Reset syntax clears all manual state and enables Auto using current UI inputs.
- Live preview, export, local illustration, and native brackets share the same
  resolved axes. Unexpected-bracket errors remain independently vivid. Preview
  ownership/journaling, Cancel/Keep, guide visibility, fonts, and other unrelated
  behavior are unchanged.
- Pinned-theme fidelity remains a measurement of the unchanged manual fitted
  baseline. Automatic defaults are intentionally coordinated with UI inputs
  and are tested separately, not mislabeled as reconstructing native defaults.
  Native evidence schema 6 covers both surfaces and reset/handoff behavior.
- Type checking and 95 focused unit/evidence tests pass, including every toggle
  combination, exact JSON-safe handoffs, reset isolation, and unchanged manual
  default output. The real extension-host suite passes 16 groups.
- Full native tests pass all 24 samples in both modes, with 18,744 scored
  characters per mode and maximum error 2.644 at tolerance 3. Separate Auto
  tests verify actual text/comment lightness, bounded accent chroma, hue/gray
  fallback, exact handoffs, manual anchor independence, and group resets.
  Native bracket/guide, diff-background, and exact setting-restoration checks
  also pass. With white UI foreground, all six wheel colors retain at least
  0.0805 chroma and the native syntax sample shows nine colored foregrounds.
  High muted contrast, capped handoffs, and actual bracket paint are covered.
- Browser checks verify default-only Auto controls, derived swatches, all eight
  visibility combinations, exact gallery handoffs, captured values, independent
  manual resets, current-UI overall reset, invalid-input recovery, stale
  acknowledgements, busy locking, and no horizontal overflow at CSS widths
  360/700/1200. Visual inspection confirms the compact default palette layout.
  White-foreground browser checks confirm scaled code/comment lightness,
  colorful syntax/bracket swatches, unchanged white UI text, exact handoffs,
  and uncapped manual white endpoints.
- User notes remain user-owned and untouched.

## Earlier per-color chroma boost checkpoint (`3b3cbc2`)

- Replaced the common chroma target/equalization pair with one **Chroma boost**
  slider, displayed from -100% to +100% with a default of 0%. The palette now
  has eight source pickers and three global sliders.
- Negative boost scales chroma toward zero; positive boost interpolates from
  each shade's original chroma to its own sRGB boundary at its final hue and
  lightness. A pale/dark shade no longer limits other colors. Zero preserves
  the fitted output; hue assignments and bounded variations are unchanged.
- Color 7 follows reductions only and never gains chroma. Comments follows
  both directions. True gray shades and achromatic seeds stay gray.
- The Lightness and Lightness equalization controls are unchanged. Their
  inactive target cannot affect chroma. Lightness edits may still need a
  per-color chroma reduction to fit sRGB; boost does not rotate hue or change
  lightness to force stronger color.
- The same adjustment drives TextMate, semantic tokens, the illustration,
  native bracket nesting colors, and derived guides. Unexpected-bracket
  errors keep their separate vivid, contrast-aware treatment. UI colors,
  setting ownership, recovery, and export behavior remain unchanged.
- Unit and native coverage checks signed/partial endpoints, monotonic chroma,
  per-color limits, seed isolation with boost active, hue/lightness rounding,
  neutral/gray preservation, lightness independence, and exact restoration.
  The native report records the three-control model and these interaction
  checks in schema 5.
- Exact before/after comparison preserves all 341 default UI colors, 118
  TextMate rules, four semantic styles, code foreground, and 19 bracket colors.
  Type checking and 82 focused unit/evidence tests pass. Extension-host tests
  pass; the native suite still scores all 18,744 characters per mode within
  tolerance 3, with maximum error 2.644. Native boost, guide, diff, and exact
  restoration checks pass separately from reconstruction fidelity.
- Browser checks verify eight pickers/three sliders, signed percentages,
  grayscale/positive endpoints, visibly stronger comments and bracket colors,
  no cross-seed gamut ceiling, Neutral/error preservation, inactive lightness
  target independence, reset, and no overflow at actual CSS widths
  360/700/1200. Native range stepping updates the draft and accessible value.
  Arrow-key automation was inconclusive in the integrated browser; no custom
  keyboard handler was introduced.
- User notes remain untouched. Fonts, light themes, and other note items are
  outside this change.

## Native bracket palette checkpoint (`3250b3a`)

- Colors 1-6 now also drive native bracket nesting levels, cycling after six.
  They share the syntax equalization/gamut handling, without new controls or
  extra hue rotations. The sample and illustration show six matching pairs.
- Generated active/inactive guide colors use the same palette at 65%/25%
  opacity. Guide visibility and per-bracket-type behavior remain untouched.
  Matching-bracket boxes continue to use UI focus/border styling.
- Unexpected brackets use the Error hue with maximum displayable chroma up
  to 0.3 and a contrast-aware lightness that meets 4.5:1. It ignores ordinary
  syntax equalization. Error seeds below 0.01 chroma explicitly use vivid red;
  the ordinary Error input is not changed. Mid-gray backgrounds can limit the
  achievable intensity when text contrast is required.
- Live preview enables workspace bracket pair colorization, with journaled
  previous/applied/pending state. Cancel/panel close recover false, true or
  absent settings; external edits are preserved and stop further writes.
  Older journals do not acquire ownership of the new behavior setting.
- The original syntax tests remain bracket-isolated through temporary
  language-specific overrides. A separate native eight-depth bracket sample
  verifies six-slot cycling, matching pairs, active/inactive guide paint,
  seed/equalization/Error edits, fallback red, and exact palette/state restore.
- Native bracket defaults are captured from the installed renderer, including
  the default error alpha. They are not invented from the theme fixture.
  Themer's rainbow intentionally uses the six existing seeds, not the native
  rainbow order; its 19 generated colors do not inflate fidelity scores.
- A focused `npm run test:brackets` selector avoids recapturing the entire
  syntax corpus for bracket-only changes. Test bundles and profiles remain
  development-only.
- Type checking and 138 focused unit/regression tests pass. The extension-host
  suite passes 15 groups. The full native suite passes both modes for all
  18,744 characters: mean 0.448/0.439, p95 1.707, maximum 2.644, all within 3.
- Browser checks confirm the input count is unchanged, all six opening/closing
  preview colors match, seed edits are isolated, muted/gray Error colors work,
  equalization cannot mute bracket errors, reset works, and widths 360/700/1200
  have no horizontal overflow.
- The untracked user notes are untouched. Fonts, light themes, monochrome
  toggles, and other notes are outside this change. The notes are excluded
  from local VSIX packages as well.

## Panel UI fixes and change-color controls

- Committed the reviewed numbered-seed, separate-comments, independent
  equalization/cap checkpoint as `97c324a` before these changes.
- Panel body text now explicitly uses the native UI foreground. VS Code's
  injected webview editor-foreground style no longer makes section titles follow
  syntax Neutral. Browser checks change those two variables independently.
- Range inputs have simple theme-colored tracks/thumbs and retain native
  keyboard operation. No custom slider widget or dependency was added.
- Added three independent UI source colors: Added `#73C991`, Deleted `#F48771`,
  Modified `#E5BA7D`, seeded from explicit Git decoration colors.
- These drive Explorer/SCM labels, editor/minimap/overview change markers,
  transparent diff backgrounds, merge-change backgrounds, and edited-file
  indicators. Untracked files use Added; renamed/copied files use Modified.
  Conflicts and ignored-file colors remain preserved.
- Diff line backgrounds use source RGB at 15% opacity; word backgrounds use
  30%. Overlay opacity scales them. Standard replacements remain removed plus
  inserted; no nonexistent modified-line color is generated.
- The source renderer is shared with severity inputs, not duplicated. All 285
  previously generated colors match the prior checkpoint byte-for-byte.
  Seventeen previously preserved explicit change colors are newly generated
  and scored; fourteen additional supported change IDs join the three unscored
  severity IDs. Unsupported notebook color IDs are not invented.
- The gallery shows real generated file-label colors and an illustrative diff.
  Native tests open an actual diff editor, recolor line/word backgrounds twice,
  and verify exact Cancel restoration.
- Type checking and 110 focused tests pass, plus all 14 extension-host groups
  and the full native syntax/diff suite. Browser checks cover heading isolation,
  keyboard sliders, independent change inputs, invalid-input/reset behavior,
  syntax isolation, and no overflow at widths 360/700/1200.

## Earlier independent-equalization and comments checkpoint (`97c324a`)

- Committed the reviewed seven-family/shared-equalization checkpoint as
  `16de910`, after type checking and all 64 then-current focused tests passed.
- The six movable seeds are now **Color 1** through **Color 6**, with original
  native color names in their descriptions. **Color 7 - Neutral** and a dedicated
  **Comments** picker are separate. Comment scopes always follow Comments,
  including delimiters, regardless of their native hue.
- Chroma (0-0.3, default 0.12) and Lightness (0-1, default 0.8) each have their
  own equalization slider (0-1, default 0). Each target is inert when only its
  own equalization is zero. Chroma-only adjustments preserve lightness;
  lightness adjustments preserve chroma unless sRGB gamut limits require less.
- Neutral chroma is a non-boosting cap, not an inverse fade. Higher targets
  preserve existing tints; lower targets reduce them by Chroma equalization.
  Neutral uses the requested cap, not the shared ceiling for other hues.
  Comments follow ordinary global chroma/lightness adjustments.
- Common chroma limits use each shade's actual adjusted lightness, so an
  inactive lightness target cannot affect chroma. Hue bounds remain +/-15
  degrees; Neutral and Comments have no fitted hue offset.
- Complexity: eight source colors, four sliders, 34 family/color assignments,
  117 foreground assignments, and the same shared bounded vocabulary. No
  learned numeric coefficients or per-token numeric residuals.
- Type checking and all 68 focused tests pass. Native comparisons cover all
  18,634 non-whitespace characters per mode: 100% within tolerance 3, mean
  0.450 (grammar) / 0.440 (semantic), p95 1.707, max 2.644.
- Native interaction tests verify each picker and slider, isolated comments and
  neutral code, independent adjustment axes, actual non-boosting neutral caps,
  and exact Cancel restoration. The extension-host suite passes all 13 groups.
- Browser checks verify numbered labels, eight pickers/four sliders, independent
  comments, neutral caps, inactive-target independence, draft validation/reset,
  stale acknowledgements, busy locking, and widths 360/700/1200 without overflow.
- The unused navy header and overridden green comment remain visible outliers
  in source-rule diagnostics; neither is excluded to improve the native score.

## Earlier bounded-family checkpoint (`16de910`)

- Replaced the earlier purpose-based renderer with seven native-color seed
  families: Red, Amber/gold, Green, Teal, Blue, Violet, and Neutral. The original
  renderer is preserved in commit `c47c620`.
- Fixed family assignments are primarily color-based. Small hybrid safeguards
  keep syntax error/deletion colors together, insertion colors together, and
  warning colors together. Descriptions and native-color coverage show the
  unrelated purposes that still share a family.
- Hue offsets are bounded to +/-15 degrees before RGB quantization; neutrals
  have no rotation. Seeds never mix hues, and editing does not refit groups.
- Added target chroma (0-0.3, default 0.12), target lightness (0-1, default 0.8),
  and equalization (0-1, default 0). Targets are inert at zero; full equalization
  unifies lightness and chromatic intensity while retaining each bounded hue.
  Neutral tints fade to gray, and achromatic seeds do not acquire color.
- A common displayable target chroma avoids unequal per-hue clipping at full
  equalization. Gamut limits are displayed, and chroma reduction never changes
  the requested hue. Partial equalization retains shade hierarchy.
- Complexity is explicit: seven color inputs plus three global sliders,
  41 shared lightness offsets, 14 chroma scales, 7 bounded hue offsets,
  32 family/color assignments, and 117 foreground assignments. No per-token
  numeric residuals or learned numeric coefficients.
- Native tests pass all 18,634 non-whitespace characters in each mode at
  tolerance 3: mean 0.506 (grammar) / 0.497 (semantic), p95 1.707, max 2.644.
  The unused legacy navy header remains an outlier in source-rule diagnostics;
  it is not removed from statistics or given a wide rotation.
- Real editor tests verify seven seeds, three sliders, equalized rendered
  lightness, independent UI inputs, and exact Cancel restoration.
- Type checking and all 64 focused tests pass. Packaging excludes generated
  debug logs as well as native/extension-host test bundles.
- Browser checks cover seven pickers/three sliders, seed colors staying in
  family, target inactivity at zero, global effects, gamut messages, reset,
  invalid input, busy locking, and layouts at 360/700/1200 pixels.
- The established review workflow now builds and force-installs the VSIX at
  review checkpoints, then leaves panel closure and window reload to the user.

## Earlier syntax generator and native validation

- Eight syntax pickers are now available in the panel, separate from the ten
  UI controls. Valid edits immediately update generated illustration colors.
  Editing syntax selects the Syntax tab. Syntax-only reset preserves UI inputs.
- Live preview writes theme-scoped TextMate and semantic rules as well as
  independent code text and UI colors. Recovery snapshots include all writes;
  Cancel/panel close restore owned settings and preserve external edits.
  Older UI-only journals remain recoverable without touching syntax.
- Export now includes generated TextMate and semantic colors plus independent
  code foreground. Eight representative syntax contrast checks warn on poor
  contrast without changing the user's inputs.
- Added an independent eight-source syntax model with shared quantized OKLCH
  variants. It generates ordered TextMate and semantic colors, retaining source
  selectors, font styles, and semantic style fields.
- Default sources come from explicit syntax scopes, not UI accent, foreground,
  or diagnostic controls. Escapes/placeholders and regex-set marks share the
  native keyword source.
- Fitting selects categorical recipes from a reported shared vocabulary:
  21 lightness offsets, 8 chroma scales, and 12 hue rotations. It does not learn
  per-token numeric corrections. Input count is reported separately from the
  76 distinct role/color assignments. Foreground assignments are reported
  separately from the input count.
- `npm run test:syntax` launches an isolated profile and uses native computed
  editor foregrounds as the reference. It compares all source characters in all
  24 samples before and after applying generated colors, in both highlighting
  modes. Whitespace does not inflate the score.
- Both modes pass for all 18,634 non-whitespace characters at tolerance 3
  (OKLab distance x 100); maximum error is 2.691, p95 is 2.369, and mean errors
  are 0.801 for grammar-only and 0.793 for semantic-enabled.
- Four built-in semantic providers are tested, returning 172 tokens across
  TypeScript, TSX, JavaScript, and HTML. Other languages use their native
  grammars; third-party extensions are disabled.
- Missing lines/colors, changed source text, provider changes, source-hash
  mismatches, and stale stored evidence fail explicitly. A deliberately green
  keyword input must fail an exact-match negative control.
- The native test now uses the actual plugin PreviewSession, including scoped
  syntax writes. All eight inputs visibly affect a real editor and Cancel
  restores the exact native foregrounds.
- The installed application updated to VS Code 1.143.1 during integration.
  Its four bundled theme files are byte-identical to the pinned 1.143.0
  reference. Native reports now record the actual runtime version/commit
  separately and still fail on any changed theme-source hash.
- Detailed [native results](syntax-evaluation.md),
  [assignments and comparisons](syntax-evaluation.json), and
  [baseline provenance](syntax-native-baseline.json) are saved in the repository.
- Integration validation passes type checking, 58 focused unit tests, the native
  comparison, and production build. Packaging includes all 24 samples and their
  project configuration; the native debugging/test bundle is excluded.
- Browser checks verify all eight controls visibly recolor generated samples,
  UI/syntax independence, rapid combined edits, syntax-only reset, invalid hex
  recovery, and layout at widths 360/700/1200.
- No normal-profile installation, reload, or theme change was performed.

## Earlier syntax sample groundwork

- Added 24 checked-in source-file types under [samples](../samples), including
  programming languages, markup, configuration, scripts, and embedded code.
- **Themer: Open Syntax Sample** and the panel's **All languages...** button
  open the same native picker. The existing TypeScript/JSON/Python shortcuts
  now open the bundled files rather than untitled copies.
- All 24 files open in their expected native language modes in the isolated
  extension host. Repeated openings reuse one sample editor group and do not
  change theme settings.
- TypeScript, TSX, and JavaScript have a dependency-free, checked sample project.
  Other semantic highlighting still depends on the installed language providers.
- At that earlier checkpoint syntax remained unchanged. The independent palette
  has since been integrated as described above.
- Type checking, 12 focused unit tests, production build, and packaging pass.
  The VSIX contains all 24 samples plus their TypeScript project configuration;
  each bundled file matches its source bytes.
- Browser checks confirm the picker action, existing shortcut actions, busy
  disabling, and zero horizontal overflow at widths 360, 700, and 1200.
- The updated VSIX was not installed into the normal editor profile.

## Input refinement after the checkpoint

- Removed separate accent saturation/lightness sliders and their model inputs.
  These adjustments now come from the source color input alone.
- Extended surface separation to 3.
- Extended border definition to -2 through 2. Zero matches canvas RGB; negative
  values invert neutral borders relative to the canvas, including
  foreground-derived borders. Alpha, clear borders, and accent/status borders
  are unchanged. Extreme values can clamp to black or white.
- The model-size selector and alternate models are removed. One model exposes
  all ten controls from startup, with no inactive-control gates.
- Added independent Info, Warning, and Error color inputs, seeded from reference
  notification/error colors. They drive marks, notification icons, validation
  surfaces, and readable badges without changing unrelated palettes.
- Three supported editor severity tokens absent from the reference are generated
  and labeled unscored. Explicit null values remain unresolved.
- Text/icons on generated accent fills now choose black or white automatically
  using WCAG contrast, independently of the primary foreground input. This
  covers primary/prominent buttons, accent badges, and focused Quick Pick rows.
- The original 264 generated colors remain unchanged; 21 previously preserved
  severity colors are now generated and scored separately from the additional
  unscored editor tokens.
- At that checkpoint, all 69 unit tests and the isolated real-workspace tests passed, including
  surface separation 3 and negative/zero border settings.
- Browser controls expose the expected ranges and immediately update the
  palette: a default canvas of `#121314` yields panel border `#010102` at -1
  and `#121314` at zero, without changing accent borders.

## Implemented

- Reproducible Dark 2026 reference capture from VS Code 1.143.0, commit
  `2d0b7506a36c1d6db9a466440131a8e01eab2289`.
- Four inherited source files with SHA-256 hashes and per-color provenance.
- 324 explicit workbench colors, 118 ordered syntax rules, and 4 semantic styles.
- A pure, typed color engine using culori, OKLab/OKLCH operations, explicit
  gamut mapping, alpha transforms, and separate approximate compositing metrics.
- Semantic role selectors, 26 shared color transforms, and 15 opacity transforms.
- One UI model with nine source colors and four always-active shape controls.
- A responsive webview with controls, component/state previews, illustrative
  code, real-editor sample actions, raw/alpha error metrics, and contrast warnings.
- Twenty-four bundled syntax samples and a native language picker.
- Opt-in workspace-scoped live updates using a dedicated contributed theme.
- Serialized/debounced writes, intent journaling, interruption recovery,
  preservation of unrelated/external edits, cancellation, explicit persistence,
  and automatic restoration when the panel closes.
- Standalone theme JSON export with generated severity, change, and syntax colors,
  independent code foreground, and preserved remaining status palettes.
- An isolated F5 configuration, isolated extension-host tests, and a local VSIX.

## Measured model result

See the generated [full evaluation](model-evaluation.md) and
[machine-readable data](model-evaluation.json).

The model now scores 302 explicit colors rather than the earlier 285. Fidelity
percentages are not directly comparable between those cohorts. All 285 old
generated colors are unchanged; the additional 17 change colors remain scored
even where a single coherent input differs from native inconsistencies. The
worst RGB error is the error badge's deliberate white-to-black text change for
readability; it remains scored rather than hidden as an exception.

| Measure | Result |
| --- | ---: |
| Logical source-color controls | 9 |
| Always-active shape controls | 4 |
| Fixed numeric coefficients | 41 |
| Semantic selectors | 98 |
| Learned numeric coefficients / per-token residuals | 0 / 0 |
| Generated reference workbench colors | 302 |
| Preserved workbench colors, excluded from fit statistics | 22 |
| Additional generated severity/change tokens, unscored | 17 |
| Unresolved explicit entries | 0 |
| Generated coverage of explicit reference | 93.21% |
| Mean raw OKLab distance x 100 | 1.716 |
| 95th percentile raw error | 8.210 |
| Maximum raw error | 100.000 |
| Generated colors within raw tolerance 3 | 272 / 302 (90.07%) |
| Mean approximate rendered error | 1.520 |
| Maximum approximate rendered error | 100.000 |
| Maximum absolute alpha error | 0.251 |
| Advisory baseline contrast checks | 33 passed / 0 failed |

The tolerance is configurable. Raw success percentage does not test alpha or
contrast. Rendered scores use heuristic backgrounds, not actual workbench
pixels. A color picker counts as one logical control, but contains three color
channels; this is not a claim of only three mathematical degrees of freedom.

The initial measured result exposed incorrect inactive/chrome and navigation
state selectors. Those were corrected and regression-tested. Edited-file
markers now follow Modified rather than the general UI text family.
Slash-command colors remain generated and scored despite their large remaining
errors; they were not excluded to improve the headline percentage.

## Verified

### Automated checks

- Prior UI checkpoint: `npm run check` passed type checking, 69 unit tests, and
  the production build.
- Syntax groundwork: type checking, the 12 focused sample/validation/export
  tests, production build, and VSIX sample-byte checks pass.
- Interactive syntax: 58 focused tests cover protocol, both palettes, export,
  native evidence, representative contrast, and preview recovery/conflicts,
  including partial start/update/restore writes and old UI-only journals.
- Repeated capture produces identical reference hashes.
- Exact black/white color-distance boundaries and configurable thresholds pass.
- All ten inputs, preservation, gamut/alpha
  validity, and deterministic generation pass.
- Black/white accent foregrounds are tested across every 8-bit gray level,
  representative hues, the `#00AEFF` example, and primary text/shape edits.
- Export includes inherited colors and syntax without an external include.
- Export preserves computed black on-accent text instead of restoring baseline
  white.
- Severity tests cover independent controls, validation colors, readable badges,
  supplemental coverage, explicit reference/null behavior, and rejection of
  fabricated supplemental outputs.
- Preview unit tests cover restoration, external edits, failed/partially applied
  writes, recovery, persistent keep, removed keys, and invalid journals.
- `npm run package` produces a local VSIX without installing or publishing.
- Archive inspection confirms runtime assets, baseline theme, and notices;
  development sources, dependencies, tests, fixtures, reports, and sourcemaps
  are excluded.

### Actual VS Code integration

`npm run test:extension` passes in a temporary profile and scratch workspace:

1. Extension activation, commands, and actual webview ready handshake.
2. All 24 on-disk sample files open in native language modes without theme writes.
3. Pinned baseline, generated coverage, and standalone export shape.
4. Scoped syntax updates, independent code text, UI/syntax isolation, and syntax reset.
5. Info/Warning/Error independently update severity colors, editor marks, and badges.
6. Bright accent `#00AEFF` writes black text/icons; a dark blue restores white.
7. Real workspace preview start and accent update; severity colors stay independent.
8. Surface separation 3 and negative/zero border definition reach workspace colors.
9. Cancellation restores UI/syntax ownership and retains unrelated edits.
10. External edits to owned UI values stop updates and survive cancellation.
11. External TextMate and semantic edits also stop writes and survive cancellation.
12. Explicit keep persists the workspace theme and both syntax rule sets.
13. Closing the panel restores UI and syntax; global settings stay unchanged.

The native syntax suite additionally measures full computed foregrounds on
VS Code 1.143.1 with verified byte-identical reference theme sources.

The temporary host/profile/workspace were removed after the test process exited.

### Browser interaction and layout

The browser-only mock verifies:

- All six source colors and four numeric sliders are available without
  selecting a model size.
- Info/Warning/Error immediately update their rendered chips and sync
  independently of accent. Escape restores the last valid severity draft;
  Reset restores all three severity defaults.
- Accent changes immediately recolor the component preview and send revisions.
- Invalid hex input is marked invalid and is not sent to the host.
- Reset syntax preserves an incomplete UI hex edit. Other acknowledgements do
  not silently discard invalid drafts in either palette.
- Stale host messages do not replace newer local edits.
- Apply/Cancel are disabled when no live preview exists.
- Raw RGB limitations and alpha metrics are visible.
- The sample picker and three shortcuts send their expected actions and disable
  while the host is busy.
- No horizontal document overflow at viewport widths 1200, 700, and 360 pixels.

For example, setting accent to `#00AEFF` immediately makes normal/hover button
text black, with approximately 8.50:1 normal-state contrast. Setting dark blue
`#0000ff` changes it back to white. Primary text and preserved status colors are
unchanged. Reset restores the default palette.

Browser tests are not evidence of native component rendering; the separate
extension-host test checks real workbench updates.

## Important remaining work

- **No optimized inverse fitting yet.** The first model uses explicit anchors
  and hand-specified family rules.
  Next research should compare bounded learned family coefficients and model
  complexity, not add per-token corrections.
- **Not a full resolved theme capture.** Registered defaults, extension defaults,
  and user customizations are outside this 324-entry reference. A development-only
  runtime CSS-variable probe/catalog comparison is a separate next milestone.
- Slash-command foreground/background and several inherited legacy accents are
  remaining fidelity outliers. Alpha differences require separate review.
- Thirty illustrative contrast pairs are not an accessibility certification.
  Intentionally edited palettes can introduce contrast failures.
  Near the black/white switch, a button's shared normal/hover foreground can
  still fall below target in one state; both are checked and reported.
- Remaining status palettes, terminal ANSI, and unknown palettes stay
  preserved. Syntax is generated; language-provider coverage and user overrides
  still need broader testing beyond the built-in native test environment.
- Draft parameters are in-memory only; save/reopen recipes are not implemented.
- Light/high-contrast models, arbitrary-theme import, complete language/state
  galleries, and release performance/accessibility review remain future scope.
- VS Code does not expose atomic settings compare-and-swap. Avoid concurrent
  editing of the same owned theme keys from multiple windows.
- Human review must approve model acceptance, UX, current-window installation or
  reload, licensing, publisher identity, and eventual publication.

## Review options

- Press F5 with **Run Themer Lab** for the isolated development window.
- Follow [README instructions](../README.md) to run the checks or regenerate
  the browser-only layout harness.
- The approved [local VSIX](../artifacts/themer-lab-0.1.0.vsix) is installed.
  Open **Themer: Open Theme Maker** in the Command Palette. Installation does
  not imply permission to reload or enable live preview.
