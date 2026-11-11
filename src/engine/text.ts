export interface CodeSpan {
  start: number;
  end: number;
  text: string;
}

/** Comment-free, string-free slices of source, with original indexes. */
export function codeSpans(source: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  let start = 0;
  let i = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";

  const flush = (end: number) => {
    if (end > start) spans.push({ start, end, text: source.slice(start, end) });
  };

  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") {
        flush(i);
        mode = "line";
        i += 2;
        continue;
      }
      if (c === "/" && n === "*") {
        flush(i);
        mode = "block";
        i += 2;
        continue;
      }
      if (c === "'") {
        flush(i);
        mode = "sq";
        i += 1;
        continue;
      }
      if (c === '"') {
        flush(i);
        mode = "dq";
        i += 1;
        continue;
      }
      if (c === "`") {
        flush(i);
        mode = "tpl";
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        start = i;
      }
      i += 1;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") {
        mode = "code";
        i += 2;
        start = i;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
      mode = "code";
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }
  if (mode === "code") flush(source.length);
  return spans;
}

export interface StringLiteral {
  /** Index of the opening quote. */
  start: number;
  /** Index just after the closing quote. */
  end: number;
  quote: "'" | '"' | "`";
  raw: string;
  value: string;
  hasExpr: boolean;
}

export function stringLiterals(source: string): StringLiteral[] {
  const out: StringLiteral[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c !== "'" && c !== '"' && c !== "`") {
      if (c === "/" && source[i + 1] === "/") {
        i = source.indexOf("\n", i);
        if (i === -1) break;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      i += 1;
      continue;
    }
    const quote = c;
    let j = i + 1;
    let raw = "";
    let hasExpr = false;
    let closed = false;
    while (j < source.length) {
      if (quote === "`" && source[j] === "$" && source[j + 1] === "{") hasExpr = true;
      if (source[j] === "\\") {
        raw += source[j] + (source[j + 1] ?? "");
        j += 2;
        continue;
      }
      if (source[j] === quote) {
        closed = true;
        break;
      }
      raw += source[j];
      j += 1;
    }
    if (!closed) break;
    out.push({
      start: i,
      end: j + 1,
      quote,
      raw,
      value: quote === "`" ? raw : unescapeSimple(raw),
      hasExpr,
    });
    i = j + 1;
  }
  return out;
}

function unescapeSimple(raw: string): string {
  return raw.replace(/\\(.)/g, (_, ch: string) => {
    if (ch === "n") return "\n";
    if (ch === "t") return "\t";
    if (ch === "r") return "\r";
    return ch;
  });
}

export function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

export function usesSemicolons(source: string): boolean {
  const imports = source.split("\n").filter((line) => /^\s*import\s/.test(line));
  if (imports.length === 0) return true;
  const withSemi = imports.filter((line) => line.trimEnd().endsWith(";")).length;
  return withSemi >= imports.length / 2;
}

export function insertImport(source: string, statement: string): string {
  if (source.includes(statement)) return source;
  const lines = source.split("\n");
  let last = -1;
  let inImport = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!inImport && trimmed.startsWith("import ")) inImport = true;
    if (!inImport) continue;
    last = i;
    const done =
      /from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed) ||
      /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed) ||
      (trimmed.endsWith(";") && trimmed.includes("from"));
    if (done) inImport = false;
  }
  if (last === -1) return `${statement}\n${source}`;
  lines.splice(last + 1, 0, statement);
  return lines.join("\n");
}

export interface SpecifierHit {
  spec: string;
  specIndex: number;
}

/** Import / export / require specifiers. Indexes point at the specifier text, not the quotes. */
export function extractSpecifiers(source: string): SpecifierHit[] {
  const hits: SpecifierHit[] = [];
  const patterns = [
    /\bimport\s*(?:type\s+)?[\s\S]*?\sfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*(['"])([^'"]+)\1/g,
    /\bexport\s+(?:type\s+)?\{[^}]*\}\s*from\s*(['"])([^'"]+)\1/g,
    /\bexport\s+\*\s*(?:as\s+\w+\s+)?from\s*(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
  ];
  const seen = new Set<number>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const spec = match[2];
      if (!spec) continue;
      const specIndex = match.index + match[0].lastIndexOf(spec);
      if (seen.has(specIndex)) continue;
      seen.add(specIndex);
      hits.push({ spec, specIndex });
    }
  }
  hits.sort((a, b) => a.specIndex - b.specIndex);
  return hits;
}

export function relativeImport(fromFile: string, targetFile: string): string {
  const fromDir = posixDir(fromFile);
  const target = targetFile.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, "");
  const fromParts = fromDir === "" ? [] : fromDir.split("/");
  const toParts = target.split("/");
  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  const rel = [...fromParts.map(() => ".."), ...toParts].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function posixDir(file: string): string {
  const i = file.lastIndexOf("/");
  return i === -1 ? "" : file.slice(0, i);
}
