import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const event = req.body;
  if (event.type === "checkout.session.completed") {
    res.status(200).json({ id: event.data.object.id });
    return;
  }
  res.status(200).json({ received: true });
}
