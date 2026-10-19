import { query, queryOne } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { progressSchema } from "@/lib/validators";

export async function GET(req: Request) {
  const [user, err] = await authed();
  if (err) return err;
  const requested = Number(new URL(req.url).searchParams.get("clientId"));
  const clientId = user!.role === "client" ? user!.id : requested;
  if (!clientId) return fail("clientId is required", 422);
  const rows = await query(
    `SELECT id, entry_date AS "entryDate", weight_lb AS "weightLb", body_fat_pct AS "bodyFatPct",
            bench_lb AS "benchLb", squat_lb AS "squatLb", deadlift_lb AS "deadliftLb", note
       FROM progress_entries WHERE client_id = $1 ORDER BY entry_date`,
    [clientId]
  );
  return json({ entries: rows });
}

export async function POST(req: Request) {
  const [user, authErr] = await authed();
  if (authErr) return authErr;
  const [d, err] = await parse(req, progressSchema);
  if (err) return err;

  let clientId = user!.id;
  if (user!.role === "trainer") {
    if (!d.clientId) return fail("Choose a client", 422);
    const c = await queryOne("SELECT 1 FROM users WHERE id = $1 AND role = 'client'", [d.clientId]);
    if (!c) return fail("Client not found", 404);
    clientId = d.clientId;
  }
  await query(
    `INSERT INTO progress_entries (client_id, entry_date, weight_lb, body_fat_pct, bench_lb, squat_lb, deadlift_lb, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [clientId, d.entryDate, d.weightLb, d.bodyFatPct, d.benchLb, d.squatLb, d.deadliftLb, d.note || null]
  );
  return json({ ok: true }, 201);
}
