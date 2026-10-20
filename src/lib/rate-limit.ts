import { query, queryOne } from "./db";

// Brute-force protection for login. Failed attempts are stored in Postgres (not in memory)
// because a serverless host like Vercel runs many short-lived instances that share no memory.
//
//  - 5 failed attempts for one email in 15 minutes  -> that email is locked for the rest of the window
//  - 50 failed attempts from one IP in 15 minutes   -> that IP is blocked (stops "try one password on every account")
//
// Failures are keyed on the email that was *typed*, whether or not the account exists, so a lockout
// can't be used to find out which emails are registered.
export const WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 50;

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  // Created on first use so deploying this doesn't require a manual migration. Also in db/schema.sql.
  tableReady ??= query(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       id         BIGSERIAL PRIMARY KEY,
       email      TEXT NOT NULL,
       ip         TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
     CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at)`
  ).catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

/** The caller's IP. On Vercel the platform sets x-forwarded-for itself, so it can be trusted there. */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Seconds until the caller may try again, or null if they're allowed to attempt a login now. */
export async function loginRetryAfter(email: string, ip: string): Promise<number | null> {
  await ensureTable();
  const row = await queryOne<{ email_n: number; ip_n: number; email_wait: number | null; ip_wait: number | null }>(
    `SELECT
       count(*) FILTER (WHERE email = $1)::int AS email_n,
       count(*) FILTER (WHERE ip = $2)::int AS ip_n,
       ceil(extract(epoch FROM (min(created_at) FILTER (WHERE email = $1) + make_interval(mins => $3) - now())))::int AS email_wait,
       ceil(extract(epoch FROM (min(created_at) FILTER (WHERE ip = $2) + make_interval(mins => $3) - now())))::int AS ip_wait
     FROM login_attempts
     WHERE created_at > now() - make_interval(mins => $3) AND (email = $1 OR ip = $2)`,
    [email, ip, WINDOW_MINUTES]
  );
  if (!row) return null;
  const waits: number[] = [];
  if (row.email_n >= MAX_FAILURES_PER_EMAIL && row.email_wait) waits.push(row.email_wait);
  if (row.ip_n >= MAX_FAILURES_PER_IP && row.ip_wait) waits.push(row.ip_wait);
  return waits.length ? Math.max(1, ...waits) : null;
}

export async function recordLoginFailure(email: string, ip: string) {
  await ensureTable();
  await query("INSERT INTO login_attempts (email, ip) VALUES ($1, $2)", [email, ip]);
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'"); // keep the table small
}

/** A correct password clears that email's failures, so a real user who mistyped isn't punished later. */
export async function clearLoginFailures(email: string) {
  await ensureTable();
  await query("DELETE FROM login_attempts WHERE email = $1", [email]);
}
