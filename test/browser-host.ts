import { evaluatePalette, fitModel } from "../src/model/index";
import { reference, references } from "../src/shared/reference";
import { AppState, ClientMessage, HostMessage, SyntaxParameters, ThemeDraft, ThemeMode, ThemeParameters } from "../src/shared/types";
import { fitSyntaxModel, getDefaultSyntaxParameters } from "../src/syntax";
import { generateTheme } from "../src/theme";

declare global {
  interface Window {
    acquireVsCodeApi(): {
      postMessage(message: ClientMessage): void;
      getState(): unknown;
      setState(state: unknown): void;
    };
    themerHarness: {
      messages: ClientMessage[];
      state(): AppState;
      send(state: AppState): void;
    };
  }
}

const fits = { dark: fitModel(reference), light: fitModel(references.light) };
const syntaxFits = { dark: fitSyntaxModel(reference), light: fitSyntaxModel(references.light) };
const drafts = new Map<ThemeMode, ThemeDraft>();
let parameters: ThemeParameters = { ...fits.dark.parameters };
let syntaxParameters: SyntaxParameters = getDefaultSyntaxParameters(reference);
let revision = 0;
let livePreview = false;
let savedState: unknown;
const messages: ClientMessage[] = [];

function state(): AppState {
  const reference = references[parameters.mode];
  const fit = fits[parameters.mode];
  const syntaxFit = syntaxFits[parameters.mode];
  const { palette, syntax } = generateTheme(reference, parameters, syntaxParameters, syntaxFit);
  return {
    revision,
    drafts: {
      ...Object.fromEntries(drafts),
      [parameters.mode]: { parameters: structuredClone(parameters), syntaxParameters: structuredClone(syntaxParameters) }
    },
    baseline: {
      name: reference.theme.name,
      version: reference.vscode.version,
      explicitColorCount: Object.keys(reference.colors).length,
      limitation: "Explicit source colors only. Browser harness; no native workbench or persistent settings."
    },
    parameters: { ...parameters },
    syntax,
    palette,
    evaluation: evaluatePalette(reference, palette),
    model: { controlCount: fit.controlCount, fixedRuleCount: fit.fixedRuleCount, exceptionCount: palette.coverage.preserved },
    livePreview,
    workspaceAvailable: true,
    recoveryPending: false,
    busy: false,
    status: "Browser harness only. No VS Code settings are changed."
  };
}

function send(value: AppState): void {
  const message: HostMessage = { type: "state", state: value };
  window.dispatchEvent(new MessageEvent("message", { data: message }));
}

window.themerHarness = { messages, state, send };
window.acquireVsCodeApi = () => ({
  getState: () => savedState,
  setState: (value) => { savedState = value; },
  postMessage: (message) => {
    messages.push(structuredClone(message));
    switch (message.type) {
      case "parameters":
        drafts.set(parameters.mode, { parameters: structuredClone(parameters), syntaxParameters: structuredClone(syntaxParameters) });
        parameters = message.parameters;
        syntaxParameters = message.syntaxParameters;
        revision = message.revision;
        break;
      case "reset":
        parameters = { ...fits[parameters.mode].parameters };
        syntaxParameters = getDefaultSyntaxParameters(references[parameters.mode]);
        break;
      case "resetSyntax":
        syntaxParameters = getDefaultSyntaxParameters(references[parameters.mode]);
        break;
      case "livePreview":
        livePreview = message.enabled;
        break;
      case "cancel":
      case "apply":
      case "applyWorkspace":
        livePreview = false;
        break;
    }
    setTimeout(() => send(state()), 0);
  }
});
