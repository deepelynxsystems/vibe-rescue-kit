import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const actionRoot = process.env.ACTION_PATH
  ? resolve(process.env.ACTION_PATH)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = process.env.GITHUB_WORKSPACE ? resolve(process.env.GITHUB_WORKSPACE) : process.cwd();

const mode = requiredChoice("mode", process.env.INPUT_MODE, ["scan", "fix"]);
const severity = requiredChoice("severity", process.env.INPUT_SEVERITY, ["warning", "error"]);
const format = requiredChoice("format", process.env.INPUT_FORMAT, ["text", "json"]);
const failOnFindings = requiredBool("fail-on-findings", process.env.INPUT_FAIL_ON_FINDINGS);
const rules = parseRules(process.env.INPUT_RULES ?? "");
const scanPath = resolveScanPath(process.env.INPUT_PATH ?? ".");

const cli = join(actionRoot, "dist", "cli.js");
if (!existsSync(cli)) {
  die(`Missing ${cli}. The build step did not produce dist/cli.js.`);
}

const reports = rules.length === 0 ? [runCli()] : rules.map((ruleId) => runCli(ruleId));
const report = mergeReports(reports);
const reportPath = join(workspace, "vibe-rescue-report.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const open = openFindings(report, severity);
const ruleErrors = report.results.filter((result) => result.action === "error");
const shouldFail = failOnFindings && (open.length > 0 || ruleErrors.length > 0);
const summary = summarizeLine(report, open);

setOutput("findings-count", String(open.length));
setOutput("report-path", reportPath);
setOutput("summary", summary);
setOutput("fail", shouldFail ? "true" : "false");

const markdown = renderSummary(report, open, ruleErrors, summary);
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) appendFileSync(summaryFile, `${markdown}\n`);
if (format === "json") {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${markdown}\n`);
}

function runCli(ruleId) {
  const args = [cli, mode, scanPath, "--json"];
  if (mode === "fix") args.push("--yes");
  if (ruleId) args.push("--rule", ruleId);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: workspace,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  if (result.error) die(result.error.message);
  if (result.stderr) process.stderr.write(result.stderr);
  const status = result.status ?? 2;
  if (status !== 0 && status !== 1) {
    if (result.stdout) process.stderr.write(result.stdout);
    process.exit(status);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    die(`vibe-rescue did not return JSON.\n${result.stdout ?? ""}`);
  }
}

function mergeReports(parts) {
  const first = parts[0];
  const results = parts.flatMap((part) => part.results ?? []);
  const notes = [...new Set(parts.flatMap((part) => part.notes ?? []))];
  const backupDir = parts.map((part) => part.backupDir).filter(Boolean).at(-1);
  return {
    tool: first.tool ?? "vibe-rescue-kit",
    version: first.version ?? "",
    root: first.root ?? scanPath,
    mode: first.mode ?? mode,
    dryRun: false,
    ok: parts.every((part) => part.ok === true),
    results,
    totals: totalsOf(results),
    notes,
    ...(backupDir ? { backupDir } : {}),
  };
}

function totalsOf(results) {
  const findings = results.reduce((sum, result) => sum + result.findings.length, 0);
  const errors = results.reduce(
    (sum, result) => sum + result.findings.filter((finding) => finding.severity === "error").length,
    0,
  );
  const files = new Set();
  for (const result of results) {
    if (result.action === "applied" || result.action === "dry-run") {
      for (const change of result.changes ?? []) files.add(change.file);
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

function openFindings(report, threshold) {
  return listedFindings(report).filter((finding) => meets(finding.severity, threshold));
}

function findingsBelow(report, threshold) {
  return listedFindings(report).filter((finding) => !meets(finding.severity, threshold));
}

function listedFindings(report) {
  const findings = [];
  for (const result of report.results) {
    if (result.action === "applied" || result.action === "clean") continue;
    findings.push(...result.findings);
  }
  return findings;
}

function findingsBelowLine(count) {
  if (count === 1) return `1 finding is below the ${severity} threshold and does not fail this step.`;
  return `${count} findings are below the ${severity} threshold and do not fail this step.`;
}

function meets(findingSeverity, threshold) {
  if (threshold === "warning") return findingSeverity === "warning" || findingSeverity === "error";
  return findingSeverity === "error";
}

function summarizeLine(report, open) {
  const errors = open.filter((finding) => finding.severity === "error").length;
  const warnings = open.length - errors;
  const noun = open.length === 1 ? "finding" : "findings";
  const errorNoun = errors === 1 ? "error" : "errors";
  const warningNoun = warnings === 1 ? "warning" : "warnings";
  let line = `${open.length} open ${noun} (${errors} ${errorNoun}, ${warnings} ${warningNoun})`;
  if (report.mode === "fix") {
    const applied = report.totals.applied;
    const rolled = report.totals.rolledBack;
    line += `. ${applied} ${applied === 1 ? "rule" : "rules"} changed files, ${rolled} rolled back`;
  }
  return line;
}

function renderSummary(report, open, ruleErrors, line) {
  const heading = report.mode === "fix" ? "vibe-rescue fix" : "vibe-rescue scan";
  const rows = ["### " + heading, "", `**${line}**`, "", `Scanned \`${scanPath}\`.`, ""];
  const below = findingsBelow(report, severity);
  if (open.length === 0 && ruleErrors.length === 0) {
    rows.push(below.length === 0 ? "No problems found." : findingsBelowLine(below.length));
    rows.push("");
    return rows.join("\n");
  }
  for (const result of ruleErrors) {
    rows.push(`- **${cell(result.ruleId)}** error: ${cell(result.error || "the rule failed")}`);
  }
  for (const result of report.results) {
    if (result.action !== "rolled-back") continue;
    const why = result.verify?.message || result.error || "verification failed";
    rows.push(`- **${cell(result.ruleId)}** rolled back: ${cell(why)}`);
  }
  if (ruleErrors.length > 0 || report.results.some((result) => result.action === "rolled-back")) rows.push("");
  const shown = open.slice(0, 40);
  if (shown.length > 0) {
    rows.push("| Rule | Severity | Location | Message |");
    rows.push("| --- | --- | --- | --- |");
    for (const finding of shown) {
      const location = finding.file ? (finding.line ? `${finding.file}:${finding.line}` : finding.file) : "";
      rows.push(`| ${cell(finding.ruleId)} | ${cell(finding.severity)} | ${cell(location)} | ${cell(finding.message)} |`);
    }
    if (open.length > shown.length) rows.push("", `And ${open.length - shown.length} more open findings in the report.`);
    rows.push("");
  }
  if (below.length > 0) {
    rows.push(findingsBelowLine(below.length));
    rows.push("");
  }
  return rows.join("\n");
}

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .slice(0, 240);
}

function parseRules(value) {
  const ids = [];
  const seen = new Set();
  for (const part of value.split(/[,\s]+/)) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) die(`rules contains an invalid id: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function resolveScanPath(value) {
  const raw = value.trim() || ".";
  const path = isAbsolute(raw) ? raw : resolve(workspace, raw);
  if (!existsSync(path) || !statSync(path).isDirectory()) die(`path is not a directory: ${path}`);
  return path;
}

function requiredChoice(name, value, allowed) {
  const text = String(value ?? "").trim();
  if (!allowed.includes(text)) die(`Input ${name} must be ${allowed.join(" or ")}.`);
  return text;
}

function requiredBool(name, value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  die(`Input ${name} must be true or false.`);
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  const text = String(value);
  if (!file) {
    process.stderr.write(`output ${name}=${text}\n`);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  if (text.includes("\n")) {
    const delim = `EOF_${process.pid}`;
    appendFileSync(file, `${name}<<${delim}\n${text}\n${delim}\n`);
  } else {
    appendFileSync(file, `${name}=${text}\n`);
  }
}

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
