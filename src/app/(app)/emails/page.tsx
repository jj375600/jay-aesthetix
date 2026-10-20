import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureEmailTable } from "@/lib/email";
import { Badge } from "@/components/Badge";
import { SITE } from "@/lib/site";

export const metadata = { title: `Email log · ${SITE.name}` };

type Row = { id: number; to_email: string; subject: string; body: string; status: string; error: string | null; created_at: Date };

const when = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: SITE.studioTimezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function EmailLogPage() {
  await requireUser("trainer");
  await ensureEmailTable();
  const rows = await query<Row>(
    "SELECT id, to_email, subject, body, status, error, created_at FROM email_log ORDER BY id DESC LIMIT 50"
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Trainer</p>
          <h1>Email log</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Every email the app sends (booking confirmations, new-booking alerts, cancellations) is recorded here.
        <strong> logged</strong> means it was recorded but not delivered (no email provider configured);
        <strong> sent</strong> means it was delivered through Resend. The newest 50 are kept for 30 days.
      </p>
      <section className="card">
        {rows.length === 0 ? (
          <div className="empty">No emails yet. Book or cancel a session to see one appear.</div>
        ) : (
          rows.map((r) => (
            <details key={r.id}>
              <summary>
                <span>
                  <span className="muted">{when(r.created_at)}</span> · {r.subject} <span className="muted">→ {r.to_email}</span>
                </span>
                <Badge status={r.status} />
              </summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
              {r.error && <p style={{ color: "var(--bad)" }}>{r.error}</p>}
            </details>
          ))
        )}
      </section>
    </>
  );
}
