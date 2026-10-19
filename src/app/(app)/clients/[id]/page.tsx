import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { todayInStudio } from "@/lib/slots";
import { fmtDate, fmtTime, money } from "@/lib/format";
import { Badge, invoiceDisplayStatus } from "@/components/Badge";
import { BodyChart, StrengthChart, type Entry } from "@/components/Charts";
import { ProgressForm } from "@/components/ProgressForm";
import { SITE } from "@/lib/site";

export const metadata = { title: `Client · ${SITE.name}` };

export default async function ClientDetail({ params }: { params: { id: string } }) {
  await requireUser("trainer");
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const client = await queryOne<{
    id: number; name: string; email: string; phone: string | null; goal: string | null; experience: string | null;
    target_weight: number | null; injuries: string | null; medical_notes: string | null; par_q_flags: string[] | null;
    sessions_per_week: number | null; preferred_days: string[] | null; preferred_time: string | null; status: string | null;
  }>(
    `SELECT u.id, u.name, u.email, p.phone, p.goal, p.experience, p.target_weight, p.injuries, p.medical_notes,
            p.par_q_flags, p.sessions_per_week, p.preferred_days, p.preferred_time, p.status
       FROM users u LEFT JOIN client_profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.role = 'client'`,
    [id]
  );
  if (!client) notFound();

  const today = todayInStudio();
  const [entries, sessions, invoices] = await Promise.all([
    query<Entry>(
      `SELECT entry_date AS "entryDate", weight_lb AS "weightLb", body_fat_pct AS "bodyFatPct", bench_lb AS "benchLb",
              squat_lb AS "squatLb", deadlift_lb AS "deadliftLb" FROM progress_entries WHERE client_id = $1 ORDER BY entry_date`,
      [id]
    ),
    query<{ date: string; time: string; status: string; type: string }>(
      "SELECT session_date AS date, start_time AS time, status, type FROM sessions WHERE client_id = $1 ORDER BY session_date DESC, start_time DESC LIMIT 8",
      [id]
    ),
    query<{ number: string; description: string; amount_cents: number; due_date: string; status: string }>(
      "SELECT number, description, amount_cents, due_date, status FROM invoices WHERE client_id = $1 ORDER BY issued_date DESC, id DESC LIMIT 6",
      [id]
    ),
  ]);

  const flags = client.par_q_flags ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow"><Link href="/clients" className="accent">← Clients</Link></p>
          <h1>{client.name}</h1>
        </div>
        {client.status && <Badge status={client.status} />}
      </div>

      <div className="two-col wide-left">
        <div className="grid">
          <section className="card"><div className="panel-title"><h2>Body composition</h2></div><BodyChart entries={entries} /></section>
          <section className="card"><div className="panel-title"><h2>Strength</h2></div><StrengthChart entries={entries} /></section>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <section className="card">
            <div className="panel-title"><h2>Profile</h2></div>
            {client.goal ? (
              <dl style={{ margin: 0, display: "grid", gap: 10 }}>
                <div><dt className="hint">Goal</dt><dd style={{ margin: 0 }}>{client.goal}</dd></div>
                <div><dt className="hint">Experience</dt><dd style={{ margin: 0 }}><span style={{ textTransform: "capitalize" }}>{client.experience}</span>{client.target_weight ? ` · target ${client.target_weight} lb` : ""}</dd></div>
                <div><dt className="hint">Prefers</dt><dd style={{ margin: 0 }}>{(client.preferred_days ?? []).join(", ")} · {client.preferred_time} · {client.sessions_per_week}×/week</dd></div>
                <div><dt className="hint">Injuries / limits</dt><dd style={{ margin: 0 }}>{client.injuries || "None listed"}</dd></div>
                <div>
                  <dt className="hint">Health screening flags</dt>
                  <dd style={{ margin: 0 }}>
                    {flags.length === 0 ? "None checked" : <ul style={{ margin: 0, paddingLeft: 18, color: "var(--warn)" }}>{flags.map((f) => <li key={f}>{f}</li>)}</ul>}
                  </dd>
                </div>
                {client.medical_notes && <div><dt className="hint">Notes</dt><dd style={{ margin: 0 }}>{client.medical_notes}</dd></div>}
              </dl>
            ) : <div className="empty">This client hasn&apos;t finished onboarding.</div>}
          </section>

          <section className="card">
            <div className="panel-title"><h2>Log a check-in</h2></div>
            <ProgressForm clientId={client.id} today={today} />
          </section>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <section className="card">
          <div className="panel-title"><h2>Recent sessions</h2></div>
          {sessions.length === 0 ? <div className="empty">No sessions yet.</div> : (
            <div className="table-wrap"><table><tbody>
              {sessions.map((s, i) => <tr key={i}><td>{fmtDate(s.date)}</td><td>{fmtTime(s.time)}</td><td className="muted">{s.type}</td><td><Badge status={s.status} /></td></tr>)}
            </tbody></table></div>
          )}
        </section>
        <section className="card">
          <div className="panel-title"><h2>Invoices</h2><Link href="/invoices" className="accent">Manage →</Link></div>
          {invoices.length === 0 ? <div className="empty">No invoices yet.</div> : (
            <div className="table-wrap"><table><tbody>
              {invoices.map((v) => (
                <tr key={v.number}><td>{v.number}</td><td className="muted">{v.description}</td><td><Badge status={invoiceDisplayStatus(v.status, v.due_date, today)} /></td><td className="num">{money(v.amount_cents)}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </section>
      </div>
    </>
  );
}
