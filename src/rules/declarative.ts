import { spawnSync } from "node:child_process";
import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { ConfigError } from "../engine/errors.js";
import { stringArray } from "./config.js";

export function compileDeclarative(def: RuleDefinition, path: string): Rule {
  const detect = def.detect ?? {};
  const fix = def.fix ?? {};
  const globs = stringArray(detect.globs, []);
  const pattern = typeof detect.pattern === "string" ? detect.pattern : "";
  const flags = typeof detect.flags === "string" ? detect.flags : "";
  const message = typeof detect.message === "string" ? detect.message : def.title;
  if (globs.length === 0 || !pattern) {
    throw new ConfigError(`${path} needs detect.globs and detect.pattern, or a fix strategy.`);
  }
  if (fix.type !== "replace" || typeof fix.pattern !== "string") {
    throw new ConfigError(`${path} needs fix.type: replace and fix.pattern. Built-in strategies are selected by using their id without a fix block.`);
  }
  const replacement = typeof fix.replacement === "string" ? fix.replacement : "";
  const fixFlags = typeof fix.flags === "string" ? fix.flags : "g";
  let detectRe: RegExp;
  let fixRe: RegExp;
  try {
    detectRe = new RegExp(pattern, flags.replace("g", ""));
    fixRe = new RegExp(fix.pattern, fixFlags.includes("g") ? fixFlags : `${fixFlags}g`);
  } catch (error) {
    throw new ConfigError(`${path} has an invalid regular expression: ${(error as Error).message}`);
  }

  const severity = def.severity ?? "warning";
  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? globs,
    async detect(ctx) {
      const files = await ctx.glob(globs);
      const findings: Finding[] = [];
      for (const file of files) {
        const text = await ctx.read(file);
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          detectRe.lastIndex = 0;
          if (!detectRe.test(lines[index])) continue;
          findings.push({
            fingerprint: `${def.id}:${file}:${index + 1}`,
            ruleId: def.id,
            severity,
            message: message.replaceAll("$file", file).replaceAll("$line", String(index + 1)),
            file,
            line: index + 1,
          });
          break;
        }
      }
      return findings;
    },
    async fix(ctx, findings) {
      const files = [...new Set(findings.map((finding) => finding.file).filter((file): file is string => Boolean(file)))];
      for (const file of files) {
        const text = await ctx.read(file);
        const next = text.replace(fixRe, replacement);
        if (next !== text) await ctx.write(file, next);
      }
      return { notes: [] };
    },
    async verify(ctx, findings) {
      if (def.verify?.type === "command" && typeof def.verify.command === "string") {
        const result = spawnSync(def.verify.command, {
          shell: true,
          cwd: ctx.root,
          encoding: "utf8",
          timeout: 30_000,
        });
        if (result.status === 0) return { ok: true, message: "Verification command passed." };
        const detail = (result.stderr || result.stdout || "Verification command failed.").trim();
        return { ok: false, message: detail };
      }
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}
