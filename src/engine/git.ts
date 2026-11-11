import { spawn } from "node:child_process";
import ignore from "ignore";

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runGit(root: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function isGitRepo(root: string): Promise<boolean> {
  const result = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  return result.code === 0 && result.stdout.trim() === "true";
}

export async function stagedFiles(root: string): Promise<Set<string>> {
  const inside = await isGitRepo(root);
  if (!inside) {
    throw new Error("--staged needs a git repository. Run this from a project that has .git, or drop the flag.");
  }
  const result = await runGit(root, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git diff --cached failed.");
  }
  return new Set(result.stdout.split("\0").filter(Boolean).map((file) => file.replace(/\\/g, "/")));
}

export function gitignoreMatcher(content: string | null): { ignores(path: string): boolean } {
  const ig = ignore();
  if (content && content.trim()) ig.add(content);
  return ig;
}

export async function gitAdd(root: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  const check = await runGit(root, ["check-ignore", "-z", "--", ...files]);
  const ignored = new Set(check.stdout.split("\0").filter(Boolean));
  const toAdd = files.filter((file) => !ignored.has(file));
  if (toAdd.length === 0) return;
  const added = await runGit(root, ["add", "--", ...toAdd]);
  if (added.code !== 0) {
    throw new Error(added.stderr.trim() || "git add failed.");
  }
}
