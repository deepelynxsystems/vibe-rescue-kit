import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Change } from "../types.js";

interface Original {
  existed: boolean;
  data: Buffer | null;
}

export class Snapshot {
  private saved = new Map<string, Original>();

  constructor(private readonly root: string) {}

  async record(abs: string): Promise<void> {
    if (this.saved.has(abs)) return;
    try {
      const data = await readFile(abs);
      this.saved.set(abs, { existed: true, data });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.saved.set(abs, { existed: false, data: null });
        return;
      }
      throw error;
    }
  }

  async rollback(): Promise<void> {
    for (const [abs, original] of this.saved) {
      if (!original.existed) {
        await rm(abs, { force: true });
        continue;
      }
      if (original.data) {
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, original.data);
      }
    }
  }

  diff(): Change[] {
    const changes: Change[] = [];
    for (const [abs, original] of this.saved) {
      const before = original.existed && original.data ? original.data.toString("utf8") : null;
      let after: string | null = null;
      if (existsSync(abs)) after = readFileSync(abs, "utf8");
      if (before === after) continue;
      const file = relative(this.root, abs).split(sep).join("/");
      changes.push({
        file,
        description: before == null ? "created" : after == null ? "deleted" : "updated",
        before,
        after,
      });
    }
    return changes;
  }

  async persistOriginals(backupDir: string, already: Set<string>): Promise<void> {
    for (const change of this.diff()) {
      if (already.has(change.file)) continue;
      already.add(change.file);
      const abs = join(this.root, change.file);
      const original = this.saved.get(abs);
      if (!original?.existed || !original.data) continue;
      const dest = join(backupDir, change.file);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, original.data);
    }
  }
}
