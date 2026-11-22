# Publishing Themer Lab

[Issue #11](https://github.com/arniebradfo/vs-code-plugin-themer-lab/issues/11)
coordinates the first Marketplace launch and automatic updates.

**Publishing is disabled.** The package uses publisher `arniebradfo` and version
`0.1.0`. The project's original code is licensed under
[MIT](../../LICENSE). Review packages are not Marketplace releases.

## Release path

```text
Merge feature/fix PRs -> required Windows/Linux CI
    -> request a version/changelog PR from Prepare release
    -> owner approves the eligible bot PR workflow -> required CI
    -> review and merge that PR
    -> Actions checks and retains one exact VSIX
    -> protected Marketplace publication
    -> matching GitHub tag/release with the same VSIX
    -> VS Code updates enabled Marketplace installations
```

Ordinary merges and dependency updates do not publish the extension. The
publishing workflow detects an advance in the extension's own version.
It does not publish merely because a dependency or workflow changed.

The release workflow prepares PRs; it does not publish, tag, approve workflows,
merge PRs, or create GitHub releases. **Preparation success means only that the
PR was created.** Owner workflow approval and actual required checks remain
pending before merging.

`GITHUB_TOKEN` pushes do not normally start another workflow. Bot-triggered PR
workflows can require approval before running. Prepare release explicitly
dispatches **supplemental CI** for review, but dispatch success does not satisfy
the required PR checks. The owner must approve the eligible `pull_request`
workflow and verify its actual results.

## What still needs the owner

### Confirm publication rights

The project's original code uses the [MIT License](../../LICENSE), with matching
manifest and lockfile metadata. Confirm the right to publish the code and assets
under their applicable terms. Retain the third-party notices and packaged
license texts. Default theme data and runtime dependencies use MIT; Codicons
artwork uses CC BY 4.0.

### Configure the Marketplace publisher connection

The owner has selected the existing
[`arniebradfo` publisher](https://marketplace.visualstudio.com/manage/publishers/arniebradfo).
The manifest and native test hosts use extension ID `arniebradfo.themer-lab`.
Creating the publisher does not configure Trusted Publishing; complete the
[secretless publishing setup](#configure-secretless-publishing) below.

This identity has separate extension storage from the old
`themer-local.themer-lab` build. Restore or keep unfinished operations with the
old extension before uninstalling it. Do not install both identities together:
they contribute the same command and theme names. Editable drafts and recovery
journals are not automatically transferred between identities.

### Finish the listing and acceptance

- The approved PNG icon and Dark/Light screenshots are included. The manifest
  uses `assets/icon.png`; editable `assets/icon.svg` is source-only and excluded
  from the VSIX. Verify the final packaged artwork and README image links.
- Review the user guide, versioned changelog, and extension details page.
- Install the exact final-publisher candidate in a clean profile.
- Verify gallery, samples, both modes, Live Preview, both Apply targets, Cancel,
  interrupted recovery, and export.
- Verify the promised minimum editor version and desktop platforms. Unit CI
  does not prove native paint, remote support, or Workspace Trust behavior.
- Complete the applicable [product gates](../../PLAN.md) and
  [native acceptance checklist](acceptance.md).
- Verify a clean full dependency audit as described in the
  [tooling audit notes](#tooling-audit) for
  [#15](https://github.com/arniebradfo/vs-code-plugin-themer-lab/issues/15).

Do not lower the VS Code engine requirement or add `extensionKind`/Workspace
Trust claims without testing the actual behavior.

## Configure secretless publishing

The Marketplace Trusted Publishing policy must match:

| Field | Value |
| --- | --- |
| Repository owner | `arniebradfo` |
| Repository | `vs-code-plugin-themer-lab` |
| Workflow | `publish.yml` |
| Environment | `marketplace` |

The protected publishing job alone has `id-token: write`. VSCE 4.1 exchanges the
GitHub OIDC token for a short-lived credential. No stored `VSCE_PAT` is needed.
Never put publishing credentials in source, settings, issues, or chat.

GitHub's `marketplace` environment remains restricted to `main` with owner
approval. Publication checks that the exact checked-out source belongs to
approved `main` history. The workflow uses full commit SHAs, not a mutable
branch head, to build and verify packages.

Repository variable `MARKETPLACE_PUBLISH_ENABLED` defaults to `false`.
The repository also explicitly sets it to `false`. Keep it disabled until the
owner has completed the launch blockers and accepted a review candidate.
Only then set it to `true` in repository **Settings > Secrets and variables >
Actions > Variables**.

The first launch still requires environment approval. After the first launch
and a follow-up update are accepted, the owner can deliberately remove the
additional required reviewer from this environment, retaining its main-only
policy. That makes merging the release PR the normal release decision.
Do not remove protection as part of an infrastructure update.

Official guidance:
[VS Code publishing and Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[GitHub workflow event behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Prepare a release PR

Run **Prepare release** from the repository's Actions page. Start with its
default dry run. A dry run produces review output without writing branches or
PRs. Then request the real PR when its version and notes are correct.

Use these stable-version rules:

| Change | Bump |
| --- | --- |
| Backward-compatible fix | Patch: `0.1.0` to `0.1.1` |
| Backward-compatible feature | Minor: `0.1.0` to `0.2.0` |
| Breaking user behavior or compatibility | Major: `0.1.0` to `1.0.0` |
| First public release at the current version | Initial: finalize `0.1.0` without incrementing it |

The initial option is only for a version that has not already been released.
Stable releases use `X.Y.Z`, without pre-release suffixes or leading zeroes.
Keep meaningful release notes under `## Unreleased` as changes are merged.
The release PR synchronizes the manifest, both lockfile version fields, and
the matching changelog heading. Review the generated notes, not just the bump.

Actions needs permission to create pull requests in repository **Settings >
Actions > General > Workflow permissions**. The preparation job has narrowly
scoped branch/PR/CI-dispatch permissions. It does not approve or merge its PR.
Keep the two required main checks.

### Required CI on bot release PRs

GitHub [does not evaluate native `workflow_dispatch` job checks for required PR
checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated).
This is separate from its
[approval-required bot PR events](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).
Run success and REST check-run success alone are not merge-readiness evidence.
For example, deployment-free PR #20 had successful native checks at its exact
head, but an empty PR rollup and an approval-required `pull_request` run.

The supported flow with the current `GITHUB_TOKEN` policy is:

1. Prepare release creates the PR and explicitly dispatches supplemental CI
   on its branch. Its PR body contains an unchecked owner-approval checklist.
   CI has no release-specific dispatch inputs or custom check-reporting jobs.
2. The owner opens the bot PR and selects **Approve workflows to run** for
   the eligible bot-triggered `pull_request` workflow. Preparation does not
   perform that approval and never marks it complete.
3. Wait for actual `Check (ubuntu-latest)` and `Check (windows-latest)` success
   from the eligible workflow at the latest head/applicable test-merge commit.
   Preserve the GitHub Actions app binding (`15368`) and verify the source,
   rather than trusting a green supplemental run.
4. Review the version/changelog and merge only when those required checks and
   every other main protection, including the up-to-date requirement, pass.

For read-only verification, use `gh pr checks <number> --required` and
`gh pr view <number> --json headRefOid,statusCheckRollup`. Neither a successful
dispatch nor direct REST/GraphQL check presence alone completes the pending step.

Deployment-free [PR #20](https://github.com/arniebradfo/vs-code-plugin-themer-lab/pull/20)
and [PR #22](https://github.com/arniebradfo/vs-code-plugin-themer-lab/pull/22)
confirmed the dispatch association boundary, including Checks API checks created
by the built-in token. That always-failing attestation experiment, its write role,
and its helper have been removed. No success-shaped check/status fallback,
automatic approval, PAT, App credentials, secrets, or protection change is added.

**The owner-approval gate is verified.** The owner approved only PR #22's original
[`pull_request` run `42428879687`](https://github.com/arniebradfo/vs-code-plugin-themer-lab/actions/runs/42428879687),
after verifying head `122139d0e3b19cbdf9a93a9536e504de82b76852` and the three
version/changelog metadata files. Both eligible `Check (os)` jobs passed.
The PR rollup contained those successful checks and `mergeStateStatus` became
`CLEAN`. No version was merged or deployed. This proves the explicit manual gate,
not dispatch-only readiness; each new bot PR still needs its own approval.

Fully unattended release-PR CI under the current policy needs an
**owner-configured supported GitHub App or automation identity later**, tracked
in [#11](https://github.com/arniebradfo/vs-code-plugin-themer-lab/issues/11).
That identity must generate eligible PR workflows whose real results satisfy the
required name, app, and commit binding. Setup and hosted validation are a separate
owner decision; this infrastructure does not add credentials or relax the current
binding. The immutable publisher pipeline and Marketplace approval policy remain
unchanged.

## Review a package without publishing

Run **Publish to Marketplace** with `mode=review`. Review is the default.
It is safe while publishing is disabled and can run on an implementation branch.

The workflow:

1. Pins the exact source commit and checks source metadata.
2. Runs types, unit tests, and build.
3. Packages one VSIX with README links pinned to that source commit.
4. Reads the actual ZIP and validates identity, contributions, runtime payloads,
   notices, samples, documentation links, and excluded files.
5. Records SHA-256, source commit, file inventory, and changelog notes.
6. Retains these immutable files for 90 days:
   - `themer-lab-<version>.vsix`
   - `release-manifest.json`
   - `release-notes.md`
   - `SHA256SUMS.txt`
7. Downloads that artifact by ID and verifies the retained bytes. Read-only
   retries use the same check without rebuilding or uploading another package.

Review mode does not request a Marketplace credential, upload to Marketplace,
create a tag, or create a GitHub release. Its local-license packaging bypass
does not apply to the public release path.

For an ordinary local review:

```powershell
npm ci --include=optional
npm run check
npm run package
```

The package is written to `artifacts\themer-lab-<version>.vsix`. These commands
do not install the extension or change normal-profile theme settings.

## Publish after acceptance

Once publishing is explicitly enabled, merging a version/changelog PR starts
the release pipeline. For the initial release, manually dispatch
**Publish to Marketplace** on `main` with `mode=publish`, or use the first
version-advancing release PR.

The public path rejects publisher/license placeholders, an empty license,
inconsistent versions/lockfile metadata, missing release notes, and moderate
or higher dependency advisories. It packages without `--skip-license`.

The candidate is retained before publication. The protected publishing job
downloads it by immutable artifact ID, rechecks its contents and SHA-256, and
calls `vsce publish --oidc --packagePath` with that exact file. It does not
rebuild it.

Marketplace version checks reject decreases, ambiguous platform/pre-release
versions, and duplicate versions with different bytes. A retry only skips an
upload after downloading the public package and verifying its exact SHA-256.
Marketplace processing is checked with a bounded wait. An unverified result
fails instead of claiming success.

Only after Marketplace bytes are verified does a separate job create or
complete the matching GitHub release. That job alone has `contents: write`,
and has no OIDC permission. It checks existing tags, notes, and asset digests;
uploads missing assets without overwriting existing ones; and publishes the
draft only after all assets match. A version tag must identify the exact source.

Verify the final Marketplace listing and install from Marketplace in a clean
profile. Update the user guide's experimental status and installation link only
after the release is accepted. Record the evidence in #11.

## Failures, retries, and rollback

GitHub Actions reports failed jobs through its usual workflow notifications.
Each pipeline run also records stage results and recovery links in its summary.
Enable workflow failure notifications in your GitHub preferences if needed.

| Failure | Safe action |
| --- | --- |
| Checks fail before a candidate is retained | Fix the source and request a new reviewed candidate. Nothing was uploaded. |
| Publisher, policy, license, advisory, or approval blocks publication | Fix the specific blocker. Do not add a PAT or bypass the checks. |
| Upload fails or processing is uncertain | Treat acceptance as unknown. Dispatch `mode=publish` with `candidate_run` set to the original main run ID. |
| Marketplace succeeded, GitHub release failed | Use the same `candidate_run`. Matching Marketplace bytes prevent another upload; the GitHub job resumes missing assets. |
| An existing tag, version, note, or asset differs | Investigate. The tools refuse to move tags, overwrite assets, or silently accept different bytes. |
| Candidate expired | Do not rebuild that version for a retry. Retain verified release assets for manual reconciliation, or release a new higher version. |

A full rerun also detects a retained candidate and reuses it. The explicit
`candidate_run` input is preferred for recovery and identifies the exact bytes.
Candidates for publication must come from this repository's publishing workflow
on `main`, not PR runs or arbitrary branches.

Rollback means restoring known-good code in a new PR and publishing it under a
**higher** version. Marketplace versions and Git tags must not be overwritten.
An older release completed during recovery is not marked latest over a newer one.

## Tooling audit

The official [VSCE 4.1.2-0 prerelease](https://github.com/microsoft/vscode-vsce/releases/tag/v4.1.2-0)
includes the upstream fix for minimatch
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The tool is pinned exactly to this release; its supported dependency range is
`^11.0.1`, and the lockfile resolves minimatch `11.0.9`. VSCE retains Node 22
and OIDC support. No transitive major override, downgrade, or audit waiver is
used. Prefer a patched stable VSCE release when available, after validating it.

Run both `npm audit` and `npm audit --omit=dev` before release. Full and runtime
audits on the public-registry hosted validation reported zero vulnerabilities.
CI records the full audit and rejects high advisories; public publication
still rejects moderate advisories too. A failed local audit endpoint is not
clean audit evidence; use a successful hosted audit instead.

Repository configuration and locked package URLs use only public npm. Private
feeds and machine-specific network settings must remain outside the repository.

## Automatic updates for users

Enabled Marketplace installations update on VS Code's schedule when extension
auto-update is enabled. Publication is not an instant push to every editor;
an extension-host restart may be requested.

VSIX installations have auto-update disabled by default. The local-publisher
extension does not turn into the final Marketplace extension. Users must
transition to the final identity once. Never change their global update
preferences to force updates.

Verify one follow-up release and an actual Marketplace-installed update before
closing #11. A green review run is not that end-to-end proof.
