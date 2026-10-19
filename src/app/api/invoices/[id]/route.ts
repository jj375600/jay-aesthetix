import { query, queryOne } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { invoicePatchSchema } from "@/lib/validators";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const [user, authErr] = await authed("trainer");
  if (authErr) return authErr;
  const [d, err] = await parse(req, invoicePatchSchema);
  if (err) return err;

  const inv = await queryOne<{ id: number }>("SELECT id FROM invoices WHERE id = $1 AND trainer_id = $2", [Number(idParam), user!.id]);
  if (!inv) return fail("Invoice not found", 404);

  await query(
    "UPDATE invoices SET status = $1, paid_date = CASE WHEN $1 = 'paid' THEN CURRENT_DATE ELSE NULL END WHERE id = $2",
    [d.status, inv.id]
  );
  return json({ ok: true });
}
