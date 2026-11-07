import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { requireRecord } from "../src/shared/validation";
import { createReleasePlan } from "../tools/prepare-release";
import {
  actionsAppId, attachReleasePrChecks, checkRollupMatches, parseCheckContext, requiredCiChecks,
  validateNativeCiResults, validateReleasePrSource,
  type AttachedCheck, type GithubRequest, type ReleasePrCheckContext
} from "../tools/release-pr-checks";
import { releaseRepository } from "../tools/release-workflow";

const sha = "a".repeat(40);
const parent = "b".repeat(40);
const route = `/repos/${releaseRepository}`;
const context: ReleasePrCheckContext = { phase: "start", pr: "20", sha, runId: "100", attempt: "1", ref: "refs/heads/release/v0.1.1" };

function fixture() {
  const manifest = {
    name: "themer-lab", publisher: "themer-local", version: "0.1.0", license: "UNLICENSED",
    scripts: { check: "npm run typecheck && npm test && npm run build" }, dependencies: { "jsonc-parser": "^3.3.1" }
  };
  const lock = {
    name: manifest.name, version: manifest.version, lockfileVersion: 3,
    packages: { "": { name: manifest.name, version: manifest.version, license: manifest.license, dependencies: manifest.dependencies } }
  };
  const changelog = "# Changelog\n\n## Unreleased\n\n- Improved themes.\n";
  const plan = createReleasePlan(manifest, lock, changelog, { bump: "patch", date: "2026-11-07" });
  const repo = { full_name: releaseRepository };
  const jobs = requiredCiChecks.map((check, index) => ({
    id: 11 + index, run_id: 100, run_attempt: 1, name: check.job, status: "completed", conclusion: "success",
    labels: [check.runner], started_at: "2026-11-07T23:09:17Z", completed_at: "2026-11-07T23:10:19Z",
    check_run_url: `https://api.github.com${route}/check-runs/${211 + index}`,
    html_url: `https://github.com/${releaseRepository}/actions/runs/100/job/${11 + index}`,
    steps: check.steps.map((name) => ({ name, status: "completed", conclusion: "success" }))
  }));
  const native = jobs.map((job, index) => ({
    id: 211 + index, name: job.name, status: job.status, conclusion: job.conclusion, head_sha: sha,
    app: { id: actionsAppId }, check_suite: { id: 700 }, details_url: job.html_url
  }));
  return {
    pr: {
      number: 20, state: "open", changed_files: 3, user: { login: "github-actions[bot]" },
      head: { ref: "release/v0.1.1", sha, repo }, base: { ref: "main", repo }
    },
    run: {
      id: 100, run_attempt: 1, workflow_id: 10, event: "workflow_dispatch", head_sha: sha,
      head_branch: "release/v0.1.1", repository: repo, head_repository: repo, path: ".github/workflows/ci.yml", check_suite_id: 700
    },
    workflow: { id: 10, path: ".github/workflows/ci.yml" },
    commit: { sha, parents: [{ sha: parent }], author: { login: "github-actions[bot]" }, committer: { login: "github-actions[bot]" } },
    history: { status: "ahead", merge_base_commit: { sha: parent } },
    files: ["package.json", "package-lock.json", "CHANGELOG.md"].map((filename) => ({ filename, status: "modified" })),
    base: { manifest, lock, changelog },
    head: { manifest: plan.manifest, lock: plan.lock, changelog: plan.changelog },
    jobs: { jobs }, native
  };
}

function rollup(checks: Record<string, unknown>[], currentSha = sha) {
  return { data: { repository: { pullRequest: {
    headRefOid: currentSha,
    commits: { nodes: [{ commit: { oid: currentSha, statusCheckRollup: {
      contexts: { pageInfo: { hasNextPage: false }, nodes: checks.map((check) => ({
        __typename: "CheckRun", id: check.node_id, name: check.name, isRequired: true,
        status: String(check.status).toUpperCase(), conclusion: check.conclusion ? String(check.conclusion).toUpperCase() : null,
        checkSuite: { commit: { oid: check.head_sha } }
      })) }
    } } }] }
  } } } };
}

function fakeApi(source = fixture()) {
  const calls: { method: string; route: string; body?: unknown }[] = [];
  const checks = new Map<number, Record<string, unknown>>();
  let visible = true;
  let waits = 0;
  const request: GithubRequest = async (method, requested, body) => {
    calls.push({ method, route: requested, body });
    if (requested === "/graphql") {
      assert.doesNotMatch(String(requireRecord(body, "Query").query), /\bapp\b/);
      if (!visible) return { data: { repository: { pullRequest: {
        headRefOid: sha, commits: { nodes: [{ commit: { oid: sha, statusCheckRollup: null } }] }
      } } } };
      const packet = rollup([...checks.values()]);
      return packet;
    }
    if (method === "GET") {
      if (requested === `${route}/pulls/20`) return source.pr;
      if (requested === `${route}/pulls/20/files?per_page=100`) return source.files;
      if (requested === `${route}/actions/runs/100`) return source.run;
      if (requested === `${route}/actions/workflows/ci.yml`) return source.workflow;
      if (requested === `${route}/commits/${sha}`) return source.commit;
      if (requested === `${route}/compare/${parent}...main`) return source.history;
      if (requested === `${route}/actions/runs/100/attempts/1/jobs?per_page=100`) return source.jobs;
      const content = /\/contents\/(package\.json|package-lock\.json|CHANGELOG\.md)\?ref=([a-f0-9]{40})$/.exec(requested);
      if (content) {
        const docs = content[2] === parent ? source.base : source.head;
        const text = content[1] === "package.json" ? JSON.stringify(docs.manifest) :
          content[1] === "package-lock.json" ? JSON.stringify(docs.lock) : docs.changelog;
        return { type: "file", encoding: "base64", content: Buffer.from(text).toString("base64") };
      }
      const checkId = /\/check-runs\/(\d+)$/.exec(requested)?.[1];
      if (checkId) return checks.get(Number(checkId)) ?? source.native.find((check) => check.id === Number(checkId));
    }
    if (method === "POST" && requested === `${route}/check-runs`) {
      const id = 9001 + checks.size;
      const packet = {
        ...requireRecord(body, "Started check"), id, node_id: `opaque-check-${id}`,
        app: { id: actionsAppId }, conclusion: null
      };
      checks.set(id, packet);
      return packet;
    }
    if (method === "PATCH") {
      const id = Number(requested.split("/").at(-1));
      const packet = { ...checks.get(id), ...requireRecord(body, "Completed check") };
      checks.set(id, packet);
      return packet;
    }
    throw new Error(`Unexpected mocked request: ${method} ${requested}`);
  };
  return {
    source, calls, checks, request,
    wait: async () => { waits++; },
    hide: () => { visible = false; },
    waits: () => waits,
    writes: () => calls.filter((call) => call.method === "PATCH" || call.method === "POST" && call.route === `${route}/check-runs`)
  };
}

test("reporting context is limited to dedicated CI jobs at the exact dispatched release head", () => {
  const env = {
    GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: releaseRepository,
    GITHUB_JOB: "begin_release_pr_checks", GITHUB_SHA: sha, GITHUB_REF: context.ref,
    GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "1"
  };
  const args = ["--phase", "start", "--pr", "20", "--sha", sha];
  assert.deepEqual(parseCheckContext(env, args), context);
  for (const changed of [
    { GITHUB_ACTIONS: "false" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_JOB: "check" }, { GITHUB_SHA: parent }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_RUN_ATTEMPT: "0" }
  ]) assert.throws(() => parseCheckContext({ ...env, ...changed }, args));
  for (const badArgs of [
    ["--phase", "success", "--pr", "20", "--sha", sha], ["--phase", "start", "--pr", "-1", "--sha", sha],
    ["--phase", "start", "--pr", "20", "--sha", "short"], [...args, "--phase", "start"], [...args, "--token", "forbidden"]
  ]) assert.throws(() => parseCheckContext(env, badArgs));
  assert.throws(() => parseCheckContext({}, args), /only available inside/);
});

test("the CLI refuses manual result reporting before reading a token or creating checks", () => {
  const root = path.resolve(__dirname, "..");
  const result = spawnSync(process.execPath, [
    "--import", "tsx", path.join(root, "tools", "release-pr-checks.ts"), "--phase", "start", "--pr", "20", "--sha", sha
  ], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "false", TSX_DISABLE_CACHE: "1", GH_TOKEN: "" } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only available inside.*not as a manual success check/);
  assert.doesNotMatch(result.stderr, /CI job token|GitHub GET|GitHub POST/);
});

test("source verification reuses the release plan and rejects unrelated metadata, code, forks, or attempts", () => {
  validateReleasePrSource(context, fixture());
  const changes: ((data: ReturnType<typeof fixture>) => void)[] = [
    (data) => { data.pr.head.sha = parent; },
    (data) => { data.pr.head.repo = { full_name: "fork/repo" }; },
    (data) => { data.pr.user.login = "other"; },
    (data) => { data.pr.base.ref = "feature"; },
    (data) => { data.pr.state = "closed"; },
    (data) => { data.run.id = 101; },
    (data) => { data.run.run_attempt = 2; },
    (data) => { data.run.event = "pull_request"; },
    (data) => { data.run.head_sha = parent; },
    (data) => { data.run.workflow_id = 11; },
    (data) => { data.run.path = ".github/workflows/other.yml"; },
    (data) => { data.commit.parents.push({ sha: parent }); },
    (data) => { data.commit.author.login = "other"; },
    (data) => { data.history.merge_base_commit.sha = sha; },
    (data) => { data.history.status = "diverged"; },
    (data) => { data.files[0]!.filename = ".github/workflows/ci.yml"; },
    (data) => { data.files[0]!.status = "removed"; },
    (data) => { data.pr.changed_files = 4; },
    (data) => { requireRecord(data.head.manifest.scripts, "Scripts").check = "echo fake"; },
    (data) => { data.head.manifest.publisher = "other-publisher"; },
    (data) => { data.head.changelog = data.head.changelog.replace("Improved themes.", "Different notes."); },
    (data) => { data.head.changelog = "## Unreleased\n\n- No finalized version.\n"; }
  ];
  for (const change of changes) {
    const data = fixture();
    change(data);
    assert.throws(() => validateReleasePrSource(context, data));
  }
});

test("start writes only in-progress, exact-head app-bound checks and proves their PR association", async () => {
  const api = fakeApi();
  const result = await attachReleasePrChecks(context, api.request, api.wait);
  assert.equal(result.passed, false);
  assert.equal(result.checks.length, 2);
  assert.deepEqual(result.checks.map((check) => check.name), requiredCiChecks.map((check) => check.name));
  assert.equal(api.writes().length, 2);
  for (const call of api.writes()) {
    const body = requireRecord(call.body, "Body");
    assert.equal(body.status, "in_progress");
    assert.equal(body.head_sha, sha);
    assert.equal(body.conclusion, undefined);
    assert.match(String(body.external_id), /^release-ci:100:1:/);
  }
  assert.equal(api.waits(), 0);
});

test("finish uses actual native jobs/checks and updates only the checks created for this attempt", async () => {
  const api = fakeApi();
  const started = await attachReleasePrChecks(context, api.request, api.wait);
  const result = await attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, started.checks);
  assert.equal(result.passed, true);
  assert.equal(api.writes().filter((call) => call.method === "PATCH").length, 2);
  for (const packet of api.checks.values()) {
    assert.equal(packet.status, "completed");
    assert.equal(packet.conclusion, "success");
    assert.equal(requireRecord(packet.app, "App").id, actionsAppId);
    assert.equal(packet.head_sha, sha);
    const output = requireRecord(packet.output, "Proof");
    assert.match(String(output.summary), /Verified native job.*Native CI/);
    assert.match(String(packet.details_url), /\/actions\/runs\/100\/job\/(?:11|12)$/);
  }
});

test("actual failures, skipped, and neutral jobs never produce successful required checks", async () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral"]) {
    const api = fakeApi();
    const started = await attachReleasePrChecks(context, api.request, api.wait);
    api.source.jobs.jobs[1]!.conclusion = conclusion;
    api.source.native[1]!.conclusion = conclusion;
    const result = await attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, started.checks);
    assert.equal(result.passed, false);
    assert.notEqual(api.checks.get(9002)?.conclusion, "success");
  }
});

test("native proof requires exact suite, app, platform, final state, job URL, and successful mandatory steps", () => {
  const data = fixture();
  assert.equal(validateNativeCiResults(context, data.run, data.jobs, data.native).length, 2);
  const changes: ((data: ReturnType<typeof fixture>) => void)[] = [
    (data) => { data.jobs.jobs.pop(); },
    (data) => { data.jobs.jobs[0]!.status = "in_progress"; },
    (data) => { data.jobs.jobs[0]!.run_attempt = 2; },
    (data) => { data.jobs.jobs[0]!.run_id = 101; },
    (data) => { data.jobs.jobs[0]!.labels = ["windows-latest"]; },
    (data) => { data.jobs.jobs[0]!.html_url = "https://example.invalid/job"; },
    (data) => { data.jobs.jobs[0]!.steps[1]!.conclusion = "failure"; },
    (data) => { data.jobs.jobs[0]!.steps.pop(); },
    (data) => { data.native[0]!.head_sha = parent; },
    (data) => { data.native[0]!.app.id = 42; },
    (data) => { data.native[0]!.check_suite.id = 701; },
    (data) => { data.native[0]!.conclusion = "failure"; },
    (data) => { data.jobs.jobs[0]!.completed_at = "invalid"; }
  ];
  for (const change of changes) {
    const invalid = fixture();
    change(invalid);
    assert.throws(() => validateNativeCiResults(context, invalid.run, invalid.jobs, invalid.native));
  }
});

test("invalid native proof leaves required checks in progress rather than inventing a success", async () => {
  const api = fakeApi();
  const started = await attachReleasePrChecks(context, api.request, api.wait);
  api.source.jobs.jobs[0]!.steps[1]!.conclusion = "failure";
  await assert.rejects(attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, started.checks), /actual.*step to pass/);
  assert.equal(api.writes().filter((call) => call.method === "PATCH").length, 0);
  assert.ok([...api.checks.values()].every((check) => check.status === "in_progress"));
});

test("changed PR heads and incorrect started check/app identities cannot be updated", async () => {
  const api = fakeApi();
  const started = await attachReleasePrChecks(context, api.request, api.wait);
  requireRecord(api.checks.get(9001)?.app, "App").id = 42;
  await assert.rejects(attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, started.checks), /app binding/);
  assert.equal(api.writes().filter((call) => call.method === "PATCH").length, 0);
  const other = fakeApi();
  let reads = 0;
  const changed: GithubRequest = async (method, requested, body) => {
    const response = await other.request(method, requested, body);
    if (requested === `${route}/pulls/20` && ++reads > 1) return { ...other.source.pr, head: { ...other.source.pr.head, sha: parent } };
    return response;
  };
  await assert.rejects(attachReleasePrChecks(context, changed, other.wait), /exact dispatched head/);
  assert.equal(other.writes().length, 0);
});

test("old CI attempt outputs cannot supply new success checks", async () => {
  const api = fakeApi();
  const started = await attachReleasePrChecks(context, api.request, api.wait);
  const old = started.checks.map((check) => ({ ...check, externalId: check.externalId.replace(":1:", ":0:") }));
  await assert.rejects(attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, old), /different CI attempt/);
  assert.equal(api.writes().filter((call) => call.method === "PATCH").length, 0);
});

test("run success or REST-created checks without a PR rollup fail after a bounded wait", async () => {
  const api = fakeApi();
  api.hide();
  await assert.rejects(attachReleasePrChecks(context, api.request, api.wait), /Required CI is NOT verified/);
  assert.equal(api.waits(), 11);
  assert.ok([...api.checks.values()].every((check) => check.status === "in_progress" && check.conclusion === null));
});

test("successful native conclusions alone cannot claim readiness when completed checks remain absent from the PR rollup", async () => {
  const api = fakeApi();
  const started = await attachReleasePrChecks(context, api.request, api.wait);
  api.hide();
  await assert.rejects(attachReleasePrChecks({ ...context, phase: "finish" }, api.request, api.wait, started.checks), /Required CI is NOT verified/);
  assert.equal(api.waits(), 11);
  assert.ok([...api.checks.values()].every((check) => check.status === "completed" && check.conclusion === "success"));
});

test("rollup proof matches the exact REST-validated opaque checks, latest head, states, and conclusions", () => {
  const apiCheck = {
    id: 9001, node_id: "opaque-check-9001", name: requiredCiChecks[0].name, head_sha: sha,
    status: "in_progress", conclusion: null
  };
  const saved: AttachedCheck[] = [{ id: 9001, nodeId: "opaque-check-9001", name: requiredCiChecks[0].name, externalId: "unused" }];
  assert.equal(checkRollupMatches(context, rollup([apiCheck]), saved), true);
  assert.equal(checkRollupMatches(context, rollup([{ ...apiCheck, node_id: "older-check" }]), saved), false);
  assert.equal(checkRollupMatches(context, rollup([{ ...apiCheck, status: "completed", conclusion: "success" }]), saved), false);
  const optional = rollup([apiCheck]);
  optional.data.repository.pullRequest.commits.nodes[0]!.commit.statusCheckRollup.contexts.nodes[0]!.isRequired = false;
  assert.equal(checkRollupMatches(context, optional, saved), false);
  assert.throws(() => checkRollupMatches(context, rollup([apiCheck], parent), saved), /head changed/);
  assert.throws(() => checkRollupMatches(context, { errors: [{ message: "Denied" }] }, saved), /could not verify/);
});

test("CI preserves human required names and isolates Checks writes from untrusted PR execution", async () => {
  const root = path.resolve(__dirname, "..");
  const ci = await readFile(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const release = await readFile(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(ci, /^permissions:\r?\n  contents: read/m);
  assert.equal([...ci.matchAll(/^      checks: write$/gm)].length, 2);
  assert.doesNotMatch(ci, /statuses: write|contents: write|pull-requests: write|id-token: write/);
  assert.match(ci, /'Native CI' \|\| 'Check'/);
  const native = ci.slice(ci.indexOf("\n  check:"), ci.indexOf("\n  attach_release_pr_checks:"));
  assert.doesNotMatch(native, /checks: write|GH_TOKEN/);
  assert.match(native, /begin_release_pr_checks\.result == 'skipped'/);
  for (const section of [ci.slice(ci.indexOf("\n  begin_release_pr_checks:"), ci.indexOf("\n  check:")),
    ci.slice(ci.indexOf("\n  attach_release_pr_checks:"))]) {
    assert.match(section, /ref: main\r?\n          persist-credentials: false/);
    assert.match(section, /npm ci --ignore-scripts/);
    assert.match(section, /actions: read\r?\n      checks: write/);
  }
  assert.match(release, /gh workflow run ci\.yml --ref \$branch -f "release_pr=\$\(\$pr.number\)" -f "expected_sha=\$sha"/);
  assert.ok(release.indexOf("\n          gh pr create ") < release.indexOf("\n          gh workflow run ci.yml"));
  assert.doesNotMatch(release, /gh api|gh run approve|--force\b/);
});
