# Themer Lab: Live Theme Builder

**A complete theme from a few colors.**

Create your own VS Code color theme without editing hundreds of color settings.
Choose a background, text color, and accent. Themer Lab builds coordinated UI
and syntax colors, with previews that update as you work.

**Status:** experimental source preview. The extension is not yet published on
the Marketplace. Review builds are available as VSIX artifacts from successful
[CI runs](https://github.com/arniebradfo/vs-code-plugin-themer-lab/actions/workflows/ci.yml)
(a GitHub sign-in is required to download them). The local publisher is still a
placeholder; the [release checklist](docs/development/publishing.md) tracks the
remaining publication setup.

## Features

- **A few colors, a complete look.** Generate matching surfaces, buttons,
  borders, selections, and hover states from a small set of inputs.
- **Dark and Light starting points.** Build either style and keep separate
  drafts while you switch between them.
- **Immediate component previews.** See buttons, inputs, navigation, code,
  notifications, and diffs together in the panel.
- **Optional live preview.** Try your changes across the real workbench and
  editor, then keep them or restore your previous settings.
- **Flexible syntax colors.** Follow your UI accent, build a palette from one
  anchor, or edit the syntax seeds yourself.
- **Extra control when you need it.** Adjust severity and file-change colors,
  tinted overlays, active-item accents, bracket colors, and status-bar styling.
- **Save or export.** Apply to User or Workspace settings, or export a
  standalone VS Code color-theme JSON file.

## Get started

Requires **VS Code 1.143.0 or later**.

1. Install the extension. For a downloaded `.vsix`, run
   **Extensions: Install from VSIX...** from the Command Palette.
2. Open the Command Palette and run **Themer Lab: Open Theme Builder**.
3. Choose **Dark** or **Light**.
4. Pick your background, Primary foreground, and Interaction accent colors.
   The component preview updates immediately.
5. Adjust the UI and syntax controls until you like the result.
6. To try the whole editor, turn on **Live Preview** and accept the confirmation.
7. Choose **Apply** to save to User settings, or use **Apply workspace** in the
   three-dot menu to save only in the current workspace.

The installed themes are **Themer Lab Dark** and **Themer Lab Light**. These are
the same themes used by Apply and Live Preview, not extra preview-only themes.

## Shape the UI

Start with the three main colors, then use these controls to refine the result:

| Control | What it changes |
| --- | --- |
| Background | The editor canvas and related surfaces. |
| Primary foreground | Main UI text and the starting point for automatic syntax brightness. |
| Interaction accent | Buttons, links, focus colors, and the automatic syntax palette. |
| Surface separation | How strongly background layers stand apart. |
| Muted text contrast | The strength of secondary text. |
| Border definition | How visible neutral borders are. |
| Overlay opacity | The strength of selections and other translucent colors. |

Under **Advanced**, choose independent **Info**, **Warning**, **Error**,
**Added**, **Deleted**, and **Modified** colors. Info can follow the accent or
foreground, or use a custom color. Editing its color automatically selects
Custom.

Under **Personality**, four optional switches add finishing touches:

- **Accent active items:** color active tabs, activity icons, panel titles, and
  selected items with your accent.
- **Tint overlays:** add a coordinated accent tint to selections and hover
  fills, with a quieter tint on scrollbars.
- **Monochrome brackets:** use the Neutral syntax color for all bracket levels.
- **Stateful status bar:** use coordinated colors for normal, debugging, and
  no-folder states.

Hover, focus, or click an info icon for help with a control.

## Choose your syntax colors

The **Syntax** selector gives you three ways to build a palette:

| Mode | How it works |
| --- | --- |
| **Auto** | Coordinates the palette with your UI accent and text colors. |
| **Anchored** | Uses one chosen Anchor color to generate the six-color wheel. Neutral and Comments still follow UI text. |
| **Manual** | Exposes six color seeds, plus separate Neutral and Comments inputs. |

**Chroma** controls color intensity. **Lightness** controls brightness. Each
offers **Auto**, **Manual**, and **Off**. Manual reveals a slider; Off removes
that adjustment, not the colors themselves. These controls also apply when you
edit Manual syntax seeds.

Use the compact **Try the real editor** row to open TypeScript, JSON, or Python.
**All languages...** offers 24 sample types. Samples are opened, never executed.
Opening one does not turn on Live Preview.

To see changes in a real sample, enable **Live Preview**. Use **Reset syntax**
to restore syntax defaults without changing your UI controls. In Manual mode,
**Reset palette** restores the original seeds without resetting the separate
Chroma and Lightness controls.

## Preview, apply, or cancel

| Action | Where changes go |
| --- | --- |
| Edit controls with Live Preview off | The panel only. Your active theme stays unchanged. |
| **Live Preview** | Temporary Workspace settings, after confirmation. |
| **Apply** | User settings for the current VS Code profile. |
| **Apply workspace** in the three-dot menu | Workspace settings only. |
| **Cancel**, or close the panel during preview | Restores settings owned by the preview while preserving external edits. |

Live Preview and Apply workspace require an open folder or workspace. User
Apply, the component gallery, and Export also work in an empty window.

Applying ends Live Preview. Later edits stay in the panel until you preview or
apply again. When you apply to User settings during a preview, the temporary
Workspace changes are restored first.

**Workspace settings take precedence over User settings.** If the workspace
already sets its own theme or colors, it can override a User save. Themer Lab
preserves those settings and warns you. Choose Apply workspace if you want to
save the new look there.

### What is saved?

Apply saves the generated appearance, including UI and syntax colors. It does
**not** save a reloadable recipe of the inputs.

Dark and Light drafts remain available while the extension session is running,
even if you close and reopen the panel. **Reloading the window clears those
editable drafts.** Apply or export before reloading if you want to keep the
generated appearance. Saved appearance is not loaded back into the controls.

### Recover an interrupted preview

If a preview or save was interrupted, use **Themer Lab: Restore Unfinished
Preview**. To reopen the available recovery choices, run **Themer Lab: Review
Unfinished Theme Settings**.

Themer Lab reports conflicting external edits instead of silently overwriting
them. Avoid editing the same theme settings from another window during preview.

## Export your theme

Open the three-dot menu and choose **Export theme**. The JSON file includes UI,
syntax, and bracket colors for the selected Dark or Light mode.

Export does not install or publish a theme. To distribute it as an extension,
register the JSON in a theme extension's
[`contributes.themes`](https://code.visualstudio.com/api/references/contribution-points#contributes.themes).
Editor behavior settings, such as enabling bracket colorization, are not part
of a theme file.

## Good to know

- Themer Lab is experimental. It currently provides two themes, not a named
  theme library, preset collection, or arbitrary-theme importer.
- Contrast advisories help identify difficult color combinations. They do not
  guarantee that every UI state or syntax token meets accessibility targets.
- Native Git and problem decorations can take priority over active-item colors.
  Some languages need their normal language extension for semantic highlighting.
- High-contrast theme generation is not included.
- Older **Themer Lab Preview** and **Themer Lab Light Preview** selections are
  renamed automatically. Existing colors are copied to the new names, with the
  original scopes retained as backups. Pending recovery is handled first.

## For contributors

Building or changing the extension? Start with the
[developer guide](docs/development/README.md) for setup, isolated testing,
reference capture, packaging, and publishing prerequisites. The
[technical reference](docs/development/reference.md) retains the detailed color
model, syntax behavior, and recovery contracts.

See [third-party notices](THIRD_PARTY_NOTICES.md) for theme-data and dependency
attributions.
