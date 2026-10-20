import { queryOne } from "./db";
import { sendEmail } from "./email";
import { fmtDate, fmtDateLong, fmtTime } from "./format";
import { SITE } from "./site";

type SessionInfo = {
  id: number; date: string; time: string; type: string;
  client_name: string; client_email: string; trainer_name: string; trainer_email: string;
};

async function load(sessionId: number) {
  return queryOne<SessionInfo>(
    `SELECT s.id, s.session_date AS date, s.start_time AS time, s.type,
            c.name AS client_name, c.email AS client_email, t.name AS trainer_name, t.email AS trainer_email
       FROM sessions s JOIN users c ON c.id = s.client_id JOIN users t ON t.id = s.trainer_id
      WHERE s.id = $1`,
    [sessionId]
  );
}

const firstName = (full: string) => full.split(" ")[0];
const when = (s: SessionInfo) => `${fmtDateLong(s.date)} at ${fmtTime(s.time)}`;
const signoff = `\n— ${SITE.trainerName}\n${SITE.name} · ${SITE.location}\n`;

/** After a booking: confirms it to the client, and tells the trainer when the client booked it themselves. */
export async function notifyBooked(origin: string, sessionId: number, bookedBy: "client" | "trainer") {
  try {
    await sendBookedEmails(origin, sessionId, bookedBy);
  } catch (e) {
    console.error("booking emails failed:", e instanceof Error ? e.message : e); // never fail a booking over email
  }
}

async function sendBookedEmails(origin: string, sessionId: number, bookedBy: "client" | "trainer") {
  const s = await load(sessionId);
  if (!s) return;

  // Sent at the same time, so a slow email provider delays the booking response once, not twice.
  await Promise.all([
    sendEmail({
      kind: "booking_confirmation",
      sessionId: s.id,
      to: s.client_email,
      subject: `Session confirmed: ${fmtDate(s.date)} at ${fmtTime(s.time)}`,
      text:
        `Hi ${firstName(s.client_name)},\n\n` +
        `You're booked! Here are the details:\n\n` +
        `  When:  ${when(s)}\n` +
        `  Focus: ${s.type}\n` +
        `  Where: ${SITE.location} (gym details confirmed by ${SITE.trainerName})\n\n` +
        `Add it to your calendar: ${origin}/api/sessions/${s.id}/calendar\n` +
        `(You may need to sign in first.)\n\n` +
        `You can cancel online up to ${SITE.cancelWindowHours} hours before the session.\n` +
        signoff,
    }),
    bookedBy === "client"
      ? sendEmail({
          kind: "booking_alert",
          sessionId: s.id,
          to: s.trainer_email,
          subject: `New booking: ${s.client_name}, ${fmtDate(s.date)} at ${fmtTime(s.time)}`,
          text: `${s.client_name} booked a session.\n\n  When:  ${when(s)}\n  Focus: ${s.type}\n\nSee it on your dashboard: ${origin}/dashboard\n`,
        })
      : Promise.resolve(),
  ]);
}

/** After a cancellation: tells the other side (the client if the trainer cancelled, the trainer if the client did). */
export async function notifyCancelled(origin: string, sessionId: number, cancelledBy: "client" | "trainer") {
  try {
    await sendCancelledEmails(origin, sessionId, cancelledBy);
  } catch (e) {
    console.error("cancellation emails failed:", e instanceof Error ? e.message : e);
  }
}

async function sendCancelledEmails(origin: string, sessionId: number, cancelledBy: "client" | "trainer") {
  const s = await load(sessionId);
  if (!s) return;

  if (cancelledBy === "trainer") {
    await sendEmail({
      kind: "cancellation",
      sessionId: s.id,
      to: s.client_email,
      subject: `Session cancelled: ${fmtDate(s.date)} at ${fmtTime(s.time)}`,
      text:
        `Hi ${firstName(s.client_name)},\n\n` +
        `Your session on ${when(s)} has been cancelled.\n\n` +
        `You can book another time here: ${origin}/book\n` +
        signoff,
    });
  } else {
    await sendEmail({
      kind: "cancellation",
      sessionId: s.id,
      to: s.trainer_email,
      subject: `Cancelled: ${s.client_name}, ${fmtDate(s.date)} at ${fmtTime(s.time)}`,
      text: `${s.client_name} cancelled their session on ${when(s)}.\n\nThat time is open again for booking.\n`,
    });
  }
}
