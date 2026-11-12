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
  let i = 0;
  while (i < source.length) {
    if (isSpace(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "/") {
      const next = source.indexOf("\n", i);
      i = next === -1 ? source.length : next + 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      const next = source.indexOf("*/", i + 2);
      i = next === -1 ? source.length : next + 2;
      continue;
    }
    if (source[i] === "'" || source[i] === '"' || source[i] === "`") {
      i = skipString(source, i);
      continue;
    }
    if (keywordAt(source, i, "import")) {
      const parsed = parseImport(source, i + "import".length);
      if (parsed) hits.push(...parsed.hits);
      i = parsed ? parsed.end : i + "import".length;
      continue;
    }
    if (keywordAt(source, i, "export")) {
      const parsed = parseExport(source, i + "export".length);
      if (parsed?.hit) hits.push(parsed.hit);
      i = parsed ? parsed.end : i + "export".length;
      continue;
    }
    if (keywordAt(source, i, "require")) {
      const parsed = parseRequire(source, i + "require".length);
      if (parsed?.hit) hits.push(parsed.hit);
      i = parsed ? parsed.end : i + "require".length;
      continue;
    }
    i += 1;
  }
  return hits;
}

function parseImport(source: string, start: number): { hits: SpecifierHit[]; end: number } | null {
  const i = skipSpaceAndComments(source, start);
  if (source[i] === ".") return null;
  if (source[i] === "(") {
    const spec = readSpecifier(source, i + 1);
    return spec ? { hits: [spec], end: spec.end } : null;
  }
  if (source[i] === "'" || source[i] === '"') {
    const spec = readSpecifier(source, i);
    return spec ? { hits: [spec], end: spec.end } : null;
  }
  const found = findFromSpecifier(source, i);
  return { hits: found.hit ? [found.hit] : [], end: found.end };
}

function parseExport(source: string, start: number): { hit?: SpecifierHit; end: number } | null {
  let i = skipSpaceAndComments(source, start);
  if (keywordAt(source, i, "default")) return { end: i + "default".length };
  if (keywordAt(source, i, "type")) {
    const after = skipSpaceAndComments(source, i + "type".length);
    if (source[after] !== "{" && source[after] !== "*") return { end: after };
    i = after;
  }
  if (source[i] === "*") {
    const found = findFromSpecifier(source, i + 1);
    return { hit: found.hit, end: found.end };
  }
  if (source[i] === "{") {
    const found = findFromSpecifier(source, i);
    return { hit: found.hit, end: found.end };
  }
  return { end: i };
}

function parseRequire(source: string, start: number): { hit?: SpecifierHit; end: number } | null {
  const i = skipSpaceAndComments(source, start);
  if (source[i] !== "(") return null;
  const spec = readSpecifier(source, i + 1);
  return spec ? { hit: spec, end: spec.end } : null;
}

function findFromSpecifier(source: string, start: number): { hit?: SpecifierHit; end: number } {
  let i = start;
  let depth = 0;
  while (i < source.length) {
    i = skipSpaceAndComments(source, i);
    if (i >= source.length) break;
    const c = source[i];
    if (c === "'" || c === '"' || c === "`") {
      i = skipString(source, i);
      continue;
    }
    if (c === ";" && depth === 0) return { end: i + 1 };
    if (c === "{" || c === "[" || c === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      depth = Math.max(0, depth - 1);
      i += 1;
      if (depth === 0) {
        const look = skipSpaceAndComments(source, i);
        if (!keywordAt(source, look, "from")) return { end: i };
      }
      continue;
    }
    if (depth === 0 && keywordAt(source, i, "from")) {
      const spec = readSpecifier(source, i + "from".length);
      return spec ? { hit: spec, end: spec.end } : { end: i + "from".length };
    }
    i += 1;
  }
  return { end: source.length };
}

function readSpecifier(source: string, start: number): (SpecifierHit & { end: number }) | null {
  const i = skipSpaceAndComments(source, start);
  const quote = source[i];
  if (quote !== "'" && quote !== '"') return null;
  let j = i + 1;
  while (j < source.length) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    if (source[j] === quote) {
      return { spec: source.slice(i + 1, j), specIndex: i + 1, end: j + 1 };
    }
    j += 1;
  }
  return null;
}

function skipSpaceAndComments(source: string, i: number): number {
  while (i < source.length) {
    if (isSpace(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "/") {
      const next = source.indexOf("\n", i);
      i = next === -1 ? source.length : next + 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      const next = source.indexOf("*/", i + 2);
      i = next === -1 ? source.length : next + 2;
      continue;
    }
    break;
  }
  return i;
}

function skipString(source: string, i: number): number {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
      j += 2;
      let depth = 1;
      while (j < source.length && depth > 0) {
        if (source[j] === "{") depth += 1;
        else if (source[j] === "}") depth -= 1;
        j += 1;
      }
      continue;
    }
    if (source[j] === quote) return j + 1;
    j += 1;
  }
  return source.length;
}

function keywordAt(source: string, i: number, word: string): boolean {
  if (!source.startsWith(word, i)) return false;
  const before = i === 0 ? "" : source[i - 1];
  const after = source[i + word.length] ?? "";
  if (before && /[A-Za-z0-9_$.]/.test(before)) return false;
  if (after && /[A-Za-z0-9_$]/.test(after)) return false;
  return true;
}

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
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
