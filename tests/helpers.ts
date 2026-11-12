import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { run } from "../src/engine/runner.js";
import type { RunReport } from "../src/types.js";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function withFixture(name: string, fn: (dir: string) => Promise<void>): Promise<void> {
  const source = name.startsWith("examples/") || name.startsWith("fixtures/") ? join(repoRoot, name) : join(repoRoot, "fixtures", name);
  const dir = await mkdtemp(join(tmpdir(), "vibe-rescue-"));
  await cp(source, dir, { recursive: true });
  try {
    await fn(dir);
  } finally {
    await removeTemp(dir);
  }
}

export async function withTemp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "vibe-rescue-"));
  try {
    await fn(dir);
  } finally {
    await removeTemp(dir);
  }
}

async function removeTemp(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export function rule(report: RunReport, id: string) {
  return report.results.find((result) => result.ruleId === id);
}

export async function text(dir: string, file: string): Promise<string> {
  return readFile(join(dir, file), "utf8");
}

export async function fixProject(dir: string): Promise<RunReport> {
  return run({ root: dir, mode: "fix" });
}

export function cli(args: string[], cwd = repoRoot): { status: number | null; stdout: string; stderr: string } {
  const tsx = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(process.execPath, [tsx, join(repoRoot, "src", "cli.ts"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
