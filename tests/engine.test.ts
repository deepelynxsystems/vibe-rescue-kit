import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ejectRule, scaffoldRule } from "../src/commands/scaffold.js";
import { installHook } from "../src/commands/install.js";
import { runGit } from "../src/engine/git.js";
import { run } from "../src/engine/runner.js";
import { cli, repoRoot, text, withTemp } from "./helpers.js";

const STRIPE = "sk_test_1234567890abcdefghij";

describe("engine safety", () => {
  it("rolls back a fix whose verification still matches", async () => {
    await withTemp(async (dir) => {
      await writeFile(join(dir, "note.txt"), "foo\n");
      await mkdir(join(dir, ".vibe-rescue", "rules"), { recursive: true });
      await writeFile(
        join(dir, ".vibe-rescue", "rules", "bad-replace.yaml"),
        `id: bad-replace
title: Bad replace
description: Replacement still matches the detector.
severity: error
detect:
  globs: ["note.txt"]
  pattern: "foo"
  message: "found foo"
fix:
  type: replace
  pattern: "foo"
  replacement: "foo"
verify:
  type: rescan
`,
      );
      const report = await run({ root: dir, mode: "fix" });
      const result = report.results.find((item) => item.ruleId === "bad-replace");
      expect(result?.action).toBe("rolled-back");
      expect(await text(dir, "note.txt")).toBe("foo\n");
      expect(report.ok).toBe(false);
    });
  });

  it("dry-run restores every byte", async () => {
    await withTemp(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "app.ts"), `export const key = "${STRIPE}";\n`);
      await writeFile(join(dir, "package.json"), '{"name":"dry","private":true}\n');
      const before = await readFile(join(dir, "src", "app.ts"), "utf8");
      const report = await run({ root: dir, mode: "fix", dryRun: true, ruleId: "leaked-secrets" });
      expect(report.results.some((item) => item.action === "dry-run")).toBe(true);
      expect(await readFile(join(dir, "src", "app.ts"), "utf8")).toBe(before);
      expect(report.ok).toBe(false);
    });
  });

  it("lets a project append a secret pattern", async () => {
    await withTemp(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await mkdir(join(dir, ".vibe-rescue", "rules"), { recursive: true });
      await writeFile(join(dir, "src", "token.ts"), 'export const token = "custom_token_1234";\n');
      await writeFile(
        join(dir, ".vibe-rescue", "rules", "leaked-secrets.yaml"),
        `id: leaked-secrets
title: Leaked secrets in client code
description: Project overlay.
detect:
  appendSecretPatterns:
    - name: custom
      regex: "custom_token_[0-9]{4}"
      env: CUSTOM_TOKEN
`,
      );
      const report = await run({ root: dir, mode: "scan", ruleId: "leaked-secrets" });
      expect(report.results[0]?.findings.length).toBeGreaterThan(0);
      const fixed = await run({ root: dir, mode: "fix", ruleId: "leaked-secrets" });
      expect(fixed.ok).toBe(true);
      expect(await text(dir, "src/token.ts")).toContain('serverOnlyEnv("CUSTOM_TOKEN")');
      expect(await text(dir, "src/token.ts")).not.toContain("custom_token_1234");
    });
  });

  it("honors a disabled rule", async () => {
    await withTemp(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await mkdir(join(dir, ".vibe-rescue"), { recursive: true });
      await writeFile(join(dir, "src", "app.ts"), `export const key = "${STRIPE}";\n`);
      await writeFile(join(dir, ".vibe-rescue", "config.yaml"), "disable:\n  - leaked-secrets\n");
      const report = await run({ root: dir, mode: "scan" });
      expect(report.results.some((item) => item.ruleId === "leaked-secrets")).toBe(false);
    });
  });

  it("scaffolds a rule the engine can run", async () => {
    await withTemp(async (dir) => {
      const file = await scaffoldRule(dir, "no-marker", { title: "No marker" });
      expect(file.endsWith(".vibe-rescue/rules/no-marker.yaml")).toBe(true);
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "app.ts"), "export const value = \"vibe-rescue-template-pattern\";\n");
      const found = await run({ root: dir, mode: "scan", ruleId: "no-marker" });
      expect(found.results[0]?.findings).toHaveLength(1);
      const fixed = await run({ root: dir, mode: "fix", ruleId: "no-marker" });
      expect(fixed.ok).toBe(true);
      expect(await text(dir, "src/app.ts")).toContain("vibe-rescue-template-fixed");
    });
  });

  it("ejects a built-in rule and installs a hook in a git repo", async () => {
    await withTemp(async (dir) => {
      await runGit(dir, ["init"]);
      const ejected = await ejectRule(dir, "spa-rewrites", false);
      expect(await text(dir, ".vibe-rescue/rules/spa-rewrites.yaml")).toContain("id: spa-rewrites");
      expect(ejected).toContain("spa-rewrites.yaml");
      const hook = await installHook(dir, false);
      expect(await text(dir, hook.slice(dir.length + 1))).toContain("vibe-rescue fix --yes --hook --staged");
    });
  });
});

describe("watch", () => {
  it("applies a fix when a secret shows up on disk", async () => {
    await withTemp(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "ok.ts"), "export const ok = true;\n");
      const tsx = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
      const child = spawn(process.execPath, [tsx, join(repoRoot, "src", "cli.ts"), "watch", dir, "--yes"], {
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CHOKIDAR_USEPOLLING: "1" },
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      const started = Date.now();
      while (!output.includes("Watching") && Date.now() - started < 8000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(output).toContain("Watching");
      const target = join(dir, "src", "leaked.ts");
      await writeFile(target, `export const key = "${STRIPE}";\n`);
      const deadline = Date.now() + 8000;
      let fixed = "";
      while (Date.now() < deadline) {
        fixed = await readFile(target, "utf8");
        if (!fixed.includes(STRIPE) && fixed.includes("serverOnlyEnv")) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      child.kill("SIGINT");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      expect(fixed).not.toContain(STRIPE);
      expect(fixed).toContain("serverOnlyEnv");
    });
  }, 20_000);
});

describe("cli", () => {
  it("prints the deepelynx footer and refuses to fix without --yes", async () => {
    await withTemp(async (dir) => {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src", "app.ts"), `export const key = "${STRIPE}";\n`);
      const scan = cli(["scan", dir]);
      expect(scan.status).toBe(1);
      expect(`${scan.stdout}\n${scan.stderr}`).toContain("vibe-rescue-kit by deepelynx");
      expect(scan.stdout).not.toContain(STRIPE);
      const refused = cli(["fix", dir]);
      expect(refused.status).toBe(2);
      expect(await text(dir, "src/app.ts")).toContain(STRIPE);
      const help = cli(["--help"]);
      expect(help.status).toBe(0);
      expect(`${help.stdout}\n${help.stderr}`).toContain("vibe-rescue-kit by deepelynx");
    });
  });
});
