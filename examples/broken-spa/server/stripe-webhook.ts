import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function POST(req: Request) {
  const body = await req.json();
  if (body.type === "checkout.session.completed") {
    console.log(body.data.object.id);
  }
  return new Response("ok");
}
