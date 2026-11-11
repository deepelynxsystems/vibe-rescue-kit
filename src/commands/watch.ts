import chalk from "chalk";
import chokidar from "chokidar";
import { reportText } from "../engine/report.js";
import { run } from "../engine/runner.js";

export async function watchProject(options: { root: string; ruleId?: string; yes: boolean }): Promise<void> {
  const tick = async (): Promise<void> => {
    const report = await run({
      root: options.root,
      mode: options.yes ? "fix" : "scan",
      ruleId: options.ruleId,
    });
    process.stdout.write(reportText(report));
  };

  await tick();

  const watcher = chokidar.watch(options.root, {
    ignoreInitial: true,
    ignored: ["**/node_modules/**", "**/.git/**", "**/.vibe-rescue/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    usePolling: process.env.CHOKIDAR_USEPOLLING === "1",
    interval: 200,
  });
  await new Promise<void>((resolve, reject) => {
    watcher.once("ready", () => resolve());
    watcher.once("error", reject);
  });
  process.stdout.write(chalk.dim(`Watching ${options.root}. Ctrl-C to stop.\n`));

  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let pending = false;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runScheduled();
    }, 300);
  };

  const runScheduled = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      process.stdout.write(chalk.dim("\nChange detected.\n"));
      await tick();
    } catch (error) {
      process.stderr.write(`${chalk.red((error as Error).message)}\n`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  };

  watcher.on("all", schedule);
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.stdout.write("\nStopped watching.\n");
      watcher.close().finally(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
