import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../engine/errors.js";
import { isGitRepo } from "../engine/git.js";
import { packageRoot } from "../version.js";

export async function installHook(root: string, force: boolean): Promise<string> {
  if (!(await isGitRepo(root))) {
    throw new ConfigError("install-hook needs a git repository. Run git init first.");
  }
  const template = await readFile(join(packageRoot(), "templates", "pre-commit.sh"), "utf8");
  const husky = existsSync(join(root, ".husky"));
  const file = husky ? join(root, ".husky", "pre-commit") : join(root, ".git", "hooks", "pre-commit");
  if (existsSync(file)) {
    const current = await readFile(file, "utf8");
    if (current.includes("vibe-rescue")) {
      return file;
    }
    if (!force) {
      const next = `${current.endsWith("\n") ? current : `${current}\n`}\n${template}`;
      await writeFile(file, next);
      await chmod(file, 0o755);
      return file;
    }
  }
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, template);
  await chmod(file, 0o755);
  return file;
}

export async function installAction(root: string, mode: "scan" | "fix", force: boolean): Promise<string> {
  const file = join(root, ".github", "workflows", "vibe-rescue.yml");
  if (existsSync(file) && !force) {
    throw new ConfigError(`${file} already exists. Pass --force to replace it.`);
  }
  const template = await readFile(join(packageRoot(), "templates", "workflow.yml"), "utf8");
  const contents = template.replaceAll("MODE_VALUE", mode);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(file, contents);
  return file;
}
