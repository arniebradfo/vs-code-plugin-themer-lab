import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alphaError,
  clamp,
  compositeColors,
  contrastRatio,
  contrastingForeground,
  deltaE,
  parseColor,
  relativeLuminance,
  toHex,
  toOklab,
  toOklch
} from "../src/color";

function close(actual: number, expected: number, tolerance = 0.0001): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test("hex parsing expands RGB/RGBA shorthand and preserves sRGB alpha bytes", () => {
  assert.equal(toHex(parseColor("#abc")), "#aabbcc");
  assert.equal(toHex(parseColor("#abcd")), "#aabbccdd");
  assert.equal(toHex(parseColor("#F008")), "#ff000088");
  assert.equal(toHex(parseColor("#123456ff")), "#123456");
  assert.equal(toHex(parseColor("#ff000000")), "#ff000000");
  assert.equal(toHex(parseColor("#abcdef01")), "#abcdef01");
  const red = parseColor("#ff000080");
  close(red.r, 1);
  close(red.g, 0);
  close(red.b, 0);
  close(red.alpha ?? -1, 128 / 255);
});

test("OKLab conversion agrees with independently known sRGB primary coordinates", () => {
  const red = toOklab("#ff0000");
  close(red.l, 0.62795536);
  close(red.a, 0.22486306);
  close(red.b, 0.12584630);
  const blue = toOklab("#0000ff");
  close(blue.l, 0.45201372);
  close(blue.a, -0.03245698);
  close(blue.b, -0.31152815);
  const redLch = toOklch("#ff0000");
  close(redLch.c, 0.2576833);
  close(redLch.h ?? -1, 29.2339, 0.01);
  close(toOklab("#000000").l, 0);
  close(toOklab("#ffffff").l, 1);
});

test("deltaE is Euclidean OKLab times 100, not alpha distance or CIEDE2000", () => {
  assert.equal(deltaE("#000000", "#ffffff"), 100);
  close(deltaE("#ff0000", "#0000ff"), 53.70898, 0.02);
  assert.equal(deltaE("#ff000000", "#ff0000ff"), 0);
  assert.equal(alphaError("#ff000000", "#ff0000ff"), 1);
  assert.ok(deltaE("#ff000000", "#0000ff00") > 50);
});

test("RGB black and white are exact OKLab/OKLCH endpoints, including shorthand and alpha", () => {
  for (const [hex, lightness] of [
    ["#000", 0], ["#00000080", 0], ["#fff", 1], ["#FFFFFF", 1], ["#ffffff00", 1]
  ] as const) {
    const lab = toOklab(hex);
    assert.equal(lab.l, lightness);
    assert.equal(lab.a, 0);
    assert.equal(lab.b, 0);
    const lch = toOklch(hex);
    assert.equal(lch.l, lightness);
    assert.equal(lch.c, 0);
    assert.equal(lch.alpha, parseColor(hex).alpha);
  }
});

test("OKLCH gamut mapping reduces extreme chroma while keeping a red hue and finite hex output", () => {
  const hex = toHex({ mode: "oklch", l: 0.65, c: 0.45, h: 30, alpha: 0.4 });
  assert.match(hex, /^#[0-9a-f]{6}66$/);
  const mapped = toOklch(hex);
  assert.ok(mapped.c < 0.3);
  close(mapped.l, 0.65, 0.03);
  close(mapped.h ?? -1, 30, 5);
  const output = parseColor(hex);
  assert.ok(output.r > output.g && output.r > output.b);
  for (const channel of [output.r, output.g, output.b, output.alpha]) {
    assert.ok(channel !== undefined && Number.isFinite(channel) && channel >= 0 && channel <= 1);
  }
});

test("compositing accepts an explicit native CSS alpha and rejects invalid overrides", () => {
  assert.equal(compositeColors("#ffffff80", "#000000", 0), "#000000");
  assert.equal(compositeColors("#ffffff80", "#000000", 0.5), "#808080");
  assert.equal(compositeColors("#ffffff80", "#000000", 1), "#ffffff");
  assert.equal(compositeColors("#ffffff80", "#000000"), compositeColors("#ffffff80", "#000000", 128 / 255));
  for (const alpha of [-0.01, 1.01, NaN, Infinity]) {
    assert.throws(() => compositeColors("#ffffff80", "#000000", alpha), /foreground alpha/);
  }
});

test("source-over uses encoded sRGB and correctly handles transparent backdrops", () => {
  assert.equal(compositeColors("#ffffff80", "#000000"), "#808080");
  assert.equal(compositeColors("#00000080", "#ffffff"), "#7f7f7f");
  assert.equal(compositeColors("#ff000000", "#0000ff"), "#0000ff");
  assert.equal(compositeColors("#ff000080", "#0000ff80"), "#aa0055c0");
  assert.equal(compositeColors("#ff000000", "#0000ff00"), "#00000000");
});

test("WCAG luminance uses sRGB transfer curves and refuses to ignore alpha", () => {
  close(relativeLuminance("#000000"), 0);
  close(relativeLuminance("#ffffff"), 1);
  close(relativeLuminance("#ff0000"), 0.2126);
  close(contrastRatio("#000000", "#ffffff"), 21);
  close(contrastRatio("#777777", "#ffffff"), 4.47809, 0.001);
  assert.equal(contrastRatio("#123456", "#123456"), 1);
  assert.throws(() => relativeLuminance("#ffffff80"), /opaque/);
  assert.throws(() => contrastRatio("#00000000", "#ffffff"), /opaque/);
});

test("automatic foreground uses perceptual luminance rather than RGB lightness or the hue", () => {
  for (const background of ["#00AEFF", "#ffffff", "#ffff00", "#00ff00", "#ff0000", "#777777"]) {
    assert.equal(contrastingForeground(background), "#000000", background);
    assert.ok(contrastRatio("#000000", background) >= 4.5, background);
  }
  for (const background of ["#000000", "#0000ff", "#297aa0", "#757575"]) {
    assert.equal(contrastingForeground(background), "#ffffff", background);
    assert.ok(contrastRatio("#ffffff", background) >= 4.5, background);
  }
  assert.throws(() => contrastingForeground("#00aeff80"), /opaque/);
  assert.throws(() => contrastingForeground("blue"), /Invalid theme color/);
});

test("black/white foreground choice stays readable across every 8-bit gray level", () => {
  for (let channel = 0; channel <= 255; channel++) {
    const background = `#${channel.toString(16).padStart(2, "0").repeat(3)}`;
    const chosen = contrastingForeground(background);
    const other = chosen === "#000000" ? "#ffffff" : "#000000";
    assert.ok(contrastRatio(chosen, background) >= 4.5, background);
    assert.ok(contrastRatio(chosen, background) >= contrastRatio(other, background), background);
  }
});

test("invalid strings and non-finite color components produce explicit errors", () => {
  for (const color of ["red", "transparent", "#12", "#12345", "#gggggg", " #ffffff", "#ffffff ", ""]) {
    assert.throws(() => parseColor(color), /Invalid theme color/);
  }
  assert.throws(() => parseColor(null as unknown as string), /Invalid theme color/);
  assert.throws(() => toHex({ mode: "oklab", l: NaN, a: 0, b: 0 }), /finite/);
  assert.throws(() => toHex({ mode: "oklch", l: 0.5, c: Infinity, h: 30 }), /finite/);
  assert.throws(() => toHex({ mode: "oklch", l: 0.5, c: 0.1, h: NaN }), /finite/);
  assert.throws(() => toHex({ mode: "oklch", l: 0.5, c: -0.1, h: 30 }), /nonnegative/);
  assert.throws(() => toHex({ mode: "rgb", r: 0, g: 0, b: 0, alpha: 2 }), /alpha/);
  assert.throws(() => toHex({ mode: "rgb", r: 0, g: 0, b: 0, alpha: NaN }), /alpha/);
  assert.throws(() => clamp(Infinity), /finite/);
  assert.throws(() => deltaE("#not-a-color", "#000000"), /Invalid theme color/);
});
