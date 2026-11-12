import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { upsertEnv } from "../engine/env.js";
import { addDependency, readPackage, writePackageIfChanged } from "../engine/package-file.js";
import { insertImport, usesSemicolons } from "../engine/text.js";
import type { Strategy } from "./types.js";

const GLOBS = [
  "**/*webhook*.{ts,tsx,js,jsx,mjs,cjs}",
  "**/*Webhook*.{ts,tsx,js,jsx,mjs,cjs}",
  "**/api/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "**/routes/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const webhookSignature: Strategy = {
  id: "webhook-signature",
  defaults() {
    return {
      id: "webhook-signature",
      title: "Unverified Stripe webhooks",
      description: "A Stripe webhook that trusts the JSON body can be forged. constructEvent or an HMAC check (timingSafeEqual / createHmac) counts as verification. The word stripe alone does not.",
      severity: "error",
      scopeNote: "Adds a signature-check scaffold and env names. It does not call Stripe and does not invent a webhook secret.",
      strategy: "webhook-signature",
      watchGlobs: GLOBS,
    };
  },
  create(def) {
    return createRule(def);
  },
};

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? GLOBS,
    async detect(ctx) {
      const findings: Finding[] = [];
      for (const file of await ctx.glob(GLOBS)) {
        if (/\.(test|spec)\./.test(file)) continue;
        const text = await ctx.read(file);
        if (!looksUnverified(file, text)) continue;
        findings.push({
          fingerprint: `webhook-signature:${file}`,
          ruleId: def.id,
          severity,
          message: `${file} handles a Stripe webhook without constructEvent.`,
          file,
          hint: "A signature check will be inserted. Set STRIPE_WEBHOOK_SECRET and send Stripe the raw body.",
        });
      }
      return findings;
    },
    async fix(ctx, findings) {
      const notes: string[] = [];
      let needsStripeDep = false;
      for (const finding of findings) {
        if (!finding.file) continue;
        const text = await ctx.read(finding.file);
        const edited = transformWebhookSource(text, finding.file.endsWith(".ts") || finding.file.endsWith(".tsx"));
        if (!edited) {
          throw new Error(`Could not safely patch ${finding.file}. Expected await req.json() or const event = req.body.`);
        }
        await ctx.write(finding.file, edited.code);
        notes.push(...edited.notes.map((note) => `${finding.file}: ${note}`));
        if (edited.code.includes('from "stripe"') || edited.code.includes("from 'stripe'")) needsStripeDep = true;
      }
      const example = await ctx.readMaybe(".env.example");
      await ctx.write(
        ".env.example",
        upsertEnv(example, [
          { key: "STRIPE_WEBHOOK_SECRET", value: null, comment: "Stripe webhook signing secret. Rotate if it was ever missing." },
          { key: "STRIPE_SECRET_KEY", value: null },
        ]),
      );
      if (needsStripeDep) {
        const pkg = await readPackage(ctx);
        if (pkg) {
          if (addDependency(pkg.json, "stripe")) {
            await writePackageIfChanged(ctx, pkg, pkg.json);
            notes.push("Added stripe@* to package.json. Run npm install.");
          }
        }
      }
      return { notes };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

export function looksUnverified(file: string, source: string): boolean {
  if (!isStripeWebhook(file, source)) return false;
  return !hasSignatureVerification(source);
}

function isStripeWebhook(file: string, source: string): boolean {
  const named = /webhook/i.test(file) || /["'`][^"'`\n]*webhook[^"'`\n]*["'`]/i.test(source);
  if (!named) return false;
  return /\bfrom\s+["']stripe["']|\brequire\(\s*["']stripe["']\s*\)|\bnew\s+Stripe\b|\bstripe\.webhooks\b/.test(source);
}

function hasSignatureVerification(source: string): boolean {
  return /constructEvent|readVerifiedStripeEvent|\btimingSafeEqual\b|\bcreateHmac\b/.test(source);
}

export function transformWebhookSource(source: string, ts: boolean): { code: string; notes: string[] } | null {
  if (/constructEvent|readVerifiedStripeEvent/.test(source)) return { code: source, notes: [] };
  const client = source.match(/(?:const|let|var)\s+(\w+)\s*=\s*new\s+Stripe\b/)?.[1] ?? "stripe";
  const jsonCall = source.match(/const\s+(\w+)\s*=\s*await\s+(req|request)\.json\(\s*\)\s*;?/);
  if (jsonCall) {
    let code = ensureStripeClient(source, client);
    code = insertAfterImports(code, appHelper(client, ts));
    const replacement = [
      `const ${jsonCall[1]}OrReject = await readVerifiedStripeEvent(${jsonCall[2]});`,
      `if (${jsonCall[1]}OrReject instanceof Response) return ${jsonCall[1]}OrReject;`,
      `const ${jsonCall[1]} = ${jsonCall[1]}OrReject;`,
    ].join("\n");
    code = code.replace(jsonCall[0], replacement);
    return { code, notes: ["Verify the Stripe signature with constructEvent before trusting the event."] };
  }
  const bodyAssign = source.match(/const\s+(\w+)\s*=\s*req\.body\s*;?/);
  if (bodyAssign) {
    const pages = /NextApiRequest/.test(source);
    let code = ensureStripeClient(source, client);
    if (pages && !code.includes("bodyParser")) {
      code = insertAfterImports(code, `export const config = {\n  api: { bodyParser: false },\n};\n\n${rawBodyHelper(ts)}`);
    }
    const block = pages ? pagesBlock(bodyAssign[1], client) : expressBlock(bodyAssign[1], client);
    code = code.replace(bodyAssign[0], block);
    return {
      code,
      notes: ["Verify the Stripe signature with constructEvent. The route must receive the raw request body."],
    };
  }
  return null;
}

function ensureStripeClient(source: string, client: string): string {
  if (/\bnew\s+Stripe\b/.test(source)) return source;
  let next = source;
  if (!/from\s+["']stripe["']/.test(next) && !/require\(\s*["']stripe["']\s*\)/.test(next)) {
    const semi = usesSemicolons(next);
    next = insertImport(next, `import Stripe from "stripe"${semi ? ";" : ""}`);
  }
  return insertAfterImports(next, `const ${client} = new Stripe(process.env.STRIPE_SECRET_KEY || "");`);
}

function appHelper(client: string, ts: boolean): string {
  const signature = ts ? "(request: Request): Promise<Stripe.Event | Response>" : "(request)";
  return `async function readVerifiedStripeEvent${signature} {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return new Response("Missing Stripe signature", { status: 400 });
  }
  const rawBody = await request.text();
  try {
    return ${client}.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return new Response("Invalid Stripe signature", { status: 400 });
  }
}`;
}

function rawBodyHelper(ts: boolean): string {
  if (!ts) {
    return `async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}`;
  }
  return `async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}`;
}

function pagesBlock(varName: string, client: string): string {
  return `const rawBody = await readRawBody(req);
  const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).send("Missing Stripe signature");
    return;
  }
  let ${varName};
  try {
    ${varName} = ${client}.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    res.status(400).send("Invalid Stripe signature");
    return;
  }`;
}

function expressBlock(varName: string, client: string): string {
  return `const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).send("Missing Stripe signature");
    return;
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).send("Stripe webhook needs the raw body. Use express.raw({ type: 'application/json' }) on this route.");
    return;
  }
  let ${varName};
  try {
    ${varName} = ${client}.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    res.status(400).send("Invalid Stripe signature");
    return;
  }`;
}

function insertAfterImports(source: string, block: string): string {
  if (source.includes(block.slice(0, 40))) return source;
  const lines = source.split("\n");
  let last = -1;
  let inImport = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!inImport && trimmed.startsWith("import ")) inImport = true;
    if (!inImport) continue;
    last = index;
    if (/from\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed) || /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(trimmed)) {
      inImport = false;
    }
  }
  if (last === -1) return `${block}\n\n${source}`;
  lines.splice(last + 1, 0, "", block, "");
  return lines.join("\n");
}
