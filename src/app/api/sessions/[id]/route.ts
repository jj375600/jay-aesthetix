import { query, queryOne } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { sessionPatchSchema } from "@/lib/validators";
import { hoursUntil } from "@/lib/slots";
import { SITE } from "@/lib/site";

type Row = { id: number; trainer_id: number; client_id: number; session_date: string; start_time: string; status: string };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const [user, authErr] = await authed();
  if (authErr) return authErr;
  const [d, err] = await parse(req, sessionPatchSchema);
  if (err) return err;

  const s = await queryOne<Row>("SELECT id, trainer_id, client_id, session_date, start_time, status FROM sessions WHERE id = $1", [Number(idParam)]);
  if (!s) return fail("Session not found", 404);

  const owns = user!.role === "trainer" ? s.trainer_id === user!.id : s.client_id === user!.id;
  if (!owns) return fail("Not allowed", 403);
  if (s.status !== "booked") return fail(`This session is already ${s.status}`, 409);

  if (d.status === "completed" && user!.role !== "trainer") return fail("Only the trainer can complete a session", 403);
  if (d.status === "cancelled" && user!.role === "client" && hoursUntil(s.session_date, s.start_time) < SITE.cancelWindowHours) {
    return fail(`Sessions can only be cancelled online up to ${SITE.cancelWindowHours} hours ahead. Please message Jay.`, 409);
  }

  await query("UPDATE sessions SET status = $1, notes = COALESCE($2, notes) WHERE id = $3", [d.status, d.notes ?? null, s.id]);
  return json({ ok: true });
}
