import { readdirSync, readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { createJiti } from "jiti";
import type { Rule, RuleDefinition } from "../types.js";
import { packageRoot } from "../version.js";
import { strategies, type Strategy } from "../rules/index.js";
import { compileDeclarative } from "../rules/declarative.js";
import { ConfigError } from "./errors.js";

export interface ProjectSettings {
  disable: string[];
  ignore: string[];
}

export { ConfigError };

interface ProjectRule {
  id: string;
  path: string;
  kind: "yaml" | "module";
  def: RuleDefinition;
  rule?: Rule;
}

export async function loadProjectSettings(root: string): Promise<ProjectSettings> {
  const path = join(root, ".vibe-rescue", "config.yaml");
  if (!existsSync(path)) return { disable: [], ignore: [] };
  const doc = readYamlMapping(path);
  return {
    disable: stringList(doc.disable, `${path} disable`),
    ignore: stringList(doc.ignore, `${path} ignore`),
  };
}

export async function loadRules(root: string, settings: ProjectSettings): Promise<Rule[]> {
  const disabled = new Set(settings.disable);
  const shipped = loadShippedDefinitions();
  const project = await loadProjectRuleFiles(root);
  const builtinIds = new Set(strategies.map((strategy) => strategy.id));
  const rules: Rule[] = [];

  for (const strategy of strategies) {
    if (disabled.has(strategy.id)) continue;
    const override = project.get(strategy.id);
    if (override?.kind === "module" && override.rule) {
      rules.push(override.rule);
      continue;
    }
    if (override?.kind === "yaml" && override.def.fix) {
      rules.push(compileDeclarative(override.def, override.path));
      continue;
    }
    const base = mergeDef(strategy.defaults(), shipped.get(strategy.id));
    const merged = override?.kind === "yaml" ? mergeDef(base, override.def) : base;
    rules.push(strategy.create(merged));
  }

  for (const [id, file] of project) {
    if (builtinIds.has(id) || disabled.has(id)) continue;
    if (file.kind === "module" && file.rule) rules.push(file.rule);
    else rules.push(compileDeclarative(file.def, file.path));
  }

  return rules;
}

export function knownRuleIds(): string[] {
  return strategies.map((strategy) => strategy.id);
}

function loadShippedDefinitions(): Map<string, RuleDefinition> {
  const dir = join(packageRoot(), "rules");
  const defs = new Map<string, RuleDefinition>();
  if (!existsSync(dir)) return defs;
  for (const name of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const def = readYamlDefinition(join(dir, name));
    defs.set(def.id, def);
  }
  return defs;
}

async function loadProjectRuleFiles(root: string): Promise<Map<string, ProjectRule>> {
  const dir = join(root, ".vibe-rescue", "rules");
  const found = new Map<string, ProjectRule>();
  if (!existsSync(dir)) return found;
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(yaml|yml|mjs|js|cjs|ts|mts)$/.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();

  for (const path of files) {
    const loaded = /\.ya?ml$/.test(path) ? loadYamlProjectRule(path) : await loadModuleRule(path);
    const previous = found.get(loaded.id);
    if (previous) {
      throw new ConfigError(`Two project rules use id "${loaded.id}": ${previous.path} and ${path}`);
    }
    found.set(loaded.id, loaded);
  }
  return found;
}

function loadYamlProjectRule(path: string): ProjectRule {
  const def = readYamlDefinition(path);
  return { id: def.id, path, kind: "yaml", def };
}

async function loadModuleRule(path: string): Promise<ProjectRule> {
  const jiti = createJiti(import.meta.url);
  let loaded: unknown;
  try {
    loaded = await jiti.import(path, { default: true });
  } catch (error) {
    throw new ConfigError(`Could not load rule module ${path}: ${(error as Error).message}`);
  }
  const rule = asRule(loaded);
  if (!rule) {
    throw new ConfigError(`${path} must default-export a rule with id, detect, fix, and verify.`);
  }
  return {
    id: rule.id,
    path,
    kind: "module",
    def: { id: rule.id, title: rule.title, description: rule.description, severity: rule.severity },
    rule,
  };
}

function readYamlDefinition(path: string): RuleDefinition {
  const doc = readYamlMapping(path);
  if (typeof doc.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(doc.id)) {
    throw new ConfigError(`${path} needs an id of lowercase letters, numbers, and dashes.`);
  }
  if (typeof doc.title !== "string" || typeof doc.description !== "string") {
    throw new ConfigError(`${path} needs a title and a description.`);
  }
  if (doc.severity !== undefined && doc.severity !== "error" && doc.severity !== "warning") {
    throw new ConfigError(`${path} severity must be "error" or "warning".`);
  }
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    severity: doc.severity as RuleDefinition["severity"],
    scopeNote: typeof doc.scopeNote === "string" ? doc.scopeNote : undefined,
    strategy: typeof doc.strategy === "string" ? doc.strategy : undefined,
    detect: isRecord(doc.detect) ? doc.detect : undefined,
    fix: isRecord(doc.fix) ? doc.fix : undefined,
    verify: isRecord(doc.verify) ? doc.verify : undefined,
    watchGlobs: Array.isArray(doc.watchGlobs) ? doc.watchGlobs.map(String) : undefined,
  };
}

function readYamlMapping(path: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`Could not parse ${path}: ${(error as Error).message}`);
  }
  if (!isRecord(raw)) throw new ConfigError(`${path} must be a YAML mapping.`);
  return raw;
}

function asRule(value: unknown): Rule | null {
  if (!isRecord(value)) return null;
  const detect = value.detect;
  const fix = value.fix;
  const verify = value.verify;
  if (typeof value.id !== "string") return null;
  if (typeof detect !== "function" || typeof fix !== "function" || typeof verify !== "function") return null;
  const severity = value.severity === "warning" ? "warning" : "error";
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : value.id,
    description: typeof value.description === "string" ? value.description : value.id,
    severity,
    scopeNote: typeof value.scopeNote === "string" ? value.scopeNote : undefined,
    watchGlobs: Array.isArray(value.watchGlobs) ? value.watchGlobs.map(String) : undefined,
    detect: detect as Rule["detect"],
    fix: fix as Rule["fix"],
    verify: verify as Rule["verify"],
  };
}

export function mergeDef(base: RuleDefinition, over?: RuleDefinition): RuleDefinition {
  if (!over) return base;
  return {
    ...base,
    title: over.title || base.title,
    description: over.description || base.description,
    severity: over.severity ?? base.severity,
    scopeNote: over.scopeNote ?? base.scopeNote,
    strategy: over.strategy ?? base.strategy,
    detect: mergeRecords(base.detect ?? {}, over.detect ?? {}),
    fix: over.fix ?? base.fix,
    verify: over.verify ?? base.verify,
    watchGlobs: over.watchGlobs ?? base.watchGlobs,
  };
}

function mergeRecords(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    if (isRecord(value) && isRecord(current)) out[key] = mergeRecords(current, value);
    else out[key] = value;
  }
  return out;
}

function stringList(value: unknown, label: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ConfigError(`${label} must be a list of strings.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type { Strategy };
