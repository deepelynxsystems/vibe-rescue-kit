import type { RuleDefinition } from "../types.js";

export function detectConfig(def: RuleDefinition): Record<string, unknown> {
  return def.detect ?? {};
}

export function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return fallback;
  return value;
}

export function appendStrings(base: string[], extra: unknown): string[] {
  if (!Array.isArray(extra)) return base;
  const more = extra.filter((item): item is string => typeof item === "string");
  return [...base, ...more];
}
