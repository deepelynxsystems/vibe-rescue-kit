import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
  name: string;
  version: string;
  description: string;
};

/** Package root both for src/ (tsx) and dist/ (node). */
export function packageRoot(): string {
  return join(here, "..");
}
