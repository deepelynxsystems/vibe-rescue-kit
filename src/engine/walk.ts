import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import picomatch from "picomatch";

export const DEFAULT_IGNORES = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  ".next/**",
  "coverage/**",
  "out/**",
  ".turbo/**",
  ".cache/**",
  ".vibe-rescue/**",
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "out",
  ".turbo",
  ".cache",
]);

export async function walk(root: string, ignoreGlobs: string[]): Promise<string[]> {
  const matchers = ignoreGlobs.map((pattern) => picomatch(pattern, { dot: true }));
  const files: string[] = [];

  const ignored = (rel: string): boolean => matchers.some((match) => match(rel) || match(`${rel}/**`));

  async function rec(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || SKIP_DIR_NAMES.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        if (rel === ".vibe-rescue" || ignored(rel)) continue;
        await rec(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (ignored(rel)) continue;
      files.push(rel);
    }
  }

  await rec(root);
  files.sort();
  return files;
}

export function matchGlobs(files: string[], patterns: string[]): string[] {
  if (patterns.length === 0) return [];
  const matchers = patterns.map((pattern) => picomatch(pattern, { dot: true }));
  return files.filter((file) => matchers.some((match) => match(file)));
}
