import chalk from "chalk";

let armed = false;
let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

/** Print the credit exactly once when the process exits. */
export function armFooter(): void {
  if (armed) return;
  armed = true;
  process.on("exit", () => {
    const line = chalk.dim("vibe-rescue-kit by deepelynx");
    const stream = jsonMode ? process.stderr : process.stdout;
    stream.write(`${jsonMode ? "" : "\n"}${line}\n`);
  });
}
