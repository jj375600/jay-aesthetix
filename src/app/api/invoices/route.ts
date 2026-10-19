import { query, queryOne } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { invoiceSchema } from "@/lib/validators";

export async function GET() {
  const [user, err] = await authed();
  if (err) return err;
  const rows = await query(
    `SELECT i.id, i.number, i.description, i.amount_cents AS "amountCents", i.issued_date AS "issuedDate",
            i.due_date AS "dueDate", i.status, i.paid_date AS "paidDate", c.name AS "clientName"
       FROM invoices i JOIN users c ON c.id = i.client_id
      WHERE ${user!.role === "trainer" ? "i.trainer_id" : "i.client_id"} = $1
      ORDER BY i.issued_date DESC, i.id DESC`,
    [user!.id]
  );
  return json({ invoices: rows });
}

export async function POST(req: Request) {
  const [user, authErr] = await authed("trainer");
  if (authErr) return authErr;
  const [d, err] = await parse(req, invoiceSchema);
  if (err) return err;

  const c = await queryOne("SELECT 1 FROM users WHERE id = $1 AND role = 'client'", [d.clientId]);
  if (!c) return fail("Client not found", 404);

  // Grab the next id first so the human-readable number (INV-0011) always matches it.
  const row = await queryOne<{ id: number; number: string }>(
    `WITH n AS (SELECT nextval(pg_get_serial_sequence('invoices','id'))::int AS id)
     INSERT INTO invoices (id, number, trainer_id, client_id, description, amount_cents, due_date, status)
     SELECT n.id, 'INV-' || lpad(n.id::text, 4, '0'), $1, $2, $3, $4, $5, 'sent' FROM n
     RETURNING id, number`,
    [user!.id, d.clientId, d.description, Math.round(d.amount * 100), d.dueDate]
  );
  return json({ ok: true, invoice: row }, 201);
}
