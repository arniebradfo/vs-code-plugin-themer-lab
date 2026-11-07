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

The jobs set `TMPDIR`, `TEMP`, and `TMP` to workspace-local
`.vscode-test\acceptance-scratch`. The existing runners create and remove
dedicated profiles, empty extensions directories, and scratch workspaces there.
They do not read or modify a normal editor profile. Native debugging remains
loopback-only. This workflow does not change trust declarations, extension
placement, remote behavior, publisher, or license.

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
This is focused native UI acceptance, not a new full syntax or bracket capture.
Fixtures, sample bytes, and runtime code stay unchanged.

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

Hosted desktop acceptance has not been established merely by adding this
workflow. The release owner must run it and review every OS/job result. In
particular, hosted macOS GUI/focus behavior and Linux Xvfb paint need real runs.

Implementation validation on Windows used the existing local VS Code
**1.145.2**, with workspace-local isolated profiles. All 28 standard host
groups and all 4 empty-window groups passed with exit code zero. The console
also reported nonfatal “mutex already exists” messages and missing log-file
errors. These messages were not suppressed.

That editor's `2026-dark.json` and `2026-light.json` source hashes differ from
the pinned captures. No local native UI acceptance is claimed, and no editor
was downloaded locally. Helper tests use a fake download API; they are not
evidence that the hosted editor download or GUI matrix works.

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
