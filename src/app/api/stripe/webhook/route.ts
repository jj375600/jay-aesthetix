import { NextResponse } from "next/server";
import { settleCheckoutSession, verifyWebhook, type CheckoutSession } from "@/lib/stripe";

/**
 * Stripe calls this when a payment completes. There is no login here: the signature IS the authentication,
 * so anything not signed with the webhook secret is rejected before the body is even parsed.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhooks are not configured" }, { status: 501 });

  const payload = await req.text(); // the raw text, exactly as Stripe signed it
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: CheckoutSession } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Other event types are acknowledged and ignored. Always answer 2xx for valid events so Stripe doesn't keep retrying.
  if (event.type === "checkout.session.completed" && event.data?.object) {
    await settleCheckoutSession(event.data.object);
  }
  return NextResponse.json({ received: true });
}
