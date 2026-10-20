import { queryOne } from "@/lib/db";
import { authed, fail, json } from "@/lib/api";
import { createCheckoutSession, stripeConfig } from "@/lib/stripe";

/** A client starts paying one of their own unpaid invoices: creates a Stripe Checkout Session (test mode). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const [user, authErr] = await authed("client");
  if (authErr) return authErr;

  const cfg = stripeConfig();
  if (!cfg) return fail("Online payments are not enabled on this deployment", 501);

  if (!/^\d{1,9}$/.test(idParam)) return fail("Invoice not found", 404);
  const inv = await queryOne<{ id: number; number: string; description: string; amount_cents: number; status: string; client_id: number; client_email: string }>(
    `SELECT i.id, i.number, i.description, i.amount_cents, i.status, i.client_id, c.email AS client_email
       FROM invoices i JOIN users c ON c.id = i.client_id WHERE i.id = $1`,
    [Number(idParam)]
  );
  if (!inv) return fail("Invoice not found", 404);
  if (inv.client_id !== user!.id) return fail("Not allowed", 403);
  if (inv.status !== "sent") return fail(`This invoice is already ${inv.status}`, 409);

  try {
    const session = await createCheckoutSession(cfg, inv, new URL(req.url).origin);
    if (!session.url) return fail("Could not start checkout", 502);
    return json({ url: session.url });
  } catch (e) {
    console.error("checkout failed:", e instanceof Error ? e.message : e);
    return fail("Could not reach the payment provider. Please try again.", 502);
  }
}
