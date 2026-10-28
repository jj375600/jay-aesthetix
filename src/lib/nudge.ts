import { createHmac, randomUUID } from "node:crypto";
import { queryOne } from "./db";
import { SITE } from "./site";

/**
 * Tells the jay-nudge text-message bot what happened here (someone opted in, booked, cancelled).
 *
 * Rules this file keeps:
 *  - It does nothing unless NUDGE_URL and NUDGE_EVENTS_SECRET are set, so the site works on its own.
 *  - It never throws and never waits long. A booking must not fail, or slow down, because the bot is down.
 *  - It only ever sends events about clients who ticked the SMS consent box.
 *  - Every request is signed (HMAC-SHA256 over a timestamp and the body), so the bot can trust it.
 */

const TIMEOUT_MS = 2000;
const ATTEMPTS = 2; // the second attempt reuses the same eventId, so the bot treats it as the same event

export type NudgeEvent =
  | { type: "client.opted_in"; client: NudgeClient }
  | { type: "client.opted_out"; client: { id: string } }
  | { type: "session.booked"; client: NudgeClient; session: { id: string; date: string; startTime: string; focus: string } }
  | { type: "session.cancelled"; session: { id: string } };

type NudgeClient = { id: string; name: string; phone: string; timezone: string };

export function nudgeEnabled(): boolean {
  return Boolean(process.env.NUDGE_URL && process.env.NUDGE_EVENTS_SECRET);
}

/** Same scheme as Stripe: "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>". */
export function signBody(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Sends one event. Resolves true if the bot accepted it; never rejects. */
export async function sendNudgeEvent(event: NudgeEvent): Promise<boolean> {
  if (!nudgeEnabled()) return false;
  const url = `${process.env.NUDGE_URL!.replace(/\/+$/, "")}/events`;
  const body = JSON.stringify({ eventId: randomUUID(), ...event });

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-nudge-signature": signBody(process.env.NUDGE_EVENTS_SECRET!, body) },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return true;
      if (res.status < 500 && res.status !== 429) {
        console.error(`nudge: ${event.type} refused (${res.status})`); // retrying a 4xx would only get the same answer
        return false;
      }
    } catch {
      // timeout or connection refused: try once more, then give up quietly
    }
  }
  console.error(`nudge: could not deliver ${event.type}`);
  return false;
}

type ClientRow = { id: number; name: string; phone: string | null; sms_consent: boolean };

const loadClient = (userId: number) =>
  queryOne<ClientRow>(
    `SELECT u.id, u.name, p.phone, p.sms_consent
       FROM users u JOIN client_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId]
  );

const asClient = (c: ClientRow): NudgeClient => ({
  id: String(c.id), name: c.name, phone: c.phone!, timezone: SITE.studioTimezone,
});

/** After onboarding is saved: tell the bot about the client's consent, given or withdrawn. */
export async function nudgeConsentChanged(userId: number, wasConsenting: boolean): Promise<void> {
  try {
    if (!nudgeEnabled()) return;
    const c = await loadClient(userId);
    if (!c) return;
    if (c.sms_consent && c.phone) await sendNudgeEvent({ type: "client.opted_in", client: asClient(c) });
    else if (wasConsenting) await sendNudgeEvent({ type: "client.opted_out", client: { id: String(c.id) } });
  } catch (e) {
    console.error("nudge: consent update failed:", e instanceof Error ? e.message : e);
  }
}

/** After a booking: only for clients who consented to texts. */
export async function nudgeBooked(sessionId: number): Promise<void> {
  try {
    if (!nudgeEnabled()) return;
    const s = await queryOne<{ id: number; date: string; time: string; type: string; client_id: number }>(
      `SELECT id, session_date AS date, start_time AS time, type, client_id FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (!s) return;
    const c = await loadClient(s.client_id);
    if (!c?.sms_consent || !c.phone) return;
    await sendNudgeEvent({
      type: "session.booked",
      client: asClient(c),
      session: { id: String(s.id), date: s.date, startTime: s.time, focus: s.type },
    });
  } catch (e) {
    console.error("nudge: booking update failed:", e instanceof Error ? e.message : e);
  }
}

/** After a cancellation, so the bot drops that session's reminders. */
export async function nudgeCancelled(sessionId: number): Promise<void> {
  try {
    if (!nudgeEnabled()) return;
    const s = await queryOne<{ client_id: number }>("SELECT client_id FROM sessions WHERE id = $1", [sessionId]);
    if (!s) return;
    const c = await loadClient(s.client_id);
    if (!c?.sms_consent) return;
    await sendNudgeEvent({ type: "session.cancelled", session: { id: String(sessionId) } });
  } catch (e) {
    console.error("nudge: cancellation update failed:", e instanceof Error ? e.message : e);
  }
}
