import assert from "node:assert/strict";
import { test } from "node:test";
import { editorSamples } from "../src/shared/samples";
import { reference } from "../src/shared/reference";
import { infoSources, personalityDefaults, personalityKeys } from "../src/shared/types";
import { parseClientMessage, parseParameters } from "../src/shared/validation";
import { getDefaultSyntaxParameters } from "../src/syntax";

const syntaxParameters = getDefaultSyntaxParameters(reference);

test("User Apply and explicit Workspace Apply are distinct protocol actions", () => {
  assert.deepEqual(parseClientMessage({ type: "apply" }), { type: "apply" });
  assert.deepEqual(parseClientMessage({ type: "applyWorkspace" }), { type: "applyWorkspace" });
  assert.throws(() => parseClientMessage({ type: "applyUser" }), /Unknown/);
});

const parameters = {
  mode: "dark",
  background: "#121314",
  foreground: "#bfbfbf",
  accent: "#297aa0",
  infoSource: "accent",
  info: "#3a94bc",
  warning: "#cca700",
  error: "#f48771",
  added: "#73c991",
  deleted: "#f48771",
  modified: "#e5ba7d",
  surfaceSpread: 1,
  mutedContrast: 1,
  borderStrength: 1,
  overlayOpacity: 1,
  ...personalityDefaults
};

test("Personality toggles are required booleans across the draft protocol", () => {
  for (const key of personalityKeys) {
    for (const value of [true, false]) {
      const edited = { ...parameters, [key]: value };
      assert.deepEqual(parseParameters(edited), edited);
      assert.deepEqual(parseClientMessage({ type: "parameters", parameters: edited, syntaxParameters, revision: 1 }), {
        type: "parameters", parameters: edited, syntaxParameters, revision: 1
      });
    }
    for (const value of [undefined, null, 0, 1, "true", "false", {}, []]) {
      assert.throws(() => parseParameters({ ...parameters, [key]: value }), new RegExp(key));
    }
  }
});

test("webview parameter messages require finite, bounded values and opaque colors", () => {
  assert.deepEqual(parseParameters(parameters), parameters);
  assert.throws(() => parseParameters({ ...parameters, borderStrength: NaN }), /borderStrength/);
  assert.throws(() => parseParameters({ ...parameters, overlayOpacity: 3 }), /overlayOpacity/);
  assert.throws(() => parseParameters({ ...parameters, background: "#12345600" }), /background/);
  assert.throws(() => parseParameters({ ...parameters, foreground: "red" }), /foreground/);
  for (const revision of [undefined, 0, -1, NaN, 1.5]) {
    assert.throws(() => parseClientMessage({ type: "parameters", parameters, revision }), /revision/);
  }
});

test("signed surface separation and border ranges cross the webview message boundary", () => {
  for (const surfaceSpread of [-3, -1, 0, 1, 3]) {
    for (const borderStrength of [-2, -1, 0, 1, 2]) {
      const edited = { ...parameters, surfaceSpread, borderStrength };
      assert.deepEqual(parseClientMessage({
        type: "parameters", parameters: edited, syntaxParameters, revision: 1
      }), { type: "parameters", parameters: edited, syntaxParameters, revision: 1 });
    }
  }
  for (const surfaceSpread of [-3.01, 3.01, NaN, Infinity]) {
    assert.throws(() => parseParameters({ ...parameters, surfaceSpread }), /surfaceSpread/);
  }
  for (const borderStrength of [-2.01, 2.01, Infinity]) {
    assert.throws(() => parseParameters({ ...parameters, borderStrength }), /borderStrength/);
  }
});

test("Info source is required and accepts only the three explicit modes across the draft protocol", () => {
  for (const infoSource of infoSources) {
    const edited = { ...parameters, infoSource };
    assert.deepEqual(parseParameters(edited), edited);
    assert.deepEqual(parseClientMessage({
      type: "parameters", parameters: edited, syntaxParameters, revision: 2
    }), { type: "parameters", parameters: edited, syntaxParameters, revision: 2 });
  }
  for (const infoSource of [undefined, null, "", "Accent", "warning", "__proto__", 1, {}, []]) {
    const edited = { ...parameters, infoSource };
    assert.throws(() => parseParameters(edited), /infoSource/);
    assert.throws(() => parseClientMessage({
      type: "parameters", parameters: edited, syntaxParameters, revision: 1
    }), /infoSource/);
  }
});

test("severity colors are required opaque inputs in parameter and webview validation", () => {
  for (const key of ["info", "warning", "error"] as const) {
    for (const value of [undefined, null, "#123", "#12345680", "red", 1]) {
      assert.throws(() => parseParameters({ ...parameters, [key]: value }), new RegExp(key));
    }
    const edited = { ...parameters, [key]: "#00AEFF" };
    assert.deepEqual(parseClientMessage({ type: "parameters", parameters: edited, syntaxParameters, revision: 1 }), {
      type: "parameters", parameters: edited, syntaxParameters, revision: 1
    });
  }
});

test("Added, Deleted, and Modified are required opaque inputs across the draft protocol", () => {
  for (const key of ["added", "deleted", "modified"] as const) {
    for (const value of [undefined, null, "#123", "#12345680", "red", 1]) {
      assert.throws(() => parseParameters({ ...parameters, [key]: value }), new RegExp(key));
    }
    const edited = { ...parameters, [key]: "#00AEFF" };
    assert.deepEqual(parseClientMessage({ type: "parameters", parameters: edited, syntaxParameters, revision: 1 }), {
      type: "parameters", parameters: edited, syntaxParameters, revision: 1
    });
  }
});

test("draft messages validate UI and syntax together so rapid edits cannot discard the other palette", () => {
  assert.deepEqual(parseClientMessage({ type: "resetSyntax" }), { type: "resetSyntax" });
  const message = { type: "parameters", parameters, syntaxParameters, revision: 10 };
  assert.deepEqual(parseClientMessage(message), message);
  assert.throws(() => parseClientMessage({ ...message, syntaxParameters: undefined }), /Syntax parameters/);
  assert.throws(() => parseClientMessage({ ...message, syntaxParameters: { ...syntaxParameters, red: "#12345678" } }), /red/);
  assert.throws(() => parseClientMessage({ ...message, syntaxParameters: { ...syntaxParameters, comments: "red" } }), /comments/);
  for (const key of ["chromaBoost", "lightnessShift"]) {
    assert.throws(() => parseClientMessage({ ...message, syntaxParameters: { ...syntaxParameters, [key]: NaN } }), new RegExp(key));
    assert.throws(() => parseClientMessage({ ...message, syntaxParameters: { ...syntaxParameters, [key]: undefined } }), new RegExp(key));
  }
  for (const chromaBoost of [-1, -0.5, 0, 0.5, 1]) {
    const edited = { ...syntaxParameters, chromaBoost };
    assert.deepEqual(parseClientMessage({ ...message, syntaxParameters: edited }), { ...message, syntaxParameters: edited });
  }
  const oldParameters: Record<string, unknown> = { ...syntaxParameters };
  delete oldParameters.chromaBoost;
  assert.throws(() => parseClientMessage({
    ...message, syntaxParameters: { ...oldParameters, targetChroma: 0.12, chromaEqualization: 0 }
  }), /chromaBoost/);
  assert.throws(() => parseClientMessage({ ...message, parameters: { ...parameters, accent: "red" } }), /accent/);
});

test("webview commands reject unsupported inputs rather than silently accepting them", () => {
  assert.deepEqual(parseClientMessage({ type: "ready" }), { type: "ready" });
  assert.deepEqual(parseClientMessage({ type: "livePreview", enabled: true }), { type: "livePreview", enabled: true });
  assert.throws(() => parseClientMessage(null), /object/);
  assert.throws(() => parseClientMessage({ type: "exec", command: "anything" }), /Unknown/);
  assert.throws(() => parseClientMessage({ type: "variant" }), /Unknown/);
  assert.throws(() => parseClientMessage({ type: "livePreview", enabled: "true" }), /boolean/);
  assert.throws(() => parseClientMessage({ type: "openSample", language: "shell" }), /language/);
});

test("sample messages support the native picker and only catalogued languages", () => {
  assert.deepEqual(parseClientMessage({ type: "openSample" }), { type: "openSample" });
  for (const { language } of editorSamples) {
    assert.deepEqual(parseClientMessage({ type: "openSample", language }), { type: "openSample", language });
  }
  for (const language of [null, "", 1, "../settings.json", "__proto__"]) {
    assert.throws(() => parseClientMessage({ type: "openSample", language }), /language/);
  }
});
