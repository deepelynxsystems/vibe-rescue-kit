#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommanderError } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { installAction, installHook } from "./commands/install.js";
import { ejectRule, scaffoldRule } from "./commands/scaffold.js";
import { watchProject } from "./commands/watch.js";
import { ConfigError } from "./engine/errors.js";
import { knownRuleIds } from "./engine/load-rules.js";
import { reportJson, reportText } from "./engine/report.js";
import { run } from "./engine/runner.js";
import { armFooter, setJsonMode } from "./footer.js";
import { strategies } from "./rules/index.js";
import { pkg } from "./version.js";

interface CommonOpts {
  rule?: string;
  json?: boolean;
}

export async function main(argv: string[]): Promise<number> {
  let code = 0;
  const program = new Command();
  program
    .name("vibe-rescue")
    .description("Automatic, reversible fixes for the failures AI vibe-coding tools leave behind.")
    .version(pkg.version)
    .showHelpAfterError()
    .exitOverride();

  program
    .command("scan")
    .description("Report problems. Exits 1 when any finding exists.")
    .argument("[path]", "project directory", ".")
    .option("-r, --rule <id>", "run a single rule")
    .option("--json", "print JSON on stdout")
    .option("--staged", "only report findings in git-staged files")
    .action(async (path: string, opts: CommonOpts & { staged?: boolean }) => {
      code = await execute(path, opts, "scan");
    });

  program
    .command("fix")
    .description("Apply fixes, verify each rule, and roll back anything that fails verification.")
    .argument("[path]", "project directory", ".")
    .option("-r, --rule <id>", "run a single rule")
    .option("--json", "print JSON on stdout")
    .option("--dry-run", "apply in memory, print the diff, then restore the files")
    .option("-y, --yes", "apply without prompting")
    .option("--auto", "alias of --yes")
    .option("--staged", "only fix findings in git-staged files")
    .option("--hook", "after a kept fix, stage the changed files (used by the pre-commit hook)")
    .action(async (path: string, opts: CommonOpts & { dryRun?: boolean; yes?: boolean; auto?: boolean; staged?: boolean; hook?: boolean }) => {
      code = await executeFix(path, opts);
    });

  program
    .command("watch")
    .description("Re-run when files change. Pass --yes to apply fixes automatically.")
    .argument("[path]", "project directory", ".")
    .option("-r, --rule <id>", "run a single rule")
    .option("-y, --yes", "apply fixes automatically")
    .option("--auto", "alias of --yes")
    .action(async (path: string, opts: { rule?: string; yes?: boolean; auto?: boolean }) => {
      const root = resolve(path);
      await watchProject({ root, ruleId: opts.rule, yes: Boolean(opts.yes || opts.auto) });
      code = 0;
    });

  program
    .command("new-rule")
    .description("Scaffold a rule in .vibe-rescue/rules.")
    .argument("<id>", "rule id, such as no-foo")
    .option("-t, --title <title>", "human title")
    .option("--type <type>", "yaml or module", "yaml")
    .option("--force", "replace an existing scaffold")
    .action(async (id: string, opts: { title?: string; type?: string; force?: boolean }) => {
      const type = opts.type === "module" ? "module" : opts.type === "yaml" ? "yaml" : null;
      if (!type) throw new ConfigError("--type must be yaml or module.");
      const file = await scaffoldRule(process.cwd(), id, { title: opts.title, type, force: opts.force });
      output.write(`Wrote ${file}\nEdit detect, fix, and verify, then run vibe-rescue scan.\n`);
      code = 0;
    });

  program
    .command("eject")
    .description("Copy a built-in rule into .vibe-rescue/rules so you can edit its problem definition.")
    .argument("<id>", "built-in rule id")
    .option("--force", "replace an existing file")
    .action(async (id: string, opts: { force?: boolean }) => {
      const file = await ejectRule(process.cwd(), id, Boolean(opts.force));
      output.write(`Wrote ${file}\nArrays in detect replace the built-in list. appendSecretPatterns adds to leaked-secrets without replacing it.\n`);
      code = 0;
    });

  program
    .command("rules")
    .description("List built-in rules.")
    .action(() => {
      for (const strategy of strategies) {
        const def = strategy.defaults();
        output.write(`${def.id.padEnd(22)} ${(def.severity ?? "error").padEnd(8)} ${def.title}\n`);
      }
      code = 0;
    });

  program
    .command("install-hook")
    .description("Install a git pre-commit hook that runs vibe-rescue fix --yes --staged.")
    .option("--force", "replace an existing vibe-rescue hook")
    .action(async (opts: { force?: boolean }) => {
      const file = await installHook(process.cwd(), Boolean(opts.force));
      output.write(`Installed ${file}\nThe hook fixes staged files, verifies them, and stages the kept edits.\n`);
      code = 0;
    });

  program
    .command("install-action")
    .description("Add a GitHub Actions workflow that runs vibe-rescue.")
    .option("--mode <mode>", "scan or fix", "scan")
    .option("--force", "replace an existing workflow")
    .action(async (opts: { mode?: string; force?: boolean }) => {
      if (opts.mode !== "scan" && opts.mode !== "fix") throw new ConfigError("--mode must be scan or fix.");
      const file = await installAction(process.cwd(), opts.mode, Boolean(opts.force));
      output.write(`Wrote ${file}\n`);
      code = 0;
    });

  program.addHelpText("after", "\nBuilt by deepelynx  https://deepelynx.com\n");

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") return error.exitCode;
      if (error.message) process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
  return code;
}

async function execute(path: string, opts: CommonOpts & { staged?: boolean }, mode: "scan" | "fix"): Promise<number> {
  setJsonMode(Boolean(opts.json));
  const root = resolve(path);
  const report = await run({ root, mode, ruleId: opts.rule, staged: opts.staged });
  writeReport(report, Boolean(opts.json));
  return report.ok ? 0 : 1;
}

async function executeFix(
  path: string,
  opts: CommonOpts & { dryRun?: boolean; yes?: boolean; auto?: boolean; staged?: boolean; hook?: boolean },
): Promise<number> {
  setJsonMode(Boolean(opts.json));
  const root = resolve(path);
  const preview = await run({ root, mode: "scan", ruleId: opts.rule, staged: opts.staged });
  if (preview.ok) {
    writeReport(preview, Boolean(opts.json));
    return 0;
  }
  const yes = Boolean(opts.yes || opts.auto || opts.hook);
  if (!opts.dryRun && !yes) {
    writeReport(preview, Boolean(opts.json));
    if (!input.isTTY) {
      process.stderr.write("\nRefusing to edit files without --yes in a non-interactive shell.\n");
      return 2;
    }
    const rl = createInterface({ input, output });
    const answer = await rl.question("Apply these fixes? [y/N] ");
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      output.write("No files were changed.\n");
      return 0;
    }
  }
  const report = await run({
    root,
    mode: "fix",
    ruleId: opts.rule,
    dryRun: Boolean(opts.dryRun),
    staged: opts.staged,
    hook: opts.hook,
  });
  writeReport(report, Boolean(opts.json));
  return report.ok ? 0 : 1;
}

function writeReport(report: Parameters<typeof reportText>[0], json: boolean): void {
  if (json) output.write(reportJson(report));
  else output.write(reportText(report));
}

const directRun = process.argv.some((arg) =>
  /(^|\/)(cli\.(ts|js)|vibe-rescue)$/.test(arg.replace(/\\/g, "/")),
);
const argvScript = process.argv[1];
const sameFile = argvScript ? import.meta.url === pathToFileURL(argvScript).href : false;
if (directRun || sameFile) {
  armFooter();
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
      process.stderr.write(`${chalk.red(message)}\n`);
      if (error instanceof Error && /Unknown rule/.test(error.message)) {
        process.stderr.write(`Known rules: ${knownRuleIds().join(", ")}\n`);
      }
      process.exitCode = 2;
    });
}
