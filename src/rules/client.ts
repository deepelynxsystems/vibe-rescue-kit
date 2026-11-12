import { extname } from "node:path";

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);

export const DEFAULT_CLIENT_ROOTS = ["src", "app", "pages", "components", "public"];

export function isServerPath(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  if (/(^|\/)api\//.test(norm)) return true;
  if (/(^|\/)server\//.test(norm)) return true;
  if (/\.server\.(ts|tsx|js|jsx|mjs|cjs)$/.test(norm)) return true;
  if (/(^|\/)middleware\.(ts|tsx|js|jsx|mjs|cjs)$/.test(norm)) return true;
  if (norm.startsWith("supabase/functions/")) return true;
  return false;
}

export function isClientSource(rel: string, roots: string[]): boolean {
  const norm = rel.replace(/\\/g, "/");
  if (!CODE_EXT.has(extname(norm).toLowerCase())) return false;
  if (isServerPath(norm)) return false;
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(norm)) return false;
  return roots.some((root) => {
    const cleaned = root.replace(/\/$/, "");
    return norm === cleaned || norm.startsWith(`${cleaned}/`);
  });
}

export function isTypeScript(rel: string): boolean {
  return /\.(ts|tsx)$/.test(rel);
}

/** Next.js App Router file that is not a client module. */
export function isNextServerModule(file: string, source: string): boolean {
  const norm = file.replace(/\\/g, "/");
  if (!/^(?:src\/)?app\//.test(norm)) return false;
  if (/\/route\.(tsx?|jsx?|mjs|cjs)$/.test(norm)) return true;
  if (hasDirective(source, "use server")) return true;
  return !hasDirective(source, "use client");
}

function hasDirective(source: string, directive: string): boolean {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < source.length) {
    const c = source[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      i += 1;
      continue;
    }
    if (source.startsWith("//", i)) {
      const next = source.indexOf("\n", i);
      i = next === -1 ? source.length : next + 1;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const next = source.indexOf("*/", i + 2);
      i = next === -1 ? source.length : next + 2;
      continue;
    }
    break;
  }
  return new RegExp(`^['"]${directive}['"]`).test(source.slice(i));
}
