import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Change, RunOptions, RunReport, RuleRun } from "../types.js";
import { pkg } from "../version.js";
import { createContext } from "./context.js";
import { gitAdd, stagedFiles } from "./git.js";
import { gitignoreMatcher } from "./git.js";
import { ConfigError, loadProjectSettings, loadRules } from "./load-rules.js";
import { Snapshot } from "./snapshot.js";
import { DEFAULT_IGNORES } from "./walk.js";

const BACKUP_LINE = ".vibe-rescue/backups/";

export async function run(options: RunOptions): Promise<RunReport> {
  const root = options.root;
  const settings = await loadProjectSettings(root);
  const rules = await loadRules(root, settings);
  const selected = options.ruleId ? rules.filter((rule) => rule.id === options.ruleId) : rules;
  if (options.ruleId && selected.length === 0) {
    const known = rules.map((rule) => rule.id).join(", ");
    throw new ConfigError(`Unknown rule "${options.ruleId}". Known rules: ${known || "(none)"}`);
  }
  const ignore = [...DEFAULT_IGNORES, ...settings.ignore];
  const staged = options.staged ? await stagedFiles(root) : null;
  const results: RuleRun[] = [];
  const backupFiles = new Set<string>();
  let backupDir: string | undefined;
  const keptChanges: Change[] = [];

  for (const rule of selected) {
    const detectCtx = createContext({ root, ignore, phase: "detect" });
    let findings;
    try {
      findings = await rule.detect(detectCtx);
    } catch (error) {
      results.push({
        ruleId: rule.id,
        title: rule.title,
        action: "error",
        findings: [],
        changes: [],
        notes: [],
        error: (error as Error).message,
      });
      continue;
    }
    if (staged) {
      findings = findings.filter((finding) => !finding.file || staged.has(finding.file));
    }
    const fixable = findings.filter((finding) => finding.fixable !== false);
    if (options.mode === "scan" || findings.length === 0) {
      results.push({
        ruleId: rule.id,
        title: rule.title,
        action: findings.length === 0 ? "clean" : "detected",
        findings,
        changes: [],
        notes: [],
      });
      continue;
    }
    if (fixable.length === 0) {
      results.push({
        ruleId: rule.id,
        title: rule.title,
        action: "detected",
        findings,
        changes: [],
        notes: [],
      });
      continue;
    }

    const snapshot = new Snapshot(root);
    const fixCtx = createContext({ root, ignore, phase: "fix", snapshot });
    try {
      const outcome = await rule.fix(fixCtx, fixable);
      const verify = await rule.verify(fixCtx, fixable);
      const changes = snapshot.diff();
      if (!verify.ok) {
        await snapshot.rollback();
        results.push({
          ruleId: rule.id,
          title: rule.title,
          action: "rolled-back",
          findings,
          changes: [],
          notes: outcome.notes ?? [],
          verify,
        });
        continue;
      }
      if (options.dryRun) {
        await snapshot.rollback();
        results.push({
          ruleId: rule.id,
          title: rule.title,
          action: "dry-run",
          findings,
          changes,
          notes: outcome.notes ?? [],
          verify,
        });
        continue;
      }
      if (!backupDir) backupDir = join(root, ".vibe-rescue", "backups", stamp());
      await snapshot.persistOriginals(backupDir, backupFiles);
      keptChanges.push(...changes);
      results.push({
        ruleId: rule.id,
        title: rule.title,
        action: "applied",
        findings,
        changes,
        notes: outcome.notes ?? [],
        verify,
      });
    } catch (error) {
      await snapshot.rollback();
      results.push({
        ruleId: rule.id,
        title: rule.title,
        action: "rolled-back",
        findings,
        changes: [],
        notes: [],
        error: (error as Error).message,
        verify: { ok: false, message: (error as Error).message },
      });
    }
  }

  const notes: string[] = [];
  if (backupDir && keptChanges.length > 0) {
    await mkdir(backupDir, { recursive: true });
    const manifest = {
      tool: "vibe-rescue-kit",
      createdAt: new Date().toISOString(),
      files: [...backupFiles].map((file) => ({ file, backup: file })),
      created: keptChanges.filter((change) => change.description === "created").map((change) => change.file),
    };
    await writeFile(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await ensureBackupGitignore(root);
    const relBackup = backupDir.replace(`${root}/`, "");
    notes.push(`Backups: ${relBackup} (gitignored, may contain secrets).`);
  }

  if (options.hook && !options.dryRun) {
    const files = [...new Set(keptChanges.map((change) => change.file))];
    if (files.length > 0) {
      await gitAdd(root, files);
      notes.push(`Staged ${files.length} fixed file(s) for the commit.`);
    }
  }

  const totals = summarize(results);
  const ok = isOk(options, results);
  return {
    tool: "vibe-rescue-kit",
    version: pkg.version,
    root,
    mode: options.mode,
    dryRun: Boolean(options.dryRun),
    ok,
    results: results.filter((result) => options.mode === "fix" || result.action !== "clean"),
    totals,
    notes,
    backupDir: backupDir && keptChanges.length > 0 ? backupDir : undefined,
  };
}

function summarize(results: RuleRun[]): RunReport["totals"] {
  const findings = results.reduce((sum, result) => sum + result.findings.length, 0);
  const errors = results.reduce((sum, result) => sum + result.findings.filter((finding) => finding.severity === "error").length, 0);
  const files = new Set<string>();
  for (const result of results) {
    if (result.action === "applied" || result.action === "dry-run") {
      for (const change of result.changes) files.add(change.file);
    }
  }
  return {
    findings,
    errors,
    warnings: findings - errors,
    applied: results.filter((result) => result.action === "applied" || result.action === "dry-run").length,
    rolledBack: results.filter((result) => result.action === "rolled-back").length,
    filesChanged: files.size,
  };
}

function isOk(options: RunOptions, results: RuleRun[]): boolean {
  if (results.some((result) => result.action === "error" || result.action === "rolled-back")) return false;
  if (options.mode === "scan" || options.dryRun) {
    return results.every((result) => result.findings.length === 0);
  }
  return results.every((result) => result.action === "clean" || result.action === "applied");
}

async function ensureBackupGitignore(root: string): Promise<void> {
  const { readFile, writeFile: write } = await import("node:fs/promises");
  let current = "";
  try {
    current = await readFile(join(root, ".gitignore"), "utf8");
  } catch {
    current = "";
  }
  const matcher = gitignoreMatcher(current);
  if (matcher.ignores(".vibe-rescue/backups/manifest.json") || current.includes(BACKUP_LINE)) return;
  const sep = current.length === 0 ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  await write(join(root, ".gitignore"), `${current}${sep}# vibe-rescue backups (may contain secrets)\n${BACKUP_LINE}\n`);
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}
