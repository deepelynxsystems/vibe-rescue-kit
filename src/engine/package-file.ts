import type { RuleContext } from "../types.js";

export interface PackageFile {
  raw: string | null;
  json: Record<string, unknown>;
  indent: string;
}

export async function readPackage(ctx: RuleContext): Promise<PackageFile | null> {
  const raw = await ctx.readMaybe("package.json");
  if (raw == null) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const indentMatch = raw.match(/\n([ \t]+)"/);
  return { raw, json, indent: indentMatch?.[1] ?? "  " };
}

export function depNames(json: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const block = json[field];
    if (!block || typeof block !== "object") continue;
    for (const name of Object.keys(block as Record<string, unknown>)) names.add(name);
  }
  return names;
}

export function addDependency(json: Record<string, unknown>, name: string, dev = false): boolean {
  if (depNames(json).has(name)) return false;
  const field = dev ? "devDependencies" : "dependencies";
  const block = (json[field] && typeof json[field] === "object" ? json[field] : {}) as Record<string, string>;
  block[name] = "*";
  json[field] = block;
  return true;
}

export function stringifyPackage(json: Record<string, unknown>, indent: string): string {
  const width = indent.includes("\t") ? "\t" : indent.length;
  return `${JSON.stringify(json, null, width)}\n`;
}

export async function writePackageIfChanged(ctx: RuleContext, file: PackageFile, json: Record<string, unknown>): Promise<boolean> {
  const next = stringifyPackage(json, file.indent);
  if (next === file.raw) return false;
  await ctx.write("package.json", next);
  return true;
}
