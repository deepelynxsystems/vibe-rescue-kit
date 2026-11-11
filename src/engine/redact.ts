const REDACTORS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "<redacted-private-key>"],
  [/sk_(live|test)_[0-9A-Za-z]+/g, "sk_$1_<redacted>"],
  [/rk_(live|test)_[0-9A-Za-z]+/g, "rk_$1_<redacted>"],
  [/sb_secret_[A-Za-z0-9_-]+/g, "sb_secret_<redacted>"],
  [/ghp_[A-Za-z0-9]+/g, "ghp_<redacted>"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA<redacted>"],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "eyJ<redacted-jwt>"],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTORS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const SENSITIVE_META = new Set(["secretValue", "value", "raw", "literal"]);

export function redactValue<T>(value: T): T {
  return JSON.parse(redactSecrets(JSON.stringify(value))) as T;
}

export function publicMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const copy: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (SENSITIVE_META.has(key)) continue;
    copy[key] = val;
  }
  return copy;
}
