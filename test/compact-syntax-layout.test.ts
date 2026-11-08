import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing layout constraint: ${selector}`);
  const open = source.indexOf("{", start);
  let depth = 1;
  for (let index = open + 1; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed layout constraint: ${selector}`);
}

function pixels(source: string, property: string): number {
  const value = new RegExp(`(?:^|;)\\s*${property}:\\s*(\\d+)(?:px)?\\s*;`).exec(source)?.[1];
  assert.notEqual(value, undefined, `Missing ${property} pixel constraint.`);
  return Number(value);
}

test("compact syntax controls fit the measured Linux 320px row without reducing usable targets", async () => {
  const css = await readFile(path.resolve(__dirname, "..", "src", "webview", "styles.css"), "utf8");
  const compact = block(css, "@container panel (max-width: 279px)");
  assert.match(compact, /\.syntax-adjustments \.syntax-mode-heading,\s*\.syntax-adjustments \.syntax-mode-options\s*\{/);
  const gap = pixels(block(compact, ".syntax-adjustments .syntax-mode-options"), "gap");
  const group = block(compact, ".syntax-adjustments .segmented-control");
  const groupGap = pixels(group, "gap");
  const groupPadding = pixels(group, "padding-inline");
  const button = block(compact, ".syntax-adjustments .segment span");
  const buttonPadding = pixels(button, "padding-inline");
  const buttonMinimum = pixels(button, "min-width");
  const border = Number(/(?:^|;)\s*border:\s*(\d+)px\b/.exec(block(css, ".segmented-control"))?.[1]);
  const buttonBorder = Number(/(?:^|;)\s*border:\s*(\d+)px\b/.exec(block(css, ".segment span"))?.[1]);
  assert.equal(border, 1, "Preserve the existing segmented-control frame.");
  assert.equal(buttonBorder, 1, "Preserve the existing radio-button border.");

  // Intrinsic text widths measured in real Linux VS Code 1.143.1 at the failing 320px viewport.
  const textWidths = [25.547, 39.984, 16.25];
  const buttons = textWidths.map((width) => Math.max(buttonMinimum, width + buttonPadding * 2 + buttonBorder * 2));
  const modeWidth = buttons.reduce((sum, width) => sum + width, 0) + groupGap * 2 + groupPadding * 2 + border * 2;
  const required = 57.453 + modeWidth + 20 + gap * 2 + 59.609 + gap;
  assert.ok(required <= 251, `Compact row requires ${required}px but the native viewport provides 251px.`);
  assert.equal(Number(required.toFixed(3)), 250.843);
  assert.ok(buttons.every((width) => width >= 24), "All radio hit targets must retain at least 24px width.");
  assert.equal(buttonMinimum, 24, "Smaller system-font glyphs must not reduce a radio hit target.");
  assert.equal(pixels(block(css, ".segment span"), "min-height"), 24);
});

test("wide syntax controls retain their existing spacing and font sizes", async () => {
  const css = await readFile(path.resolve(__dirname, "..", "src", "webview", "styles.css"), "utf8");
  assert.equal(pixels(block(css, ".syntax-mode-heading"), "gap"), 8);
  assert.equal(pixels(block(css, ".syntax-mode-options"), "gap"), 4);
  assert.equal(pixels(block(css, ".syntax-mode-options"), "font-size"), 12);
  assert.equal(pixels(block(css, ".syntax-mode-options .segment span"), "padding-inline"), 4);
  assert.equal(pixels(block(css, ".syntax-mode-options .segment span"), "font-size"), 11);
  assert.equal(pixels(block(css, ".mode-value"), "font-size"), 11);
});
