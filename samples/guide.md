# Themer Lab syntax sample

Compare **bold**, *italic*, ~~removed text~~, and `inlineCode`.
This is sample content, not a saved theme recipe.

## Separate palettes

- UI colors control surfaces, borders, and buttons.
- Syntax colors control the text inside a code editor.
- Both need readable contrast against the editor background.

> A language extension can add semantic highlighting on top of grammar colors.
> Check the final color in the real editor.

| Role | Example | Notes |
| --- | --- | --- |
| String | `"Themer Lab"` | Includes escapes and interpolation |
| Number | `4.5` | Also compare booleans and constants |
| Function | `render()` | Includes methods and calls |

```typescript
interface Theme { name: string; accent: string }

export function describe(theme: Theme): string {
  return `${theme.name}: ${theme.accent}`;
}
```

```json
{ "name": "Themer Lab", "enabled": true, "contrast": 4.5, "override": null }
```

### Files and links

Open the [TypeScript sample](theme.ts) or the [HTML sample](index.html).
Compare ordinary links with <https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide>.

1. Inspect a token.
2. Compare its foreground with nearby roles.
3. Check that comments are readable.

---

<details>
<summary>Embedded HTML</summary>

The grammar must handle <strong>markup inside Markdown</strong> too.

</details>
