import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(req: Request) {
  const raw = await req.text();
  const header = req.headers.get("stripe-signature") ?? "";
  const expected = createHmac("sha256", "secret").update(raw).digest();
  const got = Buffer.from(header, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return new Response("no", { status: 401 });
  }
  return new Response("ok");
}
