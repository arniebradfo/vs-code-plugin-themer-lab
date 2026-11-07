# Publishing Themer Lab

[Issue #11](https://github.com/arniebradfo/vs-code-plugin-themer-lab/issues/11)
coordinates the first Marketplace launch and automatic updates.

**Publishing is disabled.** The package still uses `themer-local`, `UNLICENSED`,
and version `0.1.0`. Review packages are not public releases. Creating the public
source repository did not grant a project license.

## Release path

```text
Merge feature/fix PRs -> required Windows/Linux CI
    -> request a version/changelog PR from Prepare release
    -> review and merge that PR
    -> Actions checks and retains one exact VSIX
    -> protected Marketplace publication
    -> matching GitHub tag/release with the same VSIX
    -> VS Code updates enabled Marketplace installations
```

Ordinary merges and dependency updates do not publish the extension. The
publishing workflow detects an advance in the extension's own version.
It does not publish merely because a dependency or workflow changed.

The release workflow prepares PRs; it does not publish, tag, or create GitHub
releases. Required CI is explicitly dispatched for bot-created branches.
`GITHUB_TOKEN` pushes do not normally start another workflow. Bot-created PR
events can also require approval before their workflows run. Explicit dispatch
starts CI without a stored personal token or an extra GitHub App, but its native
job checks **do not satisfy required PR checks**. The CI attachment path below
must verify the actual app-bound checks in the latest PR head's rollup.

## What still needs the owner

### Approve the license and publication rights

Choose the license for the original code and confirm the right to distribute it.
Add the approved, nonempty text as root `LICENSE`. Update the manifest and
lockfile license metadata. Retain the third-party notices and packaged license
texts. Default theme data and runtime dependencies use MIT; Codicons artwork
uses CC BY 4.0.

### Choose and configure the Marketplace publisher

Sign in to [publisher management](https://marketplace.visualstudio.com/manage).
Create or select a publisher and confirm its exact identifier. A GitHub username
does not reserve a matching Marketplace publisher.

Update `publisher` and the identity assertion in
[the branding test](../../test/branding.test.ts). Keep the extension name
`themer-lab` unless deliberately choosing a different extension identity.

The public extension ID will be `<publisher>.themer-lab`. It has separate
extension storage from the local-publisher build. Restore or keep unfinished
operations with the local extension before uninstalling it. Do not install both
identities together: they contribute the same command and theme names.

### Finish the listing and acceptance

- Add an approved original PNG icon and Dark/Light screenshots. Set `icon` in
  the manifest and verify the packaged README image links.
- Review the user guide, versioned changelog, and extension details page.
- Install the exact final-publisher candidate in a clean profile.
- Verify gallery, samples, both modes, Live Preview, both Apply targets, Cancel,
  interrupted recovery, and export.
- Verify the promised minimum editor version and desktop platforms. Unit CI
  does not prove native paint, remote support, or Workspace Trust behavior.
- Complete the applicable [product gates](../../PLAN.md) and
  [native acceptance checklist](acceptance.md).
- Resolve or explicitly review the development advisory tracked in
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

Prepare release now opens the PR before dispatching CI with `release_pr` and
`expected_sha`. Ordinary manual CI runs can omit those two inputs; their native
job results are review evidence, not required-check proof.

For a bot release PR, CI:

1. Uses isolated, trusted `main` check-reporting jobs. Only these jobs receive
   job-scoped `checks: write` plus read access to contents and Actions. They do
   not execute PR code or dependency install scripts. The test jobs stay read-only.
2. Verifies the bot PR, exact source/attempt, same repository, protected-main
   ancestry, and the single preparation commit. The shared release planner must
   reproduce its manifests and changelog; script, dependency, license, publisher,
   and unrelated content changes are rejected.
3. Starts both required Checks API checks **in progress** and verifies their
   opaque IDs in the PR rollup before running the native Windows/Linux jobs.
4. Reads the actual completed native jobs and check runs for this attempt.
   Successful conclusions require the real type/test/build, audit, and Windows
   package-inspection/upload steps to pass. Missing, unfinished, mismatched,
   skipped, or neutral validation cannot produce a successful required check.
5. Updates only this attempt's checks from those verified results, linking the
   real job logs. REST responses must retain the source SHA, context names, and
   GitHub Actions app ID `15368`. The same IDs must appear completed with the
   actual conclusions in the latest-head PR rollup, and GitHub must classify
   each as required for this PR.

The protected contexts remain `Check (ubuntu-latest)` and
`Check (windows-latest)`, bound to GitHub Actions. Native dispatched jobs use
`Native CI (...)` to avoid confusing them with the reported required checks.
No manual success status, workflow approval, PAT, additional App, or protection
change is used. The existing `GITHUB_TOKEN` is an
[installation token](https://docs.github.com/en/actions/concepts/security/github_token)
for the built-in App; reporting uses the
[Checks API](https://docs.github.com/en/rest/checks/runs).

**Verify hosted attachment before treating this path as unattended.** If GitHub
rejects reporting or does not expose the exact checks in the rollup within the
bounded wait, CI fails and does not claim required checks passed. Do not weaken
the app binding or replace missing checks with ad-hoc successes. Owner-approved
PR workflows remain a separate recovery option if the platform blocks attachment.
Do not infer readiness from the green native jobs or a dispatched-run URL.

For read-only verification, check `gh pr checks <number> --required` and
`gh pr view <number> --json headRefOid,statusCheckRollup`. Both required contexts
must have actual successful results at that latest head. Other main protections,
including the up-to-date requirement, still apply. A retry must rerun **all** CI
jobs or dispatch a fresh CI run with the same PR number and exact head; old
attempts or a failed reporter-only rerun cannot supply a new success.

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

## Known tooling blocker

The remaining advisory is minimatch
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The locked build dependency is `10.2.6`; the first reported patch is `11.0.1`.
VSCE 4.1 declares `^10.2.6`, so forcing the patched major is not a supported
resolution.

This code only uses minimatch during packaging, not in the extension bundle.
The advisory concerns attacker-controlled glob-pattern preprocessing.
That does not authorize a waiver. CI records the full tooling audit and rejects
high advisories; the public release path rejects moderate advisories too.
Keep #15 open for a supported upstream update or an explicit owner-reviewed
release policy change. TLS failure of a local audit endpoint is not clean
audit evidence; use the hosted audit output.

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
