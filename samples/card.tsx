// Local JSX types let the editor check this sample without a UI framework.
declare global {
  namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      article: { className?: string; "data-accent"?: string; children?: unknown };
      h2: { children?: unknown };
      p: { className?: string; children?: unknown };
      button: { type: "button"; disabled?: boolean; onClick?: () => void; children?: unknown };
    }
  }
}

export interface ThemeCardProps {
  readonly name: string;
  readonly accent: string;
  enabled?: boolean;
  onPreview: (accent: string) => void;
}

export function ThemeCard({
  name,
  accent,
  enabled = true,
  onPreview
}: ThemeCardProps): JSX.Element {
  const status = enabled ? "Ready to preview" : "Preview paused";

  return (
    <article className="theme-card" data-accent={accent}>
      {/* Compare tag names, attributes, strings, and embedded expressions. */}
      <h2>{name}</h2>
      <p className="theme-status">{status}: {accent.toUpperCase()}</p>
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onPreview(accent)}
      >
        Preview theme
      </button>
    </article>
  );
}
