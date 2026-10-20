import { queryOne } from "@/lib/db";
import { authed, fail } from "@/lib/api";
import { buildIcs } from "@/lib/ics";
import { SITE } from "@/lib/site";

type Row = {
  id: number; trainer_id: number; client_id: number; date: string; time: string;
  duration_min: number; type: string; status: string; client_name: string;
};

/** Downloads one booked session as an .ics file ("Add to calendar"). Only its client or trainer may fetch it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const [user, authErr] = await authed();
  if (authErr) return authErr;

  // Postgres INTEGER tops out at 2,147,483,647; anything else can't exist (and would make the query throw).
  if (!/^\d{1,10}$/.test(idParam) || Number(idParam) > 2_147_483_647) return fail("Session not found", 404);

  const s = await queryOne<Row>(
    `SELECT s.id, s.trainer_id, s.client_id, s.session_date AS date, s.start_time AS time,
            s.duration_min, s.type, s.status, c.name AS client_name
       FROM sessions s JOIN users c ON c.id = s.client_id WHERE s.id = $1`,
    [Number(idParam)]
  );
  if (!s) return fail("Session not found", 404);

  const owns = user!.role === "trainer" ? s.trainer_id === user!.id : s.client_id === user!.id;
  if (!owns) return fail("Not allowed", 403);
  if (s.status !== "booked") return fail(`This session is ${s.status}`, 409);

  const isTrainer = user!.role === "trainer";
  const ics = buildIcs({
    id: s.id,
    date: s.date,
    time: s.time,
    durationMin: s.duration_min,
    summary: isTrainer ? `Session with ${s.client_name}` : `Training session with ${SITE.trainerName}`,
    description: isTrainer
      ? `${s.type} with ${s.client_name} · ${SITE.name}`
      : `${s.type} with ${SITE.name}. You can cancel online up to ${SITE.cancelWindowHours} hours before the session.`,
    location: `${SITE.location} (gym details confirmed by ${SITE.trainerName})`,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="jay-aesthetix-session-${s.date}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
