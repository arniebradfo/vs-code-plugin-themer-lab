# Native syntax color evaluation

Reference: **2026 Light** (Light 2026), VS Code **1.143.1**, commit `e646868227c3e3a9e3f24277c8c7220be42c0be7`.
Native execution: VS Code **1.143.1**, commit `e646868227c3e3a9e3f24277c8c7220be42c0be7`. All bundled reference theme files are verified byte-identical by SHA-256; a changed theme source fails even when the application version is unchanged.

The source of truth is computed foreground RGB from the actual VS Code editor, not a second implementation of TextMate or a comparison of theme rule names.

## Method

- Tolerance: **3** in Euclidean OKLab distance x 100, the same metric as the UI experiment. Every non-whitespace character must meet it; there is no percentile escape hatch.
- The baseline is captured first with no theme customizations. Generated rules are then applied only in the temporary workspace and captured again.
- Generated colors are applied through the plugin's real PreviewSession, including its theme-scoped TextMate and semantic settings, not through a test-only unscoped substitute.
- All 24 complete sample files are checked in grammar-only and semantic-enabled modes. Missing lines, mismatched source text, missing colors, or changing provider coverage fail the test.
- Each seed must recolor actual characters in a corpus sample that uses its native family. Manual controls must produce the exact encoded generated RGB for each shade. Transform algebra is separately unit-tested before RGB quantization, which can hide nonzero fitted lightness inside black.
- Whitespace is excluded from statistics. Source tabs are expanded to four-column stops; reported columns are visual columns. The metric measures CSS foreground colors, not antialiased screen pixels.
- Third-party extensions are disabled. Built-in semantic providers are required for TypeScript, TSX, JavaScript, and HTML. Other samples test their native grammars, not unavailable semantic providers.
- Language-scoped bracket colorization overrides isolate the original syntax foreground tests while the plugin still enables workspace bracket colorization. A separate bracket-enabled native sample verifies all six slots, guides, error colors and setting restoration.
- Inline color swatches, inlay hints, unused/deprecated fading, validation decorations, and sticky scroll are disabled to isolate syntax foregrounds.
- All four installed theme source hashes must match the pinned capture. The actual application version/commit is recorded separately, so a patch release with identical theme files is not mislabeled as the original runtime. Each sample has a SHA-256 hash.
- A negative control changes Color 3 to green; it must fail an exact-match check independently of the requested reconstruction tolerance.
- An additional integration check opens a real diff editor, changes Added/Deleted twice, reads line/word background CSS, and verifies exact restoration. These background checks are separate from the syntax foreground fidelity score.

## Independent inputs and complexity

Six numbered color seeds, Color 7 for neutral text, and a dedicated Comments seed come from explicit native scopes, not UI inputs. Color 1 is the originally blue, accent-linked family; the remaining wheel is rotated without regrouping scopes. Error/deletion scopes follow Color 3, additions Color 5, warnings Color 4. Comment scopes are separated from neutral text regardless of native hue.
Fitting chooses discrete lightness/chroma variations and hue offsets bounded to +/-15 degrees; neutrals and comments have no hue offset. Generation never reads the original target RGB. All groups use the same reported vocabulary, with no learned numeric coefficients or per-token numeric corrections.
Manual controls are signed Chroma boost and Lightness shift. Negative chroma scales toward zero; positive chroma uses each shade's own headroom. Lightness shifts each shade toward black or white. Zero preserves the fitted manual baseline; Color 7 follows chroma reductions only, and true grays stay gray.
The palette selector offers Auto, Anchored and Manual. Auto retains the three original automatic behaviors: Lightness follows Primary foreground, Comments uses generated muted text, Chroma uses an accent-derived boost within +/-25%, and Color 1 aligns to accent hue while rotating the wheel. Gray accents keep the original orientation. Anchored uses a single chosen Color 1 for wheel hue, chroma and brightness; Neutral/Comments keep UI text links. Native tests edit this anchor twice, verify independence from Interaction accent and UI text links, and capture exact Anchored-to-Manual colors. Group resets remain manual. Automatic and anchored output is separate from pinned-palette reconstruction.
Auto Lightness rolls off to a maximum of 0.85 at white. Light mode also eases dark anchors toward a minimum of 0.4 at black, keeping code and brackets colorful on white. UI endpoints and the full manual shift range are unchanged. Native colors must retain chroma above 0.03 at the protected endpoints, and disabling Auto must capture them exactly.

| Input | Default |
| --- | --- |
| Color 1 | `#0550ae` |
| Color 2 | `#af00db` |
| Color 3 | `#cf222e` |
| Color 4 | `#795e26` |
| Color 5 | `#116329` |
| Color 6 | `#267f99` |
| Color 7 - Neutral | `#1f2328` |
| Comments | `#6e7781` |

Fitted manual defaults: chroma boost 0, lightness shift 0. Both sliders range from -1 to 1, with 0 preserving the fitted palette. The actual extension starts with all three Auto modes on.

Vocabulary: 65 lightness levels, 14 chroma levels, 7 hue offsets; 34 distinct role/color assignments and 113 foreground assignments.

## Actual rendered sample results

| Mode | Files | Characters | Native colors | Mean error | p95 | Maximum | Within tolerance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| grammar-only | 24 | 18744 | 22 | 0.641 | 2.519 | 2.519 | 100.000% |
| semantic-enabled | 24 | 18744 | 22 | 0.622 | 2.519 | 2.519 | 100.000% |

## Native bracket palette checks (separate from syntax fidelity)

A bracket-enabled sample with eight nested pairs and an unexpected closing bracket captures actual native colors before preview. Its defaults are recorded here because they are registered fallbacks, absent from the pinned theme JSON.
Themer deliberately uses Colors 1-6 instead of fitting the native rainbow order. These checks require exact generated output in the real editor, not a claim that the new bracket palette reconstructs the default rainbow.

| Nesting depth | Native foreground | Themer foreground |
| ---: | --- | --- |
| 1 | `#0431fa` | `#0550ae` |
| 2 | `#319331` | `#af00db` |
| 3 | `#7b3814` | `#cf222e` |
| 4 | `#0431fa` | `#795e26` |
| 5 | `#319331` | `#116329` |
| 6 | `#7b3814` | `#267f99` |
| 7 | `#0431fa` | `#0550ae` |
| 8 | `#319331` | `#af00db` |

Native unexpected bracket: `#ff1212cc`; generated vivid Error hue: `#eb0006`. Native alpha is retained rather than treated as an opaque source.
Generated guide paint colors: `#795e2640`, `#11632940`, `#af00db40`, `#af00dba6`, `#cf222e40`, `#267f9940`, `#0550ae40`.

- All six seeds, signed chroma/lightness controls, automatic modes and exact handoffs, muted Error hues, and achromatic red fallback are checked in the actual bracket renderer. Measured bracket chroma must be monotonic and follow each color's own headroom, preserving hue/lightness within 8-bit RGB rounding tolerance.
- Opening/closing pairs match and the six-slot sequence repeats. Inactive guides use 25% opacity; the active guide uses 65%. Their colors follow the same seeds.
- Cancel restores the exact native rainbow and guides, and restores an initially disabled bracket-colorization setting. Guide visibility is not changed by the plugin.
- Unexpected-bracket colors maximize available chroma up to 0.3 while meeting 4.5:1 against the editor background, independently of ordinary syntax adjustments. Mid-gray backgrounds can require a lower-chroma near-black/white color to meet that contrast.
- These 19 generated bracket/guide colors are separate from the UI and syntax fidelity totals. No missing native source values are invented.

## Per-file results

| Sample | Mode | Characters | Semantic tokens | Mean error | Maximum | Within tolerance |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| [theme.ts](../samples/theme.ts) | grammar-only | 1366 | off | 0.616 | 2.519 | 100.000% |
| [card.tsx](../samples/card.tsx) | grammar-only | 913 | off | 0.529 | 2.519 | 100.000% |
| [palette.js](../samples/palette.js) | grammar-only | 774 | off | 0.571 | 2.519 | 100.000% |
| [theme.py](../samples/theme.py) | grammar-only | 918 | off | 0.714 | 2.519 | 100.000% |
| [theme.go](../samples/theme.go) | grammar-only | 857 | off | 0.562 | 2.519 | 100.000% |
| [theme.rs](../samples/theme.rs) | grammar-only | 938 | off | 0.571 | 2.519 | 100.000% |
| [Theme.java](../samples/Theme.java) | grammar-only | 914 | off | 0.906 | 2.519 | 100.000% |
| [Theme.cs](../samples/Theme.cs) | grammar-only | 968 | off | 0.705 | 2.519 | 100.000% |
| [theme.c](../samples/theme.c) | grammar-only | 724 | off | 0.506 | 2.519 | 100.000% |
| [theme.cpp](../samples/theme.cpp) | grammar-only | 1012 | off | 0.452 | 2.519 | 100.000% |
| [theme.rb](../samples/theme.rb) | grammar-only | 673 | off | 0.739 | 2.519 | 100.000% |
| [theme.php](../samples/theme.php) | grammar-only | 688 | off | 0.386 | 2.519 | 100.000% |
| [themes.sql](../samples/themes.sql) | grammar-only | 754 | off | 0.604 | 2.519 | 100.000% |
| [index.html](../samples/index.html) | grammar-only | 901 | off | 0.978 | 2.519 | 100.000% |
| [theme.css](../samples/theme.css) | grammar-only | 753 | off | 0.578 | 1.166 | 100.000% |
| [theme.scss](../samples/theme.scss) | grammar-only | 668 | off | 0.509 | 2.397 | 100.000% |
| [theme.json](../samples/theme.json) | grammar-only | 377 | off | 0.547 | 2.519 | 100.000% |
| [theme.jsonc](../samples/theme.jsonc) | grammar-only | 383 | off | 0.310 | 2.519 | 100.000% |
| [theme.yaml](../samples/theme.yaml) | grammar-only | 518 | off | 1.128 | 2.519 | 100.000% |
| [theme.xml](../samples/theme.xml) | grammar-only | 759 | off | 0.981 | 2.519 | 100.000% |
| [guide.md](../samples/guide.md) | grammar-only | 1156 | off | 0.778 | 2.519 | 100.000% |
| [preview.sh](../samples/preview.sh) | grammar-only | 596 | off | 0.461 | 2.519 | 100.000% |
| [preview.ps1](../samples/preview.ps1) | grammar-only | 757 | off | 0.342 | 2.519 | 100.000% |
| [Dockerfile](../samples/Dockerfile) | grammar-only | 377 | off | 0.740 | 1.166 | 100.000% |
| [theme.ts](../samples/theme.ts) | semantic-enabled | 1366 | 79 | 0.482 | 2.519 | 100.000% |
| [card.tsx](../samples/card.tsx) | semantic-enabled | 913 | 41 | 0.432 | 2.519 | 100.000% |
| [palette.js](../samples/palette.js) | semantic-enabled | 774 | 40 | 0.481 | 2.519 | 100.000% |
| [theme.py](../samples/theme.py) | semantic-enabled | 918 | no provider | 0.714 | 2.519 | 100.000% |
| [theme.go](../samples/theme.go) | semantic-enabled | 857 | no provider | 0.562 | 2.519 | 100.000% |
| [theme.rs](../samples/theme.rs) | semantic-enabled | 938 | no provider | 0.571 | 2.519 | 100.000% |
| [Theme.java](../samples/Theme.java) | semantic-enabled | 914 | no provider | 0.906 | 2.519 | 100.000% |
| [Theme.cs](../samples/Theme.cs) | semantic-enabled | 968 | no provider | 0.705 | 2.519 | 100.000% |
| [theme.c](../samples/theme.c) | semantic-enabled | 724 | no provider | 0.506 | 2.519 | 100.000% |
| [theme.cpp](../samples/theme.cpp) | semantic-enabled | 1012 | no provider | 0.452 | 2.519 | 100.000% |
| [theme.rb](../samples/theme.rb) | semantic-enabled | 673 | no provider | 0.739 | 2.519 | 100.000% |
| [theme.php](../samples/theme.php) | semantic-enabled | 688 | no provider | 0.386 | 2.519 | 100.000% |
| [themes.sql](../samples/themes.sql) | semantic-enabled | 754 | no provider | 0.604 | 2.519 | 100.000% |
| [index.html](../samples/index.html) | semantic-enabled | 901 | 13 | 0.968 | 2.519 | 100.000% |
| [theme.css](../samples/theme.css) | semantic-enabled | 753 | no provider | 0.578 | 1.166 | 100.000% |
| [theme.scss](../samples/theme.scss) | semantic-enabled | 668 | no provider | 0.509 | 2.397 | 100.000% |
| [theme.json](../samples/theme.json) | semantic-enabled | 377 | no provider | 0.547 | 2.519 | 100.000% |
| [theme.jsonc](../samples/theme.jsonc) | semantic-enabled | 383 | no provider | 0.310 | 2.519 | 100.000% |
| [theme.yaml](../samples/theme.yaml) | semantic-enabled | 518 | no provider | 1.128 | 2.519 | 100.000% |
| [theme.xml](../samples/theme.xml) | semantic-enabled | 759 | no provider | 0.981 | 2.519 | 100.000% |
| [guide.md](../samples/guide.md) | semantic-enabled | 1156 | no provider | 0.778 | 2.519 | 100.000% |
| [preview.sh](../samples/preview.sh) | semantic-enabled | 596 | no provider | 0.461 | 2.519 | 100.000% |
| [preview.ps1](../samples/preview.ps1) | semantic-enabled | 757 | no provider | 0.342 | 2.519 | 100.000% |
| [Dockerfile](../samples/Dockerfile) | semantic-enabled | 377 | no provider | 0.740 | 1.166 | 100.000% |

## Largest observed errors

| Sample | Mode | Line:column | Native | Generated | Error | Characters with this pair |
| --- | --- | --- | --- | --- | ---: | ---: |
| theme.ts | grammar-only | 3:26 | `#0000ff` | `#2500f8` | 2.519 | 106 |
| card.tsx | grammar-only | 2:1 | `#0000ff` | `#2500f8` | 2.519 | 27 |
| palette.js | grammar-only | 5:3 | `#0000ff` | `#2500f8` | 2.519 | 40 |
| theme.py | grammar-only | 14:19 | `#0000ff` | `#2500f8` | 2.519 | 24 |
| theme.go | grammar-only | 32:36 | `#0000ff` | `#2500f8` | 2.519 | 10 |
| theme.rs | grammar-only | 18:28 | `#0000ff` | `#2500f8` | 2.519 | 3 |
| Theme.java | grammar-only | 6:1 | `#0000ff` | `#2500f8` | 2.519 | 82 |
| Theme.cs | grammar-only | 8:1 | `#0000ff` | `#2500f8` | 2.519 | 80 |
| theme.c | grammar-only | 5:9 | `#0000ff` | `#2500f8` | 2.519 | 55 |
| theme.cpp | grammar-only | 14:5 | `#0000ff` | `#2500f8` | 2.519 | 69 |
| theme.rb | grammar-only | 5:17 | `#0000ff` | `#2500f8` | 2.519 | 69 |
| theme.php | grammar-only | 14:1 | `#0000ff` | `#2500f8` | 2.519 | 64 |

## Rule-level diagnostics, separate from rendered acceptance

All 113 foreground assignments, including inherited or overridden rules: mean 1.194, max 27.654, 98.230% within tolerance.
These figures are not the rendered-code score. Unused and overridden rules cannot be counted as successful sample coverage, and sample success does not prove coverage of every possible token.

Negative control: detected the Color 1 edit; maximum error 86.994.

## Limits and next step

- The generator is wired to three independent Auto toggles, eight conditional seed pickers, two conditional sliders, reversible theme-scoped live preview, and theme export. Reset buttons appear only when their corresponding Auto mode is off and leave it off. The illustration uses generated representative scopes rather than a second tokenizer.
- This is one pinned dark theme and these sample files, not arbitrary themes, all token kinds, all languages, or an accessibility certification.
- Font styles, selector ordering, and semantic style fields are retained; this color test does not measure typography or backgrounds.
- Very dark/bright or low-chroma edits can clip in sRGB. Review changed palettes visually; representative contrast checks do not cover every generated variant.
