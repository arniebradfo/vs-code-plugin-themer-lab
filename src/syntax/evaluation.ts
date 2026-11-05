import { deltaE } from "../color";
import { validateTolerance } from "../model/evaluation";

export interface SyntaxRun {
  start: number;
  end: number;
  color: string;
}

export interface SyntaxLine {
  text: string;
  runs: SyntaxRun[];
}

export interface NativeColorPair {
  reference: string;
  generated: string;
  count: number;
  deltaE: number;
  line: number;
  column: number;
  example: string;
}

function lineColors(line: SyntaxLine): string[] {
  const colors: string[] = [];
  let end = 0;
  for (const run of line.runs) {
    if (!Number.isSafeInteger(run.start) || !Number.isSafeInteger(run.end) ||
      run.start !== end || run.end <= run.start || run.end > line.text.length ||
      !/^#[0-9a-f]{6}$/i.test(run.color)) {
      throw new Error("Native syntax runs must cover source text contiguously with valid opaque colors.");
    }
    for (let index = run.start; index < run.end; index++) colors.push(run.color.toLowerCase());
    end = run.end;
  }
  if (end !== line.text.length) throw new Error("Native syntax capture is missing source characters.");
  return colors;
}

export function summarizeNativePairs(pairs: NativeColorPair[], tolerance: number) {
  validateTolerance(tolerance);
  for (const pair of pairs) {
    if (!Number.isSafeInteger(pair.count) || pair.count < 1 || !Number.isFinite(pair.deltaE) || pair.deltaE < 0) {
      throw new Error("Native syntax pair counts must be positive integers and errors must be finite and nonnegative.");
    }
  }
  const errors = pairs.flatMap((pair) => Array<number>(pair.count).fill(pair.deltaE)).sort((left, right) => left - right);
  const count = errors.length;
  const percentile = (fraction: number): number => {
    if (count === 0) return 0;
    const position = (count - 1) * fraction;
    const lower = errors[Math.floor(position)];
    const upper = errors[Math.ceil(position)];
    if (lower === undefined || upper === undefined) throw new Error("Invalid native syntax percentile.");
    return lower + (upper - lower) * (position - Math.floor(position));
  };
  const within = errors.filter((error) => error <= tolerance).length;
  return {
    tolerance,
    count,
    referenceColorCount: new Set(pairs.map((pair) => pair.reference)).size,
    generatedColorCount: new Set(pairs.map((pair) => pair.generated)).size,
    meanError: count === 0 ? 0 : errors.reduce((sum, error) => sum + error, 0) / count,
    p95Error: percentile(0.95),
    maxError: errors.at(-1) ?? 0,
    withinToleranceCount: within,
    withinTolerancePercent: count === 0 ? 0 : 100 * within / count,
    exactMatchPercent: count === 0 ? 0 : 100 * errors.filter((error) => error === 0).length / count,
    passes: count > 0 && within === count
  };
}

export function compareNativeForegrounds(reference: SyntaxLine[], generated: SyntaxLine[], tolerance = 3) {
  validateTolerance(tolerance);
  if (reference.length !== generated.length) throw new Error("Native reference and generated line counts differ.");
  const pairs = new Map<string, NativeColorPair>();
  reference.forEach((line, lineIndex) => {
    const output = generated[lineIndex];
    if (!output || line.text !== output.text) throw new Error(`Native source text differs at line ${lineIndex + 1}.`);
    const expected = lineColors(line);
    const actual = lineColors(output);
    for (let column = 0; column < line.text.length; column++) {
      const character = line.text[column];
      if (character === undefined || /\s/.test(character)) continue;
      const source = expected[column];
      const color = actual[column];
      if (!source || !color) throw new Error("A source character has no native foreground color.");
      const key = `${source}/${color}`;
      const pair = pairs.get(key);
      if (pair) pair.count++;
      else pairs.set(key, {
        reference: source,
        generated: color,
        count: 1,
        deltaE: deltaE(source, color),
        line: lineIndex + 1,
        column: column + 1,
        example: line.text.slice(Math.max(0, column - 12), column + 32).trim()
      });
    }
  });
  const colors = [...pairs.values()].sort((left, right) =>
    right.deltaE - left.deltaE || left.reference.localeCompare(right.reference, "en") || left.generated.localeCompare(right.generated, "en")
  );
  return { ...summarizeNativePairs(colors, tolerance), pairs: colors };
}
