import rawReference from "../../fixtures/vscode-1.143.0/dark-2026.json";
import rawLightReference from "../../fixtures/vscode-1.143.1/light-2026.json";
import { parseReferenceTheme } from "./validation";
import type { ReferenceTheme, ThemeMode } from "./types";

export const reference = parseReferenceTheme(rawReference);
export const lightReference = parseReferenceTheme(rawLightReference);
export const references: Record<ThemeMode, ReferenceTheme> = { dark: reference, light: lightReference };
