import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { ConfigError } from "../engine/errors.js";
import { strategies } from "../rules/index.js";
import { packageRoot } from "../version.js";

const ID_RE = /^[a-z][a-z0-9-]*$/;

export async function scaffoldRule(root: string, id: string, options: { title?: string; type?: "yaml" | "module"; force?: boolean }): Promise<string> {
  if (!ID_RE.test(id)) {
    throw new ConfigError("Rule ids use lowercase letters, numbers, and dashes, and start with a letter.");
  }
  const type = options.type ?? "yaml";
  const file = join(root, ".vibe-rescue", "rules", `${id}.${type === "yaml" ? "yaml" : "mjs"}`);
  if (existsSync(file) && !options.force) {
    throw new ConfigError(`${file} already exists. Pass --force to replace it.`);
  }
  const templateName = type === "yaml" ? "rule.yaml" : "rule.mjs";
  const template = await readFile(join(packageRoot(), "templates", templateName), "utf8");
  const title = options.title ?? humanTitle(id);
  const contents = template.replaceAll("RULE_ID", id).replaceAll("RULE_TITLE", title);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

export async function ejectRule(root: string, id: string, force: boolean): Promise<string> {
  const strategy = strategies.find((item) => item.id === id);
  if (!strategy) {
    throw new ConfigError(`Unknown built-in rule "${id}". Built-ins: ${strategies.map((item) => item.id).join(", ")}`);
  }
  const file = join(root, ".vibe-rescue", "rules", `${id}.yaml`);
  if (existsSync(file) && !force) {
    throw new ConfigError(`${file} already exists. Pass --force to replace it.`);
  }
  await mkdir(dirname(file), { recursive: true });
  const body = `# Copied from the built-in ${id} rule. Edit detect to change what counts as the problem.\n# Delete fix if you want to keep the built-in fixer. Adding a fix block replaces the built-in strategy.\n${stringify(strategy.defaults())}`;
  await writeFile(file, body);
  return file;
}

function humanTitle(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
