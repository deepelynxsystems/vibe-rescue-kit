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
