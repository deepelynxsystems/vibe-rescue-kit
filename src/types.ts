export type Severity = "error" | "warning";

export interface Finding {
  fingerprint: string;
  ruleId: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  hint?: string;
  /** When false, the engine reports the problem and does not try to edit. */
  fixable?: boolean;
  meta?: Record<string, unknown>;
}

export interface Change {
  file: string;
  description: "created" | "updated" | "deleted";
  before: string | null;
  after: string | null;
}

export interface VerifyResult {
  ok: boolean;
  message: string;
}

export interface FixOutcome {
  notes?: string[];
}

export interface RuleContext {
  root: string;
  ignore: string[];
  phase: "detect" | "fix";
  read(file: string): Promise<string>;
  readMaybe(file: string): Promise<string | null>;
  write(file: string, content: string): Promise<void>;
  exists(file: string): Promise<boolean>;
  glob(patterns: string[]): Promise<string[]>;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  /** Shown in `vibe-rescue rules`. What this rule refuses to do. */
  scopeNote?: string;
  watchGlobs?: string[];
  detect(ctx: RuleContext): Promise<Finding[]>;
  fix(ctx: RuleContext, findings: Finding[]): Promise<FixOutcome>;
  verify(ctx: RuleContext, findings: Finding[]): Promise<VerifyResult>;
}

export interface RuleDefinition {
  id: string;
  title: string;
  description: string;
  severity?: Severity;
  scopeNote?: string;
  strategy?: string;
  detect?: Record<string, unknown>;
  fix?: Record<string, unknown>;
  verify?: Record<string, unknown>;
  watchGlobs?: string[];
}

export type RuleAction = "clean" | "detected" | "applied" | "dry-run" | "rolled-back" | "error";

export interface RuleRun {
  ruleId: string;
  title: string;
  action: RuleAction;
  findings: Finding[];
  changes: Change[];
  notes: string[];
  verify?: VerifyResult;
  error?: string;
}

export interface RunTotals {
  findings: number;
  errors: number;
  warnings: number;
  applied: number;
  rolledBack: number;
  filesChanged: number;
}

export interface RunReport {
  tool: "vibe-rescue-kit";
  version: string;
  root: string;
  mode: "scan" | "fix";
  dryRun: boolean;
  ok: boolean;
  results: RuleRun[];
  totals: RunTotals;
  notes: string[];
  backupDir?: string;
}

export interface RunOptions {
  root: string;
  mode: "scan" | "fix";
  ruleId?: string;
  dryRun?: boolean;
  /** Re-stage kept files. Used by the pre-commit hook. */
  hook?: boolean;
  /** Limit findings to git-staged paths. */
  staged?: boolean;
}
