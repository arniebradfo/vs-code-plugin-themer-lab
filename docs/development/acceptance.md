# Desktop release acceptance

This manual gate supports deployment issue #11 and blocker #6. It does not
publish, tag, or install a Marketplace extension. Normal contributor CI is
unchanged. A successful unit check is not desktop acceptance.

The [acceptance workflow](../../.github/workflows/acceptance.yml) has only
`workflow_dispatch`. The release owner must choose the reviewed branch through
the workflow UI and confirm its commit. Do not treat an earlier run as evidence
for a different commit. Record the run URL, commit, editor version, operating system,
and each job result in the deployment issue.

## Editor versions and isolation

The `vscode_version` input selects the **host smoke** editor. It defaults to
the manifest minimum, `1.143.0`. Choose an exact later stable version in the
same major when checking another supported editor. Aliases such as `stable`,
Insiders, commits, prereleases, ranges, and versions below the minimum fail.

The separate native UI jobs always download stable **1.143.1**. Their source
checks preserve the existing captures:

| Mode | Pinned fixture | Native acceptance runtime |
| --- | --- | --- |
| Dark | 1.143.0 / Dark 2026 | 1.143.1, with the identical source chain required |
| Light | 1.143.1 / Light 2026 | 1.143.1, with the identical source chain required |

The helper checks the actual downloaded version and stable quality. It compares
theme metadata, all source paths, their order, and SHA-256 hashes against
**both** fixtures before exporting the editor path. The logs record the actual runtime version
and commit separately from each fixture version. A mismatch fails preparation;
it is not accepted, recaptured, or given a wider tolerance. Choosing a later
host editor does not claim native appearance support on that version.

`tools\prepare-test-editor.ts` uses the declared
`@vscode/test-electron` `downloadAndUnzipVSCode` API. Downloads require the
explicit `--download` flag, `GITHUB_ACTIONS=true`, and `GITHUB_ENV`. It stores
the editor under `.vscode-test\acceptance-editors` and appends the verified
`VSCODE_EXECUTABLE_PATH` to `GITHUB_ENV`. It cannot reuse a normal installation.
The existing developer runners still require an executable and never download
one by default.

Windows archives can store resources under a ten-character commit directory,
not beside `Code.exe`. Preparation finds one resources directory inside the
archive, then applies the same exact version, stable quality, and source checks.
Missing, ambiguous, or external resources fail; the exported executable remains
the archive's `Code.exe` launcher. macOS resources stay inside their app bundle.

The jobs set `TMPDIR`, `TEMP`, and `TMP` to `GITHUB_WORKSPACE` itself.
The runners create and remove private `th-<random>` or `ts-<random>` directories
with a short `p` profile directory. Empty extensions directories and scratch
workspaces remain separate from the checkout's settings.
They do not read or modify a normal editor profile. Native debugging remains
loopback-only. This workflow does not change trust declarations, extension
placement, remote behavior, publisher, or license.

Do not add a nested scratch directory without checking Unix socket path lengths.
macOS main-process sockets include the profile path. The JavaScript debugger's
`node-cdp` sockets include `TMPDIR` directly. macOS allows 103 path bytes; Linux
allows 107. Regression tests check both layouts against the hosted checkout paths.
Only console logs are uploaded, never workspace-root caches or private profiles.

## Commands and checks

Run from the repository root with Node.js 22. PowerShell `Join-Path` keeps the
helper and test paths valid on each operating system.

All jobs run `npm ci` and `npm run build`. Host jobs also run:

```powershell
npm run typecheck
npx --no-install tsx --test (Join-Path 'test' 'prepare-test-editor.test.ts')
npx --no-install tsx (Join-Path 'tools' 'prepare-test-editor.ts') --download --version $env:VSCODE_VERSION
npm run test:extension
npm run test:extension -- --empty-window
```

Standard host acceptance requires exit code zero and exactly **28 PASS groups**.
Empty-window acceptance requires exit code zero and exactly **4 PASS groups**.
Both runners exercise Dark and Light. The empty-window test still runs after a
standard host failure when preparation succeeded. The failed step remains failed.

Native jobs run:

```powershell
# VSCODE_VERSION is fixed to 1.143.1 for these jobs.
npx --no-install tsx (Join-Path 'tools' 'prepare-test-editor.ts') --download --version $env:VSCODE_VERSION --verify-native-sources
npm run test:syntax -- --ui-colors-only --mode=dark
# A separate matrix job starts in Light.
npm run test:syntax -- --ui-colors-only --mode=light
```

`--mode` selects the starting theme. The existing focused UI host then checks
**both** modes, including classic/modern workbench paint, controls, and Apply
targets. Each job requires exit code zero and PASS evidence for both modes.
Setup explicitly selects the requested native theme in the private profile,
waits for its theme kind, and checks the pinned foreground/background colors
before taking the Cancel baseline. The exact restoration assertion is unchanged.
This is focused native UI acceptance, not a new full syntax or bracket capture.
Fixtures, sample bytes, and extension/webview runtime code stay unchanged.

The matrix uses `ubuntu-24.04`, `windows-2022`, and `macos-15`. Linux wraps each
desktop test command with:

```powershell
xvfb-run --auto-servernum '--server-args=-screen 0 1920x1080x24 -nolisten tcp' npm run test:extension
```

The same wrapper applies to the empty-window and native UI commands. Windows
and macOS use the desktop runner directly. Missing display tools, an unavailable
editor download, source mismatches, focus failures, and failed assertions remain
job failures. There is no fallback to unit-only evidence or a skipped native test.

## Evidence and remaining owner checks

Every job uploads its dedicated `artifacts\acceptance-logs` directory, even on
failure. Logs are retained for 14 days. Only install, build, preparation, and
test console logs are included. Profiles, settings, workspaces, screenshots,
environment files, credentials, and crash dumps are not uploaded. Download
and review the failed job's logs before deciding whether to retry.

## First hosted run and CI diagnosis

Manual [run 42423623820](https://github.com/arniebradfo/vs-code-plugin-themer-lab/actions/runs/42423623820)
tested main commit `2e048c2a08ab510e20d6ecc412e85a2a103a7edb`.
Only the Linux minimum-editor host job passed. The other eight jobs failed:

| Failed jobs | Cause | Automation fix |
| --- | --- | --- |
| Windows host `128557121805`; native Light `128557121862`, Dark `128557122458` | Preparation assumed `resources\app` beside `Code.exe`. The official archives instead use `2d0b7506a3` for 1.143.0 and `e646868227` for 1.143.1. No host/UI test ran. | Resolve the unique versioned resources directory without changing the launcher or version/source guards. |
| macOS host `128557121782`; native Light `128557121714`, Dark `128557121799` | Main IPC socket paths were 144/146 bytes. `listen EINVAL` stopped startup before acceptance assertions. | Use the checkout root for scratch and short private profile paths. |
| Linux native Light `128557121773`, Dark `128557121832` | A 131-byte `node-cdp` socket failed when the native test started its JavaScript debug session. The refused test dialog was a consequence of that failure. | Shorten `TMPDIR` itself; retain the debug-state test. Xvfb and the earlier Dark UI checks already ran. |

These are automation failures, not evidence of unavailable or changed pinned
themes. All four Linux/macOS native preparation steps verified both source
chains. Local inspection of the exact official Windows archives also confirmed
their versions and stable quality; repaired preparation verified both native
source chains on 1.143.1. No fixture or tolerance was changed.

The first implementation check on Windows used the existing local VS Code
**1.145.2**, with workspace-local isolated profiles. All 28 standard host
groups and all 4 empty-window groups passed with exit code zero. The console
also reported nonfatal “mutex already exists” messages and missing log-file
errors. These messages were not suppressed.

That editor's `2026-dark.json` and `2026-light.json` source hashes differ from
the pinned captures. That initial check did not establish native UI acceptance.
The CI diagnosis downloaded only the exact official 1.143.0 and 1.143.1 archives
into the isolated worktree cache after checking official version metadata.

The local Light-startup check exposed a separate setup issue: its original
snapshot contained Dark paint, while Cancel restored the configured Light theme.
Explicit native-theme selection and baseline color checks fixed that mismatch
without changing the restoration assertion, application code, or fixture data.

Follow-up validation passed strict type checking, all 20 related unit tests,
the build, actionlint, and parsing of all 11 workflow PowerShell steps.
The official Windows 1.143.0 editor passed all 28 standard host groups and
all 4 empty-window groups. On official 1.143.1, both Dark-startup and
Light-startup focused UI runs passed all 56 groups and covered both modes.

Local native logs also reported Markdown preview SVG load warnings. The files
exist, but their paths in this deeply nested Windows worktree are 266/267
characters. These warnings were nonfatal and were not suppressed. The owner
must review hosted logs rather than treating local warnings as missing pinned
theme-source evidence.

The release owner must rerun the repaired workflow and review every OS/job
result. Local Windows checks and unit tests do not establish hosted macOS
GUI/focus behavior or Linux native acceptance. Blocker #6 remains open until
the required real desktop jobs pass on the reviewed commit.

## Rerun 42427670200

[Rerun 42427670200](https://github.com/arniebradfo/vs-code-plugin-themer-lab/actions/runs/42427670200)
tested `994d487f2c9840fbbb0cf774ea976b9204cffc36` on
`fix/deployment-verification`. All three minimum-editor host jobs and both
Windows native startup jobs passed. Four native jobs still failed:

| Failed jobs | New evidence | Disposition |
| --- | --- | --- |
| Linux Dark `128569358242`, Light `128569358367` | Both reached 42 native PASS groups, including both modes' debugger and exact Cancel checks. The first Dark webview at 320px then failed: `autoLightness must place label, modes, help and value on one line.` | This is a real control-row geometry failure on pinned VS Code 1.143.1 / Ubuntu 24.04. It remains a #6 layout blocker. Do not change fonts, widths, CSS, or assertions to hide it in automation. |
| macOS Dark `128569358267`, Light `128569358322` | At the initial selection capture, Quick Input was visible and the active element was its input, but `documentFocused=false` and the editor still had its `focused` class. Selection paint remained active: Dark alpha 0.87; Light alpha 0.25. The existing 15-second capture timed out. | `Page.bringToFront` did not activate the native application. The runner now discovers the isolated browser PID through its loopback browser CDP endpoint and activates that PID with AppKit before capture. |

The macOS fix targets a process, not an application name, so it cannot select
another installed Code instance by name. It requires real `document.hasFocus()`
after native activation. Activation denial or absent focus still fails; there
is no focus emulation, edited DOM class, or changed selection-paint assertion.
Windows and Linux keep their existing focus path.

The focus helper has five targeted unit tests. Strict type checking and the
build passed. These tests validate PID selection, bounded native activation,
real-focus polling, failure propagation, and unchanged non-macOS behavior.
Actual AppKit activation cannot be verified from the Windows development
machine. The owner must rerun the two macOS native jobs before treating that
part of #6 as resolved. That focus-only patch did not change the Linux layout
failure; the next section records its permitted CSS correction.

## Linux 320px compact-row correction

The permitted CSS correction was measured in real, isolated Linux VS Code
1.143.1 under Ubuntu 24.04 / WSLg. It used the existing native capture and
viewport code, not a browser mock or emulated focus. The unmodified native
font lists were `system-ui, Ubuntu, "Droid Sans", sans-serif` and
`"Droid Sans Mono", monospace`; the stock system resolved these to DejaVu Sans
and DejaVu Sans Mono.

The original native run reproduced the exact CI `autoLightness` error.
Its 320px viewport had a 305px client width because of the real 15px scrollbar.
Existing panel padding and borders left a 251px heading. This was horizontal
overlap, not a wrapped label: all four controls had the same vertical center.
The 59.609px `UI linked` value remained right-aligned.

| Dark Auto geometry at 320px | Original | Fixed |
| --- | ---: | ---: |
| Heading width | 251px | 251px |
| Options box width | 183.391px | 189.234px |
| Segmented-control width | 121.781px | 107.781px |
| Help right edge | 234.234px | 216.234px |
| Value left edge | 218.391px | 218.391px |
| Help/value gap | -15.843px | 2.157px |
| Required row budget | 274.843px | 250.843px |

Only syntax-adjustment rows in panels up to 279px use tighter decorative
spacing. Button height, font sizes, values, radio behavior, and slider behavior
stay unchanged. The minimum radio width remains 24px; the measured smallest
Linux button is 24.25px by 24px.

The new regression checks the measured row budget, usable target sizes, and
unchanged wide spacing/fonts. Both targeted tests, strict type checking, and
the build passed. Thirty native measurements covered Dark/Light and
Auto/Manual/Off at the unchanged 320, 400, 540, 800, and 1200px widths.
Every layout error list was empty; all controls remained enabled and Manual
sliders appeared only in Manual mode. All 24 records above 320px had exactly
the original control geometry.
Both pinned Windows 1.143.1 native startup runs also passed all 56 groups after
the CSS correction, with the existing acceptance assertions unchanged.

This resolves the reproduced compact-row defect, not every hosted Linux
acceptance requirement. The release owner must still run the full Linux
acceptance jobs. Other font installations/locales were not tested. The
PID-targeted macOS activation patch remains unchanged and still needs its
hosted native rerun.

These owner acceptance gaps remain unverified:

- Restricted Mode and workspace trust prompts. Existing isolated tests disable
  trust; this is not evidence for untrusted workspaces.
- Remote SSH, WSL, and development containers; remote extension placement and
  recovery are not tested.
- OS-theme switching and interaction between multiple editor windows/profiles.
- Full native syntax/bracket recapture on each target OS and any later editor.
- Marketplace installation and an owner-approved publisher/license.

Do not broaden support claims or remove a release blocker based only on this
workflow, unit CI, or a browser preview.
