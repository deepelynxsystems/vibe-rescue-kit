import type { Finding, Rule, RuleContext, VerifyResult } from "../types.js";

export function defineRule(rule: Rule): Rule {
  return rule;
}

export async function verifyFixed(rule: Rule, ctx: RuleContext, findings: Finding[]): Promise<VerifyResult> {
  const after = await rule.detect(ctx);
  const ids = new Set(after.map((finding) => finding.fingerprint));
  const remaining = findings.filter((finding) => finding.fixable !== false && ids.has(finding.fingerprint));
  if (remaining.length === 0) {
    return { ok: true, message: "Verification passed." };
  }
  const sample = remaining
    .slice(0, 4)
    .map((finding) => finding.message)
    .join(" ");
  return {
    ok: false,
    message: `Verification failed. ${remaining.length} problem(s) remain. ${sample}`,
  };
}
