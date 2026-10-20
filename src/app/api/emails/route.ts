import { query } from "@/lib/db";
import { authed, fail, json } from "@/lib/api";

/** The trainer's email log: most recent first. Optional ?sessionId= narrows it to one session's emails. */
export async function GET(req: Request) {
  const [, err] = await authed("trainer");
  if (err) return err;

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (sessionId !== null && !/^\d{1,9}$/.test(sessionId)) return fail("Invalid sessionId", 422);

  const emails = await query(
    `SELECT id, to_email, subject, body, kind, status, error, session_id, created_at
       FROM email_log ${sessionId ? "WHERE session_id = $1" : ""} ORDER BY id DESC LIMIT 50`,
    sessionId ? [Number(sessionId)] : []
  );
  return json({ emails });
}
