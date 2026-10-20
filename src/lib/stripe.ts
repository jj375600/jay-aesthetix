import crypto from "node:crypto";
import { queryOne } from "./db";
import { sendEmail } from "./email";
import { money } from "./format";
import { SITE } from "./site";

// Stripe Checkout in TEST MODE ONLY. Card details are typed into Stripe's own hosted page and never touch
// this server. Talks to Stripe's REST API with fetch (no SDK), so the whole flow is visible in this file.
//
//   1. Client clicks "Pay now"      -> POST /api/invoices/:id/checkout creates a Checkout Session
//   2. Client pays on Stripe's page -> redirected back to /invoices?checkout=success&session_id=...
//   3. We mark the invoice paid from TWO independent signals, whichever arrives first:
//        a) the webhook (Stripe -> us, signature-verified)       b) re-fetching the session from Stripe on return
//      Both go through settleCheckoutSession(), which is idempotent and checks the amount.

export type StripeConfig = { key: string; base: string };

/** null when payments aren't configured. Live keys are refused on purpose: this demo must never charge real money. */
export function stripeConfig(): StripeConfig | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  return { key, base: process.env.STRIPE_API_BASE ?? "https://api.stripe.com" };
}

export type CheckoutSession = {
  id: string;
  url?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  metadata?: Record<string, string>;
};

async function stripeFetch(cfg: StripeConfig, path: string, init: { method: "GET" | "POST"; form?: URLSearchParams }) {
  const res = await fetch(cfg.base + path, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Stripe responded with HTTP ${res.status}`);
  return (await res.json()) as CheckoutSession;
}

export type InvoiceForCheckout = { id: number; number: string; description: string; amount_cents: number; client_email: string };

export function createCheckoutSession(cfg: StripeConfig, inv: InvoiceForCheckout, origin: string) {
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(inv.amount_cents),
    "line_items[0][price_data][product_data][name]": `Invoice ${inv.number}`,
    "line_items[0][price_data][product_data][description]": inv.description.slice(0, 250),
    customer_email: inv.client_email,
    client_reference_id: String(inv.id),
    "metadata[invoice_id]": String(inv.id),
    success_url: `${origin}/invoices?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/invoices?checkout=cancelled`,
  });
  return stripeFetch(cfg, "/v1/checkout/sessions", { method: "POST", form });
}

export function retrieveCheckoutSession(cfg: StripeConfig, id: string) {
  return stripeFetch(cfg, `/v1/checkout/sessions/${encodeURIComponent(id)}`, { method: "GET" });
}

/**
 * Verifies a webhook really came from Stripe. The Stripe-Signature header looks like `t=1700000000,v1=<hex>`,
 * where v1 = HMAC-SHA256(webhook secret, `${t}.${raw body}`). A timestamp older than 5 minutes is rejected so a
 * captured request can't be replayed later.
 */
export function verifyWebhook(payload: string, header: string | null, secret: string, nowMs = Date.now(), toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts.v1, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Signs a payload the way Stripe does. Used by the tests. */
export function signWebhook(payload: string, secret: string, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

/**
 * Marks the invoice behind a paid Checkout Session as paid. Safe to call any number of times, from the webhook
 * and the return page at once: only the call that flips 'sent' -> 'paid' sends the receipts.
 * Returns "paid" (this call, or an earlier one, settled it) or "ignored" (not paid, wrong amount, unknown invoice).
 */
export async function settleCheckoutSession(session: CheckoutSession): Promise<"paid" | "ignored"> {
  if (session.payment_status !== "paid") return "ignored";
  const id = Number(session.metadata?.invoice_id);
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) return "ignored";

  const inv = await queryOne<{ amount_cents: number; status: string }>("SELECT amount_cents, status FROM invoices WHERE id = $1", [id]);
  if (!inv) return "ignored";
  // What Stripe actually charged must equal what we invoiced, or a tampered/mismatched session could mark it paid.
  if (session.amount_total !== inv.amount_cents || session.currency !== "usd") return "ignored";
  if (inv.status === "paid") return "paid";

  const row = await queryOne<{ number: string; amount_cents: number; client_name: string; client_email: string; trainer_email: string }>(
    `UPDATE invoices i SET status = 'paid', paid_date = CURRENT_DATE
       FROM users c, users t
      WHERE i.id = $1 AND i.status = 'sent' AND c.id = i.client_id AND t.id = i.trainer_id
  RETURNING i.number, i.amount_cents, c.name AS client_name, c.email AS client_email, t.email AS trainer_email`,
    [id]
  );
  if (!row) return "paid"; // another request got there first (or it was voided meanwhile)

  const amount = money(row.amount_cents);
  await Promise.all([
    sendEmail({
      kind: "payment_receipt",
      to: row.client_email,
      subject: `Payment received: ${row.number} (${amount})`,
      text: `Hi ${row.client_name.split(" ")[0]},\n\nThanks! We received your payment of ${amount} for invoice ${row.number}.\n\n— ${SITE.trainerName}\n${SITE.name} · ${SITE.location}\n`,
    }),
    sendEmail({
      kind: "payment_alert",
      to: row.trainer_email,
      subject: `Paid: ${row.number}, ${row.client_name} (${amount})`,
      text: `${row.client_name} paid invoice ${row.number} (${amount}) online.\n`,
    }),
  ]);
  return "paid";
}

