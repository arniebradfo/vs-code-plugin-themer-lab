# Themer Lab: developer guide

This folder is for contributors. For features and everyday use, see the
[user guide](../../README.md).

Run all commands below from the repository root, not from this folder.
Examples use PowerShell and Windows paths.

## Start here

Use **Node.js 22** and an installed **VS Code 1.143.0 or later**.
Native fidelity tests also require matching pinned theme-source hashes; see
the [technical reference](reference.md#syntax-generation-and-the-native-fidelity-test).

```powershell
npm ci
npm run check
```

`check` runs strict type checking, the unit tests, and the build. No extension
is installed and no real editor settings are changed by that command.

CI runs the same check on Windows and Linux, then packages a Windows review
VSIX. Download it from a successful
[CI run](https://github.com/arniebradfo/vs-code-plugin-themer-lab/actions/workflows/ci.yml).
These artifacts are experimental builds, not Marketplace releases.

The project npm configuration uses the public npm registry. Git attributes
preserve CRLF in the sample corpus on every platform because the stored native
evidence hashes those exact bytes. Keep that setting when recapturing evidence.
Personal `USER-NOTES.md` files, local settings, credentials, and build outputs
are ignored and must not be added to public commits.

Press **F5** using the **Run Themer Lab** launch configuration. In the separate
Extension Development Host, run **Themer Lab: Open Theme Builder**.
The launch configuration uses a dedicated development profile, empty extensions
directory, and scratch workspace under `.vscode-test`. It does not use your
normal user settings or this repository as the preview workspace.

## Documentation map

- [Model scope and UI controls](reference.md#scope)
- [Personality and color policies](reference.md#personality)
- [Syntax seeds, brackets, and automatic handoffs](reference.md#real-syntax-samples)
- [Syntax fitting and native evidence](reference.md#syntax-generation-and-the-native-fidelity-test)
- [Workbench and webview CSS inspection](reference.md#inspecting-workbench-and-webview-css)
- [Preview ownership, Apply, and recovery](reference.md#live-preview-and-safety)
- [Legacy theme-name migration](reference.md#upgrading-older-theme-names)
- [Scope, milestones, and review gates](../../PLAN.md)
- [Implementation checkpoints](../../reports/implementation-status.md)

The technical reference preserves the detailed material that previously lived
in the root README. Source, fixtures, and reports are repository resources and
are not included in the installed extension; use a source checkout for links
to those resources.

## Build and browser layout checks

```powershell
npm run build
npm run preview:browser
```

Open the local URL printed by `preview:browser`. It uses a clearly labeled mock
host for layout and interaction checks. It does not validate native workbench
behavior or write VS Code settings.

The component illustration is not a second tokenizer. Use real samples and
the native renderer tests to validate actual editor colors.

## Validate in isolated VS Code instances

Build first, then specify an existing VS Code executable:

```powershell
npm run build
$env:VSCODE_EXECUTABLE_PATH = 'C:\Program Files\Microsoft VS Code\Code.exe'
npm run test:extension
npm run test:extension -- --empty-window
npm run test:syntax -- --ui-colors-only
```

The runners do not download VS Code or install the extension into your normal
profile. They create temporary profiles, empty extensions directories, and
temporary workspaces, then remove them after the test processes exit.

- Standard extension-host checks cover activation, the actual webview handshake,
  export shape, live updates, cancellation, both Apply targets, workspace
  precedence, unrelated settings, and explicit persistence.
- Empty-window checks cover User Apply without a workspace and reject
  workspace-only actions.
- Focused UI checks cover native workbench paint and webview controls without
  recapturing the full syntax corpus.

For full syntax evidence:

```powershell
npm run test:syntax
npm run test:syntax -- --mode=light
# Optional: choose another strict maximum error.
npm run test:syntax -- --tolerance=3
```

These compare the untouched native theme with generated output in grammar-only
and semantic-enabled modes. Samples are never executed. The runner also opens a
real diff editor, changes Added/Deleted colors, checks rendered line/word
backgrounds, and verifies exact Cancel restoration.

Run only bracket integration checks with `npm run test:brackets`; add
`-- --mode=light` for Light. `npm run capture:syntax` captures only the native
baseline and accepts the same mode option.

Unit tests check stored native evidence against generator output and sample
hashes. Changes to either require a new native capture. The
[technical reference](reference.md#syntax-generation-and-the-native-fidelity-test)
explains provenance, coverage, negative controls, and limitations.

## Evaluate the UI color model

```powershell
npm run evaluate
npm run evaluate -- --mode=light
```

Dark results are written to [the readable report](../../reports/model-evaluation.md)
and [full JSON](../../reports/model-evaluation.json). Light has separate
[readable](../../reports/model-evaluation-light.md) and
[full](../../reports/model-evaluation-light.json) reports.

Preserved and unscored colors do not inflate fidelity statistics. Contrast
warnings are separate from reconstruction error; reproducing a native color
does not guarantee accessibility.

## Reproduce reference capture

Point the capture tool at the installed application's `resources\app` directory.
An environment variable avoids Windows package-manager argument quoting issues.

```powershell
$env:VSCODE_APP_PATH = 'C:\path\to\Microsoft VS Code\resources\app'
npm run capture
```

To also regenerate the bundled baseline theme:

```powershell
npm run capture -- --write-theme themes\themer-base-color-theme.json
# Capture Light without overwriting Dark.
npm run capture -- --theme "Light 2026" --write-theme themes\themer-light-color-theme.json
```

The fixture records version, commit, SHA-256 source hashes, include order, and
per-color provenance. Capturing the same installation is deterministic.
Do not overwrite a pinned fixture from another VS Code version without
reviewing the diff and updating imports, tests, and notices.

## Package and review locally

```powershell
npm run package
```

The local VSIX is written to `artifacts\themer-lab-<version>.vsix`, using the
current manifest version.
Install it with **Extensions: Install from VSIX...**, or replace the local
development build from a terminal:

```powershell
code --install-extension ".\artifacts\themer-lab-0.1.0.vsix" --force
```

Then run **Developer: Reload Window** and **Themer Lab: Open Theme Builder**.
Save work and restore or keep any active preview before reloading. Editable
drafts remain in memory only. Use Install from VSIX if the CLI targets a
different profile. F5 remains the isolated alternative.

The root [README](../../README.md) supplies the extension's detail-page content.
Keep it focused on user features and instructions. README links are rewritten
to the public repository's `main` branch during packaging. Developer documentation is
packaged so its links from the installed README remain available. Source,
tests, fixtures, and reports remain excluded from the runtime package.

## Before Marketplace publication

Follow the [publishing checklist](publishing.md). CI does not publish.
The separate Marketplace workflow runs only on manual dispatch, uses the
`marketplace` environment, and rejects the placeholder publisher or missing
license. It needs a publisher-side Trusted Publishing policy before it can
authenticate with OIDC in a future tooling update. The current stable CLI uses
an environment-scoped publishing secret instead; see the checklist. No
publishing token is stored in source.

`npm run package` still permits an unlicensed local review build. That is not
release approval or a license grant. `npm run check:release` intentionally
fails until the publisher and project license are configured.

## Official references

- [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Color theme guide](https://code.visualstudio.com/api/extension-guides/color-theme)
- [Theme color catalog](https://code.visualstudio.com/api/references/theme-color)
- [Syntax highlighting](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
- [Semantic highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
- [Webviews and theme variables](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content)
- [Native extension UI and restrictions](https://code.visualstudio.com/api/extension-capabilities/overview)

Default theme data and dependency licenses are documented in
[third-party notices](../../THIRD_PARTY_NOTICES.md).
