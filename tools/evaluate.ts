import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fitModel, inspectPalette, modelDefinitions } from "../src/model";
import type { ColorSample } from "../src/model/evaluation";
import { validateTolerance } from "../src/model/evaluation";
import { controls } from "../src/model/rules";
import { references } from "../src/shared/reference";
import { ThemeMode, numericParameterLimits } from "../src/shared/types";
import { parseThemeMode } from "../src/shared/validation";

export function parseEvaluationArguments(args: string[]): { tolerance: number; mode: ThemeMode } {
  let tolerance = 3;
  let supplied = false;
  let mode: ThemeMode = "dark";
  let modeSupplied = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--mode" || argument?.startsWith("--mode=")) {
      if (modeSupplied) throw new Error("--mode may only be supplied once.");
      mode = parseThemeMode(argument === "--mode" ? args[++index] : argument.slice("--mode=".length));
      modeSupplied = true;
      continue;
    }
    let value: string | undefined;
    if (argument === "--tolerance") {
      value = args[++index];
    } else if (argument?.startsWith("--tolerance=")) {
      value = argument.slice("--tolerance=".length);
    } else {
      throw new Error(`Unknown evaluation argument: ${String(argument)}. Use --tolerance <number>.`);
    }
    if (supplied) {
      throw new Error("--tolerance may only be supplied once.");
    }
    if (value === undefined || value.trim() === "") {
      throw new Error("--tolerance requires a finite nonnegative number.");
    }
    tolerance = validateTolerance(Number(value));
    supplied = true;
  }
  return { tolerance, mode };
}

export function createReport(tolerance = 3, mode: ThemeMode = "dark") {
  const reference = references[parseThemeMode(mode)];
  const modelDefinition = modelDefinitions[mode];
  validateTolerance(tolerance);
  const fit = fitModel(reference, tolerance);
  const inspection = inspectPalette(reference, fit.palette, tolerance);
  const transparent = inspection.samples.filter((sample) => sample.transparent);
  const worstRaw = [...inspection.samples]
    .sort((a, b) => b.deltaE - a.deltaE || a.id.localeCompare(b.id, "en"))
    .slice(0, 12);
  const worstRendered = inspection.samples
    .filter((sample) => sample.renderedDeltaE !== null)
    .sort((a, b) => (b.renderedDeltaE ?? 0) - (a.renderedDeltaE ?? 0) || a.id.localeCompare(b.id, "en"))
    .slice(0, 12);
  const worstAlpha = [...transparent]
    .sort((a, b) => b.alphaError - a.alphaError || a.id.localeCompare(b.id, "en"))
    .slice(0, 12);
  return {
    schemaVersion: 3,
    baseline: {
      theme: reference.theme,
      vscode: reference.vscode,
      sources: reference.sources,
      coverage: reference.coverage,
      explicitWorkbenchColorCount: Object.keys(reference.colors).length,
      orderedSyntaxRuleCount: reference.tokenColors.length,
      semanticTokenStyleCount: Object.keys(reference.semanticTokenColors).length,
      syntaxPolicy: "Syntax has a separate generator and native-editor report. Ordered reference syntax rules are not scored in this UI color evaluation."
    },
    experiment: {
      tolerance,
      fitting: modelDefinition.fitting,
      errorDefinition: "Euclidean OKLab distance multiplied by 100; NOT CIEDE2000.",
      primaryMetric: "Raw, unpremultiplied source RGB converted to OKLab. Alpha is not included in deltaE.",
      withinToleranceDefinition: "Percentage of generated colors whose raw deltaE <= tolerance; this rate does not test alpha or contrast. RGB black/white endpoints are canonical; no threshold epsilon is added.",
      alphaDefinition: "Absolute difference in alpha on [0,1], reported independently; exactMatchPercent requires equal alpha.",
      renderedMetric: "Secondary approximation: encoded-sRGB source-over, then Euclidean OKLab x 100. Each palette uses its own explicit state/subsystem background and an explicit editor fallback where needed.",
      renderedLimitations: "No runtime layer tree is available. Background choices are heuristics; nested overlays, CSS effects, and actual compositing space may differ. Composition is quantized to 8-bit hex at each layer. Missing backdrops are listed, not invented.",
      percentileDefinition: "Linear interpolation between sorted sample values at (count - 1) * quantile.",
      emptyStatistics: "Zero samples produce numeric zeros and a 0% success rate, not a claim of perfect fidelity.",
      contrastDefinition: "WCAG relative sRGB luminance. Text target 4.5:1 and illustrative focus-indicator target 3:1; missing pairs are omitted and transparent pairs are approximated.",
      acceptance: "No quality acceptance is asserted. Human review in the actual VS Code UI is required.",
      preservedStatistics: "Preserved workbench colors, unresolved/null entries, unscored supplemental tokens, syntax rules, and semantic token styles never inflate generated fit statistics.",
      semanticPolicyNote: "Info defaults to an accent/foreground link or remembered custom seed. Warning/Error and Added/Deleted/Modified stay independent. Added/Deleted drive chat counters; edited files follow Modified. Prominent status items share primary-button fills/readable text/hover. Suggestion text/icons/matches use explicit text colors independent of Quick Pick/button text. Inline-code foreground follows the accent with a 4.5:1 contrast guard against its unchanged background. Scrollbar/minimap thumbs and scrollbar shadows retain fixed opacities independently of Overlay opacity. Inactive selections cap opacity; interactive generation also protects code text. Classic and pinned Modern counterparts are always modeled; supported missing IDs are unscored and nulls stay unresolved. Personality switches default off: active accent text at Primary foreground lightness, bounded to 0.2-0.9 for chromatic accents before contrast adjustment, with native decoration precedence; accent tint across nonsemantic overlays and opaque interaction fills, with neutral painted chroma capped against active selection at current opacity on the region backdrop while retaining alpha/lightness; quieter 35% tint on scrollbars/minimap/shadows/grips; Neutral 7 brackets; native status fills from accent/resolved Color 2/quiet surfaces. Semantic overlays retain their hues. These variants are not native reconstruction. This baseline has all switches off and preserves debug/remote statuses, conflicts, ignored files, terminal ANSI and unrelated statuses.",
      knownResidualNote: "chat.slashCommandBackground and chat.slashCommandForeground remain generated from shared accent families. Their source blue palette differs from the default teal accent. Remaining color/alpha errors are reported for human review, not hidden by preservation."
    },
    complexity: modelDefinition,
    numericParameterLimits,
    model: {
      controlCount: fit.controlCount,
      controls,
      fixedRuleCount: fit.fixedRuleCount,
      exceptionCount: fit.exceptionCount,
      exceptionMeaning: "Preserved explicit workbench colors, excluded from all generated error statistics.",
      parameters: fit.parameters,
      coverage: fit.palette.coverage,
      roleCounts: inspection.roleCounts,
      raw: inspection.raw,
      rendered: inspection.rendered,
      alpha: inspection.alpha,
      transparentAlpha: {
        count: transparent.length,
        mean: transparent.length === 0
          ? 0
          : transparent.reduce((sum, sample) => sum + sample.alphaError, 0) / transparent.length,
        max: Math.max(0, ...transparent.map((sample) => sample.alphaError))
      },
      evaluation: fit.evaluation,
      preservedIds: inspection.preservedIds,
      unresolvedIds: inspection.unresolvedIds,
      unscoredGeneratedIds: inspection.unscoredGeneratedIds,
      renderedUnavailableIds: inspection.renderedUnavailableIds,
      worstRaw,
      worstRendered,
      worstAlpha,
      knownResiduals: inspection.samples.filter((sample) =>
        sample.id === "chat.slashCommandBackground" || sample.id === "chat.slashCommandForeground"),
      samples: inspection.samples
    }
  };
}

type EvaluationReport = ReturnType<typeof createReport>;
const number = (value: number): string => value.toFixed(3);
const cell = (value: string): string => value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");

function outlierTable(samples: ColorSample[]): string[] {
  return [
    "| ID | Role | Reference | Generated | Raw ΔE | Alpha error | Rendered ΔE | Backdrop IDs (approximate) |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- |",
    ...samples.map((sample) =>
      `| ${cell(sample.id)} | ${sample.role} | ${sample.reference} | ${sample.generated} | ${number(sample.deltaE)} | ${number(sample.alphaError)} | ${sample.renderedDeltaE === null ? "unavailable" : number(sample.renderedDeltaE)} | ${cell(sample.rendered?.backgroundIds.join(" → ") || (sample.transparent ? "unavailable" : "opaque"))} |`)
  ];
}

export function reportMarkdown(report: EvaluationReport): string {
  const { model } = report;
  const lines = [
    "# Themer Lab model evaluation",
    "",
    `Baseline: **${cell(report.baseline.theme.name)}**, VS Code **${report.baseline.vscode.version}** (${report.baseline.vscode.commit}).`,
    "",
    `${report.baseline.explicitWorkbenchColorCount} explicit workbench entries; ${report.baseline.orderedSyntaxRuleCount} ordered syntax rules; ${report.baseline.semanticTokenStyleCount} semantic token styles.`,
    "This is an explicit theme-chain capture, not registered defaults or a runtime-resolved palette. Syntax has its own generator and native-editor report; it is not scored here.",
    "",
    "## Method and limitations",
    "",
    `- ${report.experiment.errorDefinition}`,
    `- Primary: ${report.experiment.primaryMetric}`,
    `- Tolerance: **${report.experiment.tolerance}**. ${report.experiment.withinToleranceDefinition}`,
    `- Alpha: ${report.experiment.alphaDefinition}`,
    `- Rendered: ${report.experiment.renderedMetric}`,
    `- ${report.experiment.renderedLimitations}`,
    `- Percentiles: ${report.experiment.percentileDefinition}`,
    `- ${report.experiment.emptyStatistics}`,
    `- ${report.experiment.preservedStatistics}`,
    `- ${report.experiment.semanticPolicyNote}`,
    `- ${report.experiment.knownResidualNote}`,
    `- ${report.experiment.contrastDefinition}`,
    ...report.baseline.coverage.limitations.map((limitation) => `- ${cell(limitation)}`),
    "",
    `**${report.experiment.acceptance}**`,
    "",
    "## Model complexity and raw source-color fidelity",
    "",
    "| Controls | Fixed rules | Generated (scored) | Preserved (excluded) | Unresolved | Additional unscored | Mean ΔE | p50 | p95 | Max | Raw within tolerance |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${model.controlCount} | ${model.fixedRuleCount} | ${model.coverage.generated} | ${model.coverage.preserved} | ${model.coverage.unresolved} | ${model.coverage.unscoredGenerated} | ${number(model.raw.mean)} | ${number(model.raw.p50)} | ${number(model.raw.p95)} | ${number(model.raw.max)} | ${number(model.raw.withinTolerancePercent)}% |`,
    "",
    "## Alpha and approximate rendered fidelity",
    "",
    "| Alpha mean | Alpha max | Exact alpha matches | Transparent entries | Transparent alpha mean / max | Rendered samples | Unavailable | Rendered mean ΔE | p50 | p95 | Max | Rendered within tolerance |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${number(model.alpha.mean)} | ${number(model.alpha.max)} | ${number(model.alpha.exactMatchPercent)}% | ${model.transparentAlpha.count} | ${number(model.transparentAlpha.mean)} / ${number(model.transparentAlpha.max)} | ${model.rendered.count} | ${model.renderedUnavailableIds.length} | ${number(model.rendered.mean)} | ${number(model.rendered.p50)} | ${number(model.rendered.p95)} | ${number(model.rendered.max)} | ${number(model.rendered.withinTolerancePercent)}% |`,
    "",
    "Rendered scores cannot replace raw color or alpha errors. A fully transparent wrong RGB value can have zero rendered error.",
    "",
    "## Interpretable fixed rules",
    "",
    report.complexity.fitting,
    "",
    `${report.complexity.fixedRuleCount} fixed rules / numeric coefficients: ${Object.keys(report.complexity.families).length} shared color transforms, ${Object.keys(report.complexity.opacities).length} shared opacity transforms, and linked Info/selection plus Personality tint/contrast constants. ${report.complexity.semanticSelectorCount} semantic selectors (including counterpart aliases, optional assignments, preservation patterns and the preserve-unknown fallback).`,
    "These are hand-specified family rules, not learned per-token corrections. Learned coefficients: 0; per-token numeric residuals: 0.",
    "",
    `Anchors: ${Object.entries(report.complexity.parameterSourceIds).map(([name, id]) => `${name} from \`${id}\``).join(", ")}. Missing or non-opaque fit anchors cause an error.`,
    "",
    ...Object.entries(report.complexity.formulas).map(([name, formula]) => `- **${name}**: ${formula}`),
    "",
    "| Family | Anchor | Amount |",
    "| --- | --- | ---: |",
    ...Object.entries(report.complexity.families).map(([name, family]) =>
      `| ${name} | ${family.anchor} | ${family.amount} |`),
    "",
    `Opacity rules: ${Object.entries(report.complexity.opacities).map(([name, value]) => `${name}=${value}`).join(", ")}.`,
    "",
    "Severity and change selectors run before generic preservation. Info/Warning/Error and Added/Deleted/Modified are independent of each other, UI accent, and syntax. Conflicts, ignored files, success/chart/terminal ANSI palettes, and unknown identifiers remain preserved. Every preserved ID and ordered selector is listed in model-evaluation.json.",
    "",
    "## Controls and generated palette",
    "",
    `Controls: ${model.controls.join(", ")}. All controls are active; there is no model-size selection.`,
    "",
    `Parameters: \`${JSON.stringify(model.parameters)}\``,
    "",
    `Generated reference roles: surface ${model.roleCounts.surface}, text ${model.roleCounts.text}, border ${model.roleCounts.border}, accent ${model.roleCounts.accent}, info ${model.roleCounts.info}, warning ${model.roleCounts.warning}, error ${model.roleCounts.error}, added ${model.roleCounts.added}, deleted ${model.roleCounts.deleted}, modified ${model.roleCounts.modified}. Preserved exceptions: ${model.exceptionCount} (excluded).`,
    `Unresolved IDs: ${model.unresolvedIds.length ? model.unresolvedIds.map(cell).join(", ") : "none"}.`,
    `Supplemental generated IDs without a captured reference (excluded from fidelity): ${model.unscoredGeneratedIds.map(cell).join(", ") || "none"}.`,
    `Rendered-unavailable IDs: ${model.renderedUnavailableIds.length ? model.renderedUnavailableIds.map(cell).join(", ") : "none"}.`,
    "",
    "### Contrast checks (advisory, not acceptance)",
    "",
    "| Check | Rendered foreground | Rendered background | Ratio | Target | Result |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...model.evaluation.contrast.map((check) =>
      `| ${cell(check.label)} | ${check.foreground} | ${check.background} | ${number(check.ratio)} | ${check.target} | ${check.passes ? "pass" : "fail"} |`),
    "",
    "### Worst raw source-color outliers",
    "",
    ...outlierTable(model.worstRaw),
    "",
    "### Retained generated slash-command mismatches (human review)",
    "",
    report.experiment.knownResidualNote,
    "",
    ...outlierTable(model.knownResiduals),
    "",
    "### Worst alpha outliers",
    "",
    ...outlierTable(model.worstAlpha.slice(0, 6)),
    "",
    "### Worst approximate rendered outliers",
    "",
    ...outlierTable(model.worstRendered.slice(0, 6)),
    "",
    "## Source provenance",
    "",
    ...report.baseline.sources.map((source) => `- \`${source.path}\` — SHA-256 \`${source.sha256}\``),
    "",
    `Full unrounded metrics, selectors, preserved IDs, per-color raw/alpha/rendered errors, and background choices: [model-evaluation${report.model.parameters.mode === "light" ? "-light" : ""}.json](model-evaluation${report.model.parameters.mode === "light" ? "-light" : ""}.json).`,
    ""
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { tolerance, mode } = parseEvaluationArguments(process.argv.slice(2));
  const report = createReport(tolerance, mode);
  const name = `model-evaluation${mode === "light" ? "-light" : ""}`;
  const output = path.resolve(__dirname, "..", "reports");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(output, `${name}.md`), reportMarkdown(report), "utf8");
  console.log(`Wrote reports\\${name}.json and reports\\${name}.md. Human review is still required.`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
