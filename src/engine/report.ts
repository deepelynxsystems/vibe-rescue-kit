import chalk from "chalk";
import { createTwoFilesPatch } from "diff";
import type { Change, Finding, RunReport } from "../types.js";
import { publicMeta, redactSecrets, redactValue } from "./redact.js";

export function reportJson(report: RunReport): string {
  const safe = redactValue({
    ...report,
    results: report.results.map((result) => ({
      ...result,
      findings: result.findings.map((finding) => ({ ...finding, meta: publicMeta(finding.meta) })),
    })),
  });
  return `${JSON.stringify(safe, null, 2)}\n`;
}

export function reportText(report: RunReport): string {
  const lines: string[] = [];
  const title = report.mode === "scan" ? "vibe-rescue scan" : report.dryRun ? "vibe-rescue fix --dry-run" : "vibe-rescue fix";
  lines.push(chalk.bold(title));
  lines.push(chalk.dim(report.root));
  lines.push("");

  const visible = report.results.filter((result) => result.action !== "clean");
  if (visible.length === 0) {
    lines.push(chalk.green("No problems found."));
  }

  for (const result of visible) {
    const label =
      result.action === "applied"
        ? chalk.green("fixed")
        : result.action === "dry-run"
          ? chalk.cyan("would fix")
          : result.action === "rolled-back"
            ? chalk.red("rolled back")
            : result.action === "error"
              ? chalk.red("error")
              : chalk.yellow("found");
    lines.push(`${chalk.bold(result.ruleId)}  ${label}`);
    if (result.error) lines.push(`  ${chalk.red(result.error)}`);
    for (const finding of result.findings) {
      lines.push(`  ${severityMark(finding)}  ${where(finding)}`);
      lines.push(`     ${redactSecrets(finding.message)}`);
      if (finding.hint) lines.push(chalk.dim(`     ${redactSecrets(finding.hint)}`));
    }
    if (result.action === "dry-run") {
      for (const change of result.changes) {
        lines.push(chalk.dim(`  ${change.description} ${change.file}`));
        lines.push(indent(renderDiff(change), 4));
      }
    } else if (result.action === "applied") {
      for (const change of result.changes) lines.push(chalk.green(`  ${change.description} ${change.file}`));
    }
    for (const note of result.notes) lines.push(chalk.yellow(`  note: ${redactSecrets(note)}`));
    if (result.verify) {
      lines.push(result.verify.ok ? chalk.green(`  ${result.verify.message}`) : chalk.red(`  ${redactSecrets(result.verify.message)}`));
    }
    lines.push("");
  }

  const { findings, errors, warnings, applied, rolledBack, filesChanged } = report.totals;
  if (report.mode === "scan") {
    lines.push(chalk.bold(`${findings} finding${findings === 1 ? "" : "s"} · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`));
  } else {
    lines.push(chalk.bold(`${applied} rule${applied === 1 ? "" : "s"} ${report.dryRun ? "would change files" : "changed files"} · ${rolledBack} rolled back · ${filesChanged} file${filesChanged === 1 ? "" : "s"}`));
  }
  for (const note of report.notes) lines.push(chalk.dim(note));
  return `${lines.join("\n").replace(/\n$/, "")}\n`;
}

function severityMark(finding: Finding): string {
  if (finding.fixable === false) return chalk.yellow("!");
  return finding.severity === "error" ? chalk.red("✗") : chalk.yellow("!");
}

function where(finding: Finding): string {
  if (!finding.file) return "";
  return chalk.dim(finding.line ? `${finding.file}:${finding.line}` : finding.file);
}

function renderDiff(change: Change): string {
  const patch = createTwoFilesPatch(
    change.before == null ? "/dev/null" : change.file,
    change.after == null ? "/dev/null" : change.file,
    change.before ?? "",
    change.after ?? "",
    "",
    "",
    { context: 2 },
  );
  const redacted = redactSecrets(patch);
  const diffLines = redacted.split("\n");
  if (diffLines.length <= 80) return redacted;
  return `${diffLines.slice(0, 80).join("\n")}\n... diff truncated`;
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}
