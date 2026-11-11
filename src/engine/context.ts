import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";
import type { RuleContext } from "../types.js";
import { Snapshot } from "./snapshot.js";
import { matchGlobs, walk } from "./walk.js";

export function resolveInside(root: string, rel: string): string {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleaned.includes("\0") || cleaned.split("/").includes("..")) {
    throw new Error(`Refusing to touch a path outside the project: ${rel}`);
  }
  const abs = normalize(join(root, cleaned));
  const rootNorm = normalize(root);
  if (abs !== rootNorm && !abs.startsWith(rootNorm + sep)) {
    throw new Error(`Refusing to touch a path outside the project: ${rel}`);
  }
  return abs;
}

export function createContext(options: {
  root: string;
  ignore: string[];
  phase: "detect" | "fix";
  snapshot?: Snapshot;
}): RuleContext {
  let cache: string[] | null = null;
  let dirty = true;

  const readAbs = async (rel: string): Promise<string | null> => {
    try {
      return await readFile(resolveInside(options.root, rel), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  return {
    root: options.root,
    ignore: options.ignore,
    phase: options.phase,
    async read(file: string) {
      const text = await readAbs(file);
      if (text == null) throw new Error(`File not found: ${file}`);
      return text;
    },
    readMaybe: readAbs,
    async exists(file: string) {
      return (await readAbs(file)) != null;
    },
    async write(file: string, content: string) {
      if (options.phase !== "fix") {
        throw new Error(`Rule tried to write ${file} during detect. Writes belong in fix().`);
      }
      const abs = resolveInside(options.root, file);
      if (options.snapshot) await options.snapshot.record(abs);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
      dirty = true;
    },
    async glob(patterns: string[]) {
      if (!cache || dirty) {
        cache = await walk(options.root, options.ignore);
        dirty = false;
      }
      return matchGlobs(cache, patterns);
    },
  };
}

export function toPosix(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}
