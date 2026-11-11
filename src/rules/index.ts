import { hardcodedLocalhost } from "./hardcoded-localhost.js";
import { importPaths } from "./import-paths.js";
import { leakedSecrets } from "./leaked-secrets.js";
import { missingEnv } from "./missing-env.js";
import { spaRewrites } from "./spa-rewrites.js";
import { supabaseRls } from "./supabase-rls.js";
import type { Strategy } from "./types.js";
import { webhookSignature } from "./webhook-signature.js";

export type { Strategy } from "./types.js";

/** missing-env is last so it sees env names introduced by earlier fixes. */
export const strategies: Strategy[] = [
  leakedSecrets,
  importPaths,
  hardcodedLocalhost,
  spaRewrites,
  supabaseRls,
  webhookSignature,
  missingEnv,
];
