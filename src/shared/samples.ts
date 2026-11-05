export const editorSamples = [
  { language: "typescript", label: "TypeScript", file: "theme.ts", detail: "Types, enums, generics, async code, and template strings" },
  { language: "typescriptreact", label: "TSX / JSX", file: "card.tsx", detail: "Tags, attributes, JSX comments, and embedded expressions" },
  { language: "javascript", label: "JavaScript", file: "palette.js", detail: "JSDoc, regular expressions, private fields, and destructuring" },
  { language: "python", label: "Python", file: "theme.py", detail: "Decorators, annotations, docstrings, and comprehensions" },
  { language: "go", label: "Go", file: "theme.go", detail: "Packages, interfaces, receivers, and short declarations" },
  { language: "rust", label: "Rust", file: "theme.rs", detail: "Lifetimes, macros, attributes, and pattern matching" },
  { language: "java", label: "Java", file: "Theme.java", detail: "Records, annotations, streams, and method references" },
  { language: "csharp", label: "C#", file: "Theme.cs", detail: "Records, nullable types, attributes, and LINQ" },
  { language: "c", label: "C", file: "theme.c", detail: "Macros, typedefs, pointers, and format strings" },
  { language: "cpp", label: "C++", file: "theme.cpp", detail: "Templates, namespaces, structured bindings, and lambdas" },
  { language: "ruby", label: "Ruby", file: "theme.rb", detail: "Symbols, blocks, regular expressions, and interpolation" },
  { language: "php", label: "PHP", file: "theme.php", detail: "Enums, promoted properties, variables, and named arguments" },
  { language: "sql", label: "SQL", file: "themes.sql", detail: "Queries, common table expressions, functions, and literals" },
  { language: "html", label: "HTML", file: "index.html", detail: "Tags, attributes, entities, and embedded JavaScript" },
  { language: "css", label: "CSS", file: "theme.css", detail: "Selectors, custom properties, units, functions, and at-rules" },
  { language: "scss", label: "SCSS", file: "theme.scss", detail: "Variables, mixins, interpolation, and nested selectors" },
  { language: "json", label: "JSON", file: "theme.json", detail: "Property names, strings, numbers, booleans, and null" },
  { language: "jsonc", label: "JSON with Comments", file: "theme.jsonc", detail: "Configuration colors, comments, and trailing commas" },
  { language: "yaml", label: "YAML", file: "theme.yaml", detail: "Keys, anchors, aliases, and block strings" },
  { language: "xml", label: "XML", file: "theme.xml", detail: "Namespaces, attributes, entities, and CDATA" },
  { language: "markdown", label: "Markdown", file: "guide.md", detail: "Headings, emphasis, links, tables, and fenced code" },
  { language: "shellscript", label: "Bash", file: "preview.sh", detail: "Parameters, expansions, arrays, patterns, and shell commands" },
  { language: "powershell", label: "PowerShell", file: "preview.ps1", detail: "Attributes, types, variables, pipelines, and here-strings" },
  { language: "dockerfile", label: "Dockerfile", file: "Dockerfile", detail: "Instructions, stage names, variables, flags, and JSON arguments" }
] as const;

export type SampleLanguage = (typeof editorSamples)[number]["language"];

export function isSampleLanguage(value: unknown): value is SampleLanguage {
  return editorSamples.some((sample) => sample.language === value);
}
