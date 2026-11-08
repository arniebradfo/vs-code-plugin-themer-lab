import { appendFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { requireRecord, requireString } from "../src/shared/validation";
import { createReleasePlan, nextReleaseVersion, type ReleaseBump } from "./prepare-release";
import { getChangelogSections, getReleaseMetadata, parseReleaseVersion } from "./release";
import { releaseRepository, requireCommit, requireRunId } from "./release-workflow";

export const actionsAppId = 15368;
export const requiredCiChecks = [
  {
    name: "Check (ubuntu-latest)", job: "Native CI (ubuntu-latest)", runner: "ubuntu-latest",
    steps: ["Run npm ci", "Run npm run check", "Check runtime dependency advisories", "Record full tooling audit and reject high-severity advisories"]
  },
  {
    name: "Check (windows-latest)", job: "Native CI (windows-latest)", runner: "windows-latest",
    steps: ["Run npm ci", "Run npm run check", "Package review VSIX", "Inspect the actual review package", "Upload review VSIX"]
  }
] as const;

export interface ReleasePrCheckContext {
  phase: "start" | "finish";
  pr: string;
  sha: string;
  runId: string;
  attempt: string;
  ref: string;
}

export interface AttachedCheck {
  id: number;
  nodeId: string;
  name: string;
  externalId: string;
}

export type GithubRequest = (method: "GET" | "POST" | "PATCH", route: string, body?: unknown) => Promise<unknown>;

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((entry) => requireRecord(entry, label));
}

export function parseCheckContext(env: NodeJS.ProcessEnv, args: string[]): ReleasePrCheckContext {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index] ?? "";
    if (!["--phase", "--pr", "--sha"].includes(name) || values.has(name)) throw new Error(`Unknown or duplicate check argument: ${name}.`);
    values.set(name, requireString(args[++index], name));
  }
  const phase = values.get("--phase");
  if (phase !== "start" && phase !== "finish") throw new Error("Check phase must be start or finish.");
  const job = phase === "start" ? "begin_release_pr_checks" : "attach_release_pr_checks";
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_REPOSITORY !== releaseRepository || env.GITHUB_JOB !== job) {
    throw new Error("Required-check reporting is only available inside this repository's dedicated CI jobs, not as a manual success check.");
  }
  const sha = requireCommit(values.get("--sha"));
  if (sha !== requireCommit(env.GITHUB_SHA)) throw new Error("Expected PR head must equal the dispatched workflow's exact source commit.");
  const ref = requireString(env.GITHUB_REF, "CI ref");
  if (!ref.startsWith("refs/heads/release/v")) throw new Error("Required-check reporting only supports release branches.");
  parseReleaseVersion(ref.slice("refs/heads/release/v".length));
  const pr = requireRunId(values.get("--pr"));
  positiveNumber(Number(pr), "PR number");
  return { phase, pr, sha, ref, runId: requireRunId(env.GITHUB_RUN_ID), attempt: requireRunId(env.GITHUB_RUN_ATTEMPT) };
}

function assertPr(context: ReleasePrCheckContext, value: unknown): Record<string, unknown> {
  const pr = requireRecord(value, "Release PR");
  const head = requireRecord(pr.head, "PR head");
  const base = requireRecord(pr.base, "PR base");
  if (String(positiveNumber(pr.number, "PR number")) !== context.pr || pr.state !== "open" ||
      requireRecord(pr.user, "PR author").login !== "github-actions[bot]" ||
      requireRecord(head.repo, "Head repository").full_name !== releaseRepository ||
      requireRecord(base.repo, "Base repository").full_name !== releaseRepository || base.ref !== "main" ||
      head.sha !== context.sha || `refs/heads/${String(head.ref)}` !== context.ref) {
    throw new Error("Only the open, same-repository bot release PR at the exact dispatched head can receive required checks.");
  }
  return pr;
}

interface SourceDocuments {
  manifest: unknown;
  lock: unknown;
  changelog: string;
}

export function validateReleasePrSource(context: ReleasePrCheckContext, input: {
  pr: unknown; run: unknown; workflow: unknown; commit: unknown; history: unknown; files: unknown;
  base: SourceDocuments; head: SourceDocuments;
}): void {
  const pr = assertPr(context, input.pr);
  const run = requireRecord(input.run, "CI run");
  const workflow = requireRecord(input.workflow, "CI workflow");
  if (String(positiveNumber(run.id, "CI run ID")) !== context.runId || run.event !== "workflow_dispatch" ||
      String(positiveNumber(run.run_attempt, "CI attempt")) !== context.attempt ||
      run.head_sha !== context.sha || `refs/heads/${String(run.head_branch)}` !== context.ref ||
      run.path !== ".github/workflows/ci.yml" || workflow.path !== run.path || workflow.id !== run.workflow_id ||
      requireRecord(run.repository, "CI repository").full_name !== releaseRepository ||
      requireRecord(run.head_repository, "CI head repository").full_name !== releaseRepository) {
    throw new Error("CI proof must come from this exact workflow, repository, source commit, and current attempt.");
  }
  const commit = requireRecord(input.commit, "Release commit");
  const parents = records(commit.parents, "Release parents");
  if (commit.sha !== context.sha || parents.length !== 1 ||
      requireRecord(commit.author, "Release author").login !== "github-actions[bot]" ||
      requireRecord(commit.committer, "Release committer").login !== "github-actions[bot]") {
    throw new Error("Release checks require the single bot preparation commit.");
  }
  const parent = requireCommit(parents[0]?.sha);
  const history = requireRecord(input.history, "Main history");
  if (!["identical", "ahead"].includes(String(history.status)) ||
      requireRecord(history.merge_base_commit, "Main merge base").sha !== parent) {
    throw new Error("The release commit's parent must belong to protected main history.");
  }
  const files = records(input.files, "Release files");
  if (files.length === 0 || files.length > 3 || pr.changed_files !== files.length ||
      new Set(files.map((file) => file.filename)).size !== files.length ||
      files.some((file) => file.status !== "modified" || !["package.json", "package-lock.json", "CHANGELOG.md"].includes(String(file.filename)))) {
    throw new Error("Only the version/changelog preparation files may differ from main.");
  }
  const metadata = getReleaseMetadata(input.head.manifest, input.head.lock, input.head.changelog);
  if (context.ref !== `refs/heads/release/${metadata.tag}`) throw new Error("Release branch must match the finalized version.");
  const previous = parseReleaseVersion(requireRecord(input.base.manifest, "Base manifest").version);
  const bump: ReleaseBump | undefined = previous === metadata.version ? "initial" :
    (["patch", "minor", "major"] as const).find((kind) => nextReleaseVersion(previous, kind) === metadata.version);
  if (!bump) throw new Error("The release must follow the deliberate next-version rules.");
  const heading = getChangelogSections(input.head.changelog).find((section) => section.version === metadata.version)?.heading ?? "";
  const date = / - (\d{4}-\d{2}-\d{2})$/.exec(heading)?.[1];
  if (!date) throw new Error("The prepared release heading needs its exact release date.");
  const plan = createReleasePlan(input.base.manifest, input.base.lock, input.base.changelog, { bump, date });
  if (!isDeepStrictEqual(plan.manifest, input.head.manifest) || !isDeepStrictEqual(plan.lock, input.head.lock) ||
      plan.changelog.replaceAll("\r\n", "\n") !== input.head.changelog.replaceAll("\r\n", "\n")) {
    throw new Error("Release preparation must not change scripts, dependencies, publisher, license, or unrelated changelog content.");
  }
}

function decodeContent(value: unknown): string {
  const file = requireRecord(value, "Source file");
  if (file.type !== "file" || file.encoding !== "base64") throw new Error("Source verification requires a complete GitHub file response.");
  return Buffer.from(requireString(file.content, "Source content"), "base64").toString("utf8");
}

const repositoryRoute = `/repos/${releaseRepository}`;

async function verifySource(context: ReleasePrCheckContext, request: GithubRequest): Promise<Record<string, unknown>> {
  const [prValue, runValue, workflow, commitValue, files] = await Promise.all([
    request("GET", `${repositoryRoute}/pulls/${context.pr}`),
    request("GET", `${repositoryRoute}/actions/runs/${context.runId}`),
    request("GET", `${repositoryRoute}/actions/workflows/ci.yml`),
    request("GET", `${repositoryRoute}/commits/${context.sha}`),
    request("GET", `${repositoryRoute}/pulls/${context.pr}/files?per_page=100`)
  ]);
  assertPr(context, prValue);
  const commit = requireRecord(commitValue, "Release commit");
  const parents = records(commit.parents, "Release parents");
  if (parents.length !== 1) throw new Error("Release checks require one preparation commit.");
  const parent = requireCommit(parents[0]?.sha);
  const documents = async (sha: string): Promise<SourceDocuments> => {
    const [manifest, lock, changelog] = await Promise.all(["package.json", "package-lock.json", "CHANGELOG.md"]
      .map((file) => request("GET", `${repositoryRoute}/contents/${file}?ref=${sha}`).then(decodeContent)));
    return { manifest: JSON.parse(manifest ?? ""), lock: JSON.parse(lock ?? ""), changelog: changelog ?? "" };
  };
  const [history, base, head] = await Promise.all([
    request("GET", `${repositoryRoute}/compare/${parent}...main`), documents(parent), documents(context.sha)
  ]);
  validateReleasePrSource(context, { pr: prValue, run: runValue, workflow, commit, history, files, base, head });
  return requireRecord(runValue, "CI run");
}

function externalId(context: ReleasePrCheckContext, name: string): string {
  return `release-ci:${context.runId}:${context.attempt}:${name}`;
}

function validateAttachedCheck(context: ReleasePrCheckContext, value: unknown, name: string): AttachedCheck {
  const check = requireRecord(value, "Reported check");
  if (check.name !== name || check.head_sha !== context.sha ||
      requireRecord(check.app, "Reported check app").id !== actionsAppId ||
      check.external_id !== externalId(context, name)) {
    throw new Error("Reported check must retain the exact source, context name, CI attempt, and GitHub Actions app binding.");
  }
  return {
    id: positiveNumber(check.id, "Check ID"), nodeId: requireString(check.node_id, "Check node ID"),
    name, externalId: externalId(context, name)
  };
}

export function checkRollupMatches(context: ReleasePrCheckContext, value: unknown, checks: AttachedCheck[], conclusions?: string[]): boolean {
  const response = requireRecord(value, "PR rollup response");
  if (Array.isArray(response.errors) && response.errors.length > 0) throw new Error("GitHub could not verify the PR rollup.");
  const pr = requireRecord(requireRecord(requireRecord(response.data, "GraphQL data").repository, "Repository").pullRequest, "PR rollup");
  if (pr.headRefOid !== context.sha) throw new Error("PR head changed before required CI could be verified.");
  const commits = records(requireRecord(pr.commits, "PR commits").nodes, "PR commit nodes");
  const commit = requireRecord(commits[0]?.commit, "PR head commit");
  if (commit.oid !== context.sha) throw new Error("PR rollup is not for the dispatched source.");
  if (!commit.statusCheckRollup) return false;
  const contexts = requireRecord(requireRecord(commit.statusCheckRollup, "Status rollup").contexts, "Check contexts");
  if (requireRecord(contexts.pageInfo, "Context page").hasNextPage !== false) throw new Error("Cannot verify a truncated required-check rollup.");
  const nodes = records(contexts.nodes, "Rollup nodes");
  // REST pins the app; opaque node IDs bind those same checks without querying GitHub's private App GraphQL resource.
  return checks.every((check, index) => nodes.some((node) => node.__typename === "CheckRun" &&
    node.id === check.nodeId && node.name === check.name && node.isRequired === true &&
    requireRecord(requireRecord(node.checkSuite, "Rollup suite").commit, "Rollup source").oid === context.sha &&
    node.status === (conclusions ? "COMPLETED" : "IN_PROGRESS") &&
    node.conclusion === (conclusions ? conclusions[index]?.toUpperCase() : null)));
}

async function verifyRollup(context: ReleasePrCheckContext, checks: AttachedCheck[], request: GithubRequest,
  wait: (milliseconds: number) => Promise<void>, conclusions?: string[]): Promise<void> {
  const [owner, name] = releaseRepository.split("/");
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){
    headRefOid commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){
      pageInfo{hasNextPage} nodes{__typename ... on CheckRun{id name isRequired(pullRequestNumber:$pr) status conclusion checkSuite{commit{oid}}}}
    }}}}}}}}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const rollup = await request("POST", "/graphql", { query, variables: { owner, name, pr: Number(context.pr) } });
    if (checkRollupMatches(context, rollup, checks, conclusions)) return;
    if (attempt < 11) await wait(5000);
  }
  throw new Error("GitHub did not attach the exact app-bound checks to the PR rollup. Required CI is NOT verified; do not infer merge readiness from a successful dispatched run.");
}

interface NativeResult {
  name: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  url: string;
  summary: string;
}

export function validateNativeCiResults(context: ReleasePrCheckContext, run: unknown, jobsValue: unknown, checkValues: unknown[]): NativeResult[] {
  const suite = positiveNumber(requireRecord(run, "CI run").check_suite_id, "Native suite ID");
  const jobs = records(requireRecord(jobsValue, "CI jobs").jobs, "Native jobs");
  return requiredCiChecks.map((required, index) => {
    const matches = jobs.filter((job) => job.name === required.job);
    if (matches.length !== 1) throw new Error(`One actual ${required.job} job is required.`);
    const job = matches[0] ?? {};
    const check = requireRecord(checkValues[index], "Native check");
    const jobId = positiveNumber(job.id, "Native job ID");
    const checkId = positiveNumber(check.id, "Native check ID");
    const url = `https://github.com/${releaseRepository}/actions/runs/${context.runId}/job/${jobId}`;
    if (String(job.run_id) !== context.runId || String(job.run_attempt) !== context.attempt ||
        job.status !== "completed" || check.status !== "completed" || check.name !== required.job ||
        check.head_sha !== context.sha || requireRecord(check.app, "Native app").id !== actionsAppId ||
        requireRecord(check.check_suite, "Native suite").id !== suite ||
        job.check_run_url !== `https://api.github.com${repositoryRoute}/check-runs/${checkId}` ||
        job.html_url !== url || check.details_url !== url || job.conclusion !== check.conclusion ||
        !Array.isArray(job.labels) || !job.labels.includes(required.runner)) {
      throw new Error("Only completed native CI jobs from this exact source, suite, runner, and attempt can supply conclusions.");
    }
    const conclusion = requireString(job.conclusion, "Native conclusion");
    if (!["success", "failure", "cancelled", "timed_out", "action_required", "skipped", "neutral"].includes(conclusion)) {
      throw new Error("Unrecognized native CI conclusion.");
    }
    if (conclusion === "success") {
      const steps = records(job.steps, "Native steps");
      for (const name of required.steps) {
        const matches = steps.filter((step) => step.name === name);
        if (matches.length !== 1 || matches[0]?.status !== "completed" || matches[0].conclusion !== "success") {
          throw new Error(`Successful CI proof requires the actual ${name} step to pass.`);
        }
      }
    }
    const startedAt = requireString(job.started_at, "Native start");
    const completedAt = requireString(job.completed_at, "Native completion");
    if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < Date.parse(startedAt)) {
      throw new Error("Native CI timestamps are invalid.");
    }
    return {
      name: required.name,
      conclusion: ["skipped", "neutral", "action_required"].includes(conclusion) ? "failure" : conclusion,
      startedAt, completedAt, url,
      summary: `Verified native job **${required.job}** (${jobId}), check ${checkId}, GitHub Actions app ${actionsAppId}.\n\n` +
        `Source: \`${context.sha}\`. CI run ${context.runId}, attempt ${context.attempt}. Actual conclusion: **${conclusion}**.\n\n` +
        `[Read the actual job logs](${url}). Skipped or neutral jobs never satisfy this required validation.`
    };
  });
}

export async function attachReleasePrChecks(context: ReleasePrCheckContext, request: GithubRequest,
  wait: (milliseconds: number) => Promise<void>, checksValue?: unknown): Promise<{ checks: AttachedCheck[]; passed: boolean }> {
  const run = await verifySource(context, request);
  await request("GET", `${repositoryRoute}/pulls/${context.pr}`).then((pr) => assertPr(context, pr));
  if (context.phase === "start") {
    const checks: AttachedCheck[] = [];
    for (const required of requiredCiChecks) {
      const response = await request("POST", `${repositoryRoute}/check-runs`, {
        name: required.name, head_sha: context.sha, external_id: externalId(context, required.name), status: "in_progress",
        details_url: `https://github.com/${releaseRepository}/actions/runs/${context.runId}/attempts/${context.attempt}`,
        output: { title: "Required CI in progress", summary: `Waiting for actual ${required.job} results at \`${context.sha}\`, run ${context.runId}, attempt ${context.attempt}.` }
      });
      const check = validateAttachedCheck(context, response, required.name);
      if (requireRecord(response, "Started check").status !== "in_progress") throw new Error("Required CI must start in progress, never as a successful check.");
      checks.push(check);
    }
    await verifyRollup(context, checks, request, wait);
    return { checks, passed: false };
  }
  const saved = records(checksValue, "Started checks");
  if (saved.length !== requiredCiChecks.length) throw new Error("Both checks from this CI attempt must have started.");
  const checks = saved.map((value, index): AttachedCheck => {
    const required = requiredCiChecks[index];
    if (!required || value.name !== required.name || value.externalId !== externalId(context, required.name)) {
      throw new Error("Started checks belong to a different CI attempt or required context.");
    }
    return { id: positiveNumber(value.id, "Started check ID"), nodeId: requireString(value.nodeId, "Started node ID"), name: required.name, externalId: externalId(context, required.name) };
  });
  const jobsValue = await request("GET", `${repositoryRoute}/actions/runs/${context.runId}/attempts/${context.attempt}/jobs?per_page=100`);
  const jobs = records(requireRecord(jobsValue, "CI jobs").jobs, "CI jobs");
  const nativeChecks = await Promise.all(requiredCiChecks.map((required) => {
    const matches = jobs.filter((job) => job.name === required.job);
    if (matches.length !== 1) throw new Error(`Missing actual ${required.job} job.`);
    const url = requireString(matches[0]?.check_run_url, "Native check URL");
    const prefix = `https://api.github.com${repositoryRoute}/check-runs/`;
    if (!url.startsWith(prefix)) throw new Error("Native check URL belongs to a different repository.");
    return request("GET", `${repositoryRoute}/check-runs/${requireRunId(url.slice(prefix.length))}`);
  }));
  const results = validateNativeCiResults(context, run, jobsValue, nativeChecks);
  await request("GET", `${repositoryRoute}/pulls/${context.pr}`).then((pr) => assertPr(context, pr));
  for (let index = 0; index < checks.length; index++) {
    const check = checks[index];
    const result = results[index];
    if (!check || !result) throw new Error("Incomplete native CI proof.");
    const current = await request("GET", `${repositoryRoute}/check-runs/${check.id}`);
    const actual = validateAttachedCheck(context, current, check.name);
    if (actual.id !== check.id || actual.nodeId !== check.nodeId) throw new Error("Started check identity changed.");
    const updated = await request("PATCH", `${repositoryRoute}/check-runs/${check.id}`, {
      status: "completed", conclusion: result.conclusion, started_at: result.startedAt, completed_at: result.completedAt,
      details_url: result.url, output: { title: `${result.name}: ${result.conclusion}`, summary: result.summary }
    });
    const completed = validateAttachedCheck(context, updated, check.name);
    const packet = requireRecord(updated, "Completed check");
    if (completed.id !== check.id || completed.nodeId !== check.nodeId ||
        packet.status !== "completed" || packet.conclusion !== result.conclusion) {
      throw new Error("GitHub did not retain the actual native CI conclusion and check identity.");
    }
  }
  await verifyRollup(context, checks, request, wait, results.map((result) => result.conclusion));
  return { checks, passed: results.every((result) => result.conclusion === "success") };
}

async function main(): Promise<void> {
  const context = parseCheckContext(process.env, process.argv.slice(2));
  const token = requireString(process.env.GH_TOKEN, "CI job token");
  const request: GithubRequest = async (method, route, body) => {
    const response = await fetch(`https://api.github.com${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${route} failed with HTTP ${response.status}. No credential or success-status fallback is used.`);
    return response.json();
  };
  const checks = context.phase === "finish" ? JSON.parse(requireString(process.env.CHECKS_JSON, "Started CI checks")) : undefined;
  const result = await attachReleasePrChecks(context, request, (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), checks);
  if (context.phase === "start") {
    await appendFile(requireString(process.env.GITHUB_OUTPUT, "CI output"), `checks=${JSON.stringify(result.checks)}\n`);
    console.log(`Required checks are in progress and associated with PR #${context.pr} at ${context.sha}.`);
  } else {
    console.log(`Actual CI conclusions are associated with PR #${context.pr} at ${context.sha}: ${result.passed ? "passed" : "failed"}.`);
    if (!result.passed) process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
