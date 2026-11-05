import { AppState, SyntaxAutoMode, SyntaxPaletteMode, SyntaxParameters, ThemeMode, ThemeParameters, ThemeSettingsTarget } from "../shared/types";

export interface ThemerTestApi {
  ready(): boolean;
  setMode(mode: ThemeMode): Promise<void>;
  setParameters(parameters: ThemeParameters): Promise<void>;
  setSyntaxParameters(parameters: SyntaxParameters): Promise<void>;
  setSyntaxAuto(mode: SyntaxAutoMode, enabled: boolean): Promise<void>;
  setSyntaxPaletteMode(mode: SyntaxPaletteMode): Promise<void>;
  resetSyntaxGroup(mode: SyntaxAutoMode): Promise<void>;
  resetSyntax(): Promise<void>;
  startPreview(): Promise<void>;
  restorePreview(): Promise<void>;
  applyTheme(target?: ThemeSettingsTarget): Promise<void>;
}

export interface ThemerApi {
  getState(): AppState;
  testing?: ThemerTestApi;
}
