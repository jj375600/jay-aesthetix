import { query } from "./db";
import { SITE } from "./site";

// Sends an email and records it. Two modes:
//  - RESEND_API_KEY set   -> delivered through Resend (https://resend.com), status "sent" (or "failed")
//  - RESEND_API_KEY unset -> nothing leaves the server; status "logged". The trainer still sees the email
//                            on the Email log page, so the feature is visible on a public demo.
// Sending must never break the action that triggered it (a booking still succeeds if email is down),
// so sendEmail never throws.

export type EmailKind = "booking_confirmation" | "booking_alert" | "cancellation" | "payment_receipt" | "payment_alert";
export type OutgoingEmail = { to: string; subject: string; text: string; kind: EmailKind; sessionId?: number };

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  // Created on first use so deploying this doesn't need a manual migration. Also in db/schema.sql.
  tableReady ??= query(
    `CREATE TABLE IF NOT EXISTS email_log (
       id         BIGSERIAL PRIMARY KEY,
       to_email   TEXT NOT NULL,
       subject    TEXT NOT NULL,
       body       TEXT NOT NULL,
       kind       TEXT NOT NULL,
       status     TEXT NOT NULL CHECK (status IN ('logged', 'sent', 'failed')),
       error      TEXT,
       session_id INTEGER,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at DESC);
     CREATE INDEX IF NOT EXISTS email_log_session_idx ON email_log (session_id)`
  ).catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

export async function ensureEmailTable() {
  await ensureTable();
}

export async function sendEmail(mail: OutgoingEmail): Promise<void> {
  try {
    await ensureTable();
    const subject = mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
    let status: "logged" | "sent" | "failed" = "logged";
    let error: string | null = null;

    const key = process.env.RESEND_API_KEY;
    if (key) {
      try {
        const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM ?? `${SITE.name} <onboarding@resend.dev>`,
            to: [mail.to],
            subject,
            text: mail.text,
          }),
          signal: AbortSignal.timeout(3000), // a slow provider must not hold up the booking
        });
        if (res.ok) status = "sent";
        else {
          status = "failed";
          error = `Email provider responded with HTTP ${res.status}`;
        }
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message.slice(0, 200) : "Could not reach the email provider";
      }
    }

    await query(
      `INSERT INTO email_log (to_email, subject, body, kind, status, error, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mail.to, subject, mail.text, mail.kind, status, error, mail.sessionId ?? null]
    );
    await query("DELETE FROM email_log WHERE created_at < now() - interval '30 days'"); // keep the table small
  } catch (e) {
    console.error("sendEmail failed:", e instanceof Error ? e.message : e);
  }
}
