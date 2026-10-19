import { query, queryOne } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { bookingSchema } from "@/lib/validators";
import { getTrainerId, isSlotBookable } from "@/lib/slots";
import { SITE } from "@/lib/site";

export async function GET() {
  const [user, err] = await authed();
  if (err) return err;
  const rows = await query(
    `SELECT s.id, s.session_date AS date, s.start_time AS time, s.status, s.type, s.notes,
            c.id AS client_id, c.name AS client_name
       FROM sessions s JOIN users c ON c.id = s.client_id
      WHERE ${user!.role === "trainer" ? "s.trainer_id" : "s.client_id"} = $1
      ORDER BY s.session_date, s.start_time`,
    [user!.id]
  );
  return json({ sessions: rows });
}

export async function POST(req: Request) {
  const [user, authErr] = await authed();
  if (authErr) return authErr;
  const [d, err] = await parse(req, bookingSchema);
  if (err) return err;

  const trainerId = await getTrainerId();
  if (!trainerId) return fail("No trainer configured", 500);

  let clientId: number;
  if (user!.role === "client") {
    clientId = user!.id;
    const profile = await queryOne("SELECT 1 FROM client_profiles WHERE user_id = $1", [clientId]);
    if (!profile) return fail("Please finish onboarding before booking", 409);
  } else {
    if (!d.clientId) return fail("Choose a client", 422);
    const c = await queryOne("SELECT 1 FROM users WHERE id = $1 AND role = 'client'", [d.clientId]);
    if (!c) return fail("Client not found", 404);
    clientId = d.clientId;
  }

  // 1) Friendly check: is this slot inside availability, in the future, and free?
  if (!(await isSlotBookable(trainerId, d.date, d.time))) {
    return fail("That time isn't available. Please pick another slot.", 409);
  }

  // 2) Real guarantee: a partial unique index in Postgres rejects a concurrent double-booking.
  try {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO sessions (trainer_id, client_id, session_date, start_time, duration_min, type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [trainerId, clientId, d.date, d.time, SITE.sessionMinutes, d.type]
    );
    // A lead becomes an active client the moment their first session is booked.
    await query("UPDATE client_profiles SET status = 'active' WHERE user_id = $1 AND status = 'lead'", [clientId]);
    return json({ ok: true, id: row!.id }, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return fail("Someone just booked that time. Please pick another slot.", 409);
    throw e;
  }
}
