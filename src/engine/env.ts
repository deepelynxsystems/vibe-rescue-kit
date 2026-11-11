export interface EnvEntry {
  key: string;
  /** null writes `KEY=` so the value is documented but unset. */
  value: string | null;
  comment?: string;
}

export function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    map.set(match[1], value);
  }
  return map;
}

export function hasEnvKey(content: string | null, key: string): boolean {
  if (!content) return false;
  return new RegExp(`^(?:export\\s+)?${key}=`, "m").test(content);
}

export function upsertEnv(content: string | null, entries: EnvEntry[]): string {
  let text = content ?? "";
  if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  for (const entry of entries) {
    if (hasEnvKey(text, entry.key)) continue;
    if (entry.comment) text += `# ${entry.comment}\n`;
    const raw = entry.value ?? "";
    const safe = /[\s#"'`]/.test(raw) ? JSON.stringify(raw) : raw;
    text += `${entry.key}=${safe}\n`;
  }
  return text;
}

export function blankEnvValue(content: string, key: string): string {
  return content.replace(new RegExp(`^((?:export\\s+)?${key}=).*$`, "m"), "$1");
}

export const ENV_EXAMPLE_NAMES = [".env.example", ".env.sample", ".env.template"] as const;

export const LOCAL_ENV_NAMES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.development.local",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
] as const;

export const SECRET_GITIGNORE_BLOCK = `# vibe-rescue: never commit secrets
.env
.env.*
!.env.example
!.env.sample
!.env.template
`;
