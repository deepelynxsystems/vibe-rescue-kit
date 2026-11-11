/**
 * Project rule module for vibe-rescue-kit.
 * @type {import("vibe-rescue-kit").Rule}
 */
const rule = {
  id: "RULE_ID",
  title: "RULE_TITLE",
  description: "Describe the problem this rule solves.",
  severity: "warning",
  async detect(ctx) {
    const files = await ctx.glob(["src/**/*.{ts,tsx,js,jsx}"]);
    const findings = [];
    for (const file of files) {
      const text = await ctx.read(file);
      const index = text.indexOf("vibe-rescue-template-pattern");
      if (index === -1) continue;
      const line = text.slice(0, index).split("\n").length;
      findings.push({
        fingerprint: `RULE_ID:${file}:template`,
        ruleId: "RULE_ID",
        severity: "warning",
        message: `Template pattern is still present in ${file}:${line}.`,
        file,
        line,
      });
    }
    return findings;
  },
  async fix(ctx, findings) {
    for (const finding of findings) {
      if (!finding.file) continue;
      const text = await ctx.read(finding.file);
      const next = text.replaceAll("vibe-rescue-template-pattern", "vibe-rescue-template-fixed");
      if (next !== text) await ctx.write(finding.file, next);
    }
    return { notes: [] };
  },
  async verify(ctx, findings) {
    const again = await rule.detect(ctx);
    const ids = new Set(again.map((item) => item.fingerprint));
    const left = findings.filter((item) => ids.has(item.fingerprint));
    if (left.length === 0) return { ok: true, message: "Verification passed." };
    return { ok: false, message: "Verification failed. The template pattern is still present." };
  },
};

export default rule;
