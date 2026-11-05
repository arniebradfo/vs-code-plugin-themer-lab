# Publishing Themer Lab

The public source repository is
[arniebradfo/vs-code-plugin-themer-lab](https://github.com/arniebradfo/vs-code-plugin-themer-lab).
The default branch is `main`. Its initial commit is a parentless snapshot;
earlier local development history is not part of this repository.

## What is ready

- User-facing README, searchable metadata, and Dark/Light theme contributions.
- Repository, homepage, and bug-report links.
- Public-registry dependency lockfile and preserved sample line endings.
- Windows/Linux CI for type checking, unit tests, and builds, with a runtime
  dependency advisory check on Linux.
- Installable review VSIX artifacts from successful Windows CI.
- Manual, environment-gated Marketplace publishing with a protected secret.
- A release prerequisite check that rejects local publisher and license placeholders.
- Bug/feature forms, private security reporting, and dependency-update configuration.

The package remains `themer-local.themer-lab` and `UNLICENSED`. The public
snapshot is not a Marketplace release or an open-source license grant.
Do not announce a public release or upload a review artifact to the Marketplace.

## Decisions that need the owner

### 1. Approve a license

Choose the license for the original project code and confirm that you have the
right to publish it. Add the approved text as the root `LICENSE` and update
`license` in the manifest and lockfile. Retain the third-party notices and
packaged license texts. Default theme data and runtime dependencies use MIT;
Codicons artwork uses CC BY 4.0.

### 2. Create the Marketplace publisher

Sign in to [publisher management](https://marketplace.visualstudio.com/manage),
create or select the intended publisher, and confirm its identifier. A GitHub
username does not automatically reserve the same Marketplace publisher ID.

Update `publisher` in the manifest and the expected identity in the branding
test. Keep the extension name `themer-lab` unless deliberately choosing a new
product identity. The public extension ID will be `<publisher>.themer-lab`.

The local review extension uses a different ID. Its extension storage is not
shared with the final publisher's extension, even though saved theme settings
use the same names. Before changing installed identities, restore or keep any
unfinished operation with the local extension, then uninstall it. Do not leave
both installed: both contribute the same commands and theme names.

### 3. Finish the listing and compatibility review

- Add an original PNG icon and representative Dark/Light screenshots. Set
  `icon` in the manifest and use repository-relative image links in the README.
- Review the 0.1.0 changelog and user instructions.
- Verify the minimum VS Code version. The current requirement is 1.143.0;
  lowering it needs API and native-behavior checks, not just a manifest edit.
- Test install, preview, Apply, Cancel, recovery, and export in a clean profile.
- Test macOS and Linux, Restricted Mode, and remote workspaces before claiming
  support. Decide and document the intended Workspace Trust/extension placement.
- Check automatic OS light/dark theme switching and multi-window User settings.
- Complete the applicable [product review gates](../../PLAN.md).

## Configure publishing authentication

The workflow is manual. It does not publish on pushes, tags, or dependency PRs.

The installed stable `@vscode/vsce` 3.9.2 supports `VSCE_PAT`, but does not yet
provide the `--oidc` option described in the newest official guidance. Do not
copy that option into the workflow until a released CLI supports it.

For the current workflow:

1. In Azure DevOps, create a short-lived token with only the required
   **Marketplace: Manage** scope for the chosen publisher. This is not a GitHub
   access token. Follow the
   [official publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
2. Save it as the `VSCE_PAT` secret in the GitHub **marketplace environment**,
   not in source, a local settings file, an issue, or chat.
3. Keep owner approval and the `main` deployment restriction on that environment.
   The workflow exposes the secret only to its final publishing step.
4. Revoke or rotate the token after use and before its expiration.

### Prefer Trusted Publishing when supported

When the stable CLI provides `--oidc`, replace the token-based step with OIDC,
grant `id-token: write` only to the publishing job, and remove `VSCE_PAT`.
In the Marketplace publisher's **Trusted Publishing** page, create a policy:

| Field | Value |
| --- | --- |
| Repository owner | `arniebradfo` |
| Repository | `vs-code-plugin-themer-lab` |
| Workflow | `publish.yml` |
| Environment | `marketplace` |

Use the exact case and names. Verify the upgraded CLI option and policy before
switching. This setup requests a short-lived OIDC credential with
`vsce publish --oidc`, without a stored PAT.

Review the GitHub `marketplace` environment's deployment protection. Require
owner approval and restrict deployments to `main`. Only approve a deployment
after inspecting the commit and completing the release checklist.

Official guidance:
[VS Code publishing and Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).

## Validate and publish

From a clean source checkout:

```powershell
npm ci
npm run check
npm run check:release
npm run package
```

`check:release` checks the publisher and license prerequisites. It does not
verify ownership, authenticate, approve release quality, or replace the manual
review above.

Run the isolated native checks in the [developer guide](README.md#validate-in-isolated-vs-code-instances).
Inspect the VSIX contents, rewritten README links, third-party notices, and
theme contributions. Install the exact candidate package in a clean profile.
Never include personal notes, credentials, settings, test profiles, or source maps.

Then manually dispatch **Publish to Marketplace** on `main` and approve its
`marketplace` deployment. The workflow rechecks prerequisites, tests, builds,
and packages before publishing the exact VSIX. The Marketplace can take time
to scan the extension; verify the final listing and install from the Marketplace.

After acceptance, create the matching GitHub version tag/release with the same
tested source and VSIX, update the changelog, and verify a clean Marketplace
installation. Choose and test the next version before any later publication.

## If publishing fails

Inspect the failed workflow step. Fix the actual publisher, policy, permissions,
version, or packaging problem before retrying. Do not add a PAT to source, skip
the release checks, weaken environment approval, or assume a failed command
means the Marketplace did not accept the upload.
