import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { todayInStudio } from "@/lib/slots";
import { fmtDate, fmtDateLong, fmtTime, money } from "@/lib/format";
import { Badge, invoiceDisplayStatus } from "@/components/Badge";
import { SessionActions } from "@/components/SessionActions";
import { RevenueChart } from "@/components/Charts";
import { hoursUntil } from "@/lib/slots";
import { SITE } from "@/lib/site";

export const metadata = { title: `Dashboard · ${SITE.name}` };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const { booked } = await searchParams;
  const user = await requireUser();
  return user.role === "trainer" ? <TrainerDashboard user={user} /> : <ClientDashboard user={user} justBooked={booked === "1"} />;
}

/* ------------------------------ CLIENT ------------------------------ */
async function ClientDashboard({ user, justBooked }: { user: SessionUser; justBooked: boolean }) {
  const profile = await queryOne("SELECT 1 FROM client_profiles WHERE user_id = $1", [user.id]);
  if (!profile) redirect("/onboarding");

  const today = todayInStudio();
  const upcoming = await query<{ id: number; date: string; time: string; type: string }>(
    `SELECT id, session_date AS date, start_time AS time, type FROM sessions
      WHERE client_id = $1 AND status = 'booked' AND session_date >= $2 ORDER BY session_date, start_time`,
    [user.id, today]
  );
  const stats = await queryOne<{ done: number; owed: number }>(
    `SELECT (SELECT count(*) FROM sessions WHERE client_id = $1 AND status = 'completed') AS done,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM invoices WHERE client_id = $1 AND status = 'sent') AS owed`,
    [user.id]
  );
  const weights = await query<{ weight_lb: number }>(
    "SELECT weight_lb FROM progress_entries WHERE client_id = $1 AND weight_lb IS NOT NULL ORDER BY entry_date",
    [user.id]
  );
  const change = weights.length >= 2 ? weights[weights.length - 1].weight_lb - weights[0].weight_lb : null;
  const next = upcoming[0];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Client portal</p>
          <h1>Hey, {user.name.split(" ")[0]}</h1>
        </div>
        <Link href="/book" className="btn btn-primary">Book a session</Link>
      </div>

      {justBooked && <div className="alert ok" role="status" style={{ marginBottom: 20 }}>You&apos;re booked! See you in the gym.</div>}

      <div className="kpis">
        <div className="kpi"><div className="label">Next session</div><div className="value" style={{ fontSize: "1.7rem" }}>{next ? fmtDate(next.date) : "None yet"}</div><div className="sub">{next ? `${fmtTime(next.time)} · ${next.type}` : "Pick a time to get started"}</div></div>
        <div className="kpi"><div className="label">Sessions completed</div><div className="value">{stats?.done ?? 0}</div></div>
        <div className="kpi"><div className="label">Weight change</div><div className="value">{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)} lb`}</div><div className="sub">since first check-in</div></div>
        <div className="kpi"><div className="label">Balance due</div><div className="value">{money(stats?.owed ?? 0)}</div></div>
      </div>

      <section className="card">
        <div className="panel-title"><h2>Upcoming sessions</h2></div>
        {upcoming.length === 0 ? (
          <div className="empty">No sessions booked. <Link href="/book" className="accent">Find a time →</Link></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Time</th><th>Focus</th><th /></tr></thead>
              <tbody>
                {upcoming.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateLong(s.date)}</td><td>{fmtTime(s.time)}</td><td>{s.type}</td>
                    <td><SessionActions id={s.id} role="client" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>You can cancel online up to {SITE.cancelWindowHours} hours before a session.</p>
      </section>
    </>
  );
}

/* ------------------------------ TRAINER ------------------------------ */
async function TrainerDashboard({ user }: { user: SessionUser }) {
  const today = todayInStudio();
  const monthStart = today.slice(0, 7) + "-01";

  const kpi = await queryOne<{ active: number; week: number; outstanding: number; month: number }>(
    `SELECT
       (SELECT count(*) FROM client_profiles WHERE status = 'active') AS active,
       (SELECT count(*) FROM sessions WHERE trainer_id = $1 AND status = 'booked'
          AND session_date >= $2::date AND session_date < $2::date + 7) AS week,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM invoices WHERE trainer_id = $1 AND status = 'sent') AS outstanding,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM invoices WHERE trainer_id = $1 AND status = 'paid' AND paid_date >= $3::date) AS month`,
    [user.id, today, monthStart]
  );

  const revenue = await query<{ month: string; revenue: number }>(
    `SELECT to_char(m, 'Mon') AS month, COALESCE(SUM(i.amount_cents), 0) / 100.0 AS revenue
       FROM generate_series(date_trunc('month', $1::date) - interval '5 months', date_trunc('month', $1::date), interval '1 month') m
       LEFT JOIN invoices i ON i.status = 'paid' AND i.trainer_id = $2 AND date_trunc('month', i.paid_date) = m
      GROUP BY m ORDER BY m`,
    [today, user.id]
  );

  const sessions = await query<{ id: number; date: string; time: string; type: string; client: string; client_id: number }>(
    `SELECT s.id, s.session_date AS date, s.start_time AS time, s.type, c.name AS client, c.id AS client_id
       FROM sessions s JOIN users c ON c.id = s.client_id
      WHERE s.trainer_id = $1 AND s.status = 'booked' AND s.session_date >= $2::date AND s.session_date < $2::date + 14
      ORDER BY s.session_date, s.start_time`,
    [user.id, today]
  );

  // Sessions whose start time has passed but are still marked "booked": needs a Complete click.
  const toClose = await query<{ id: number; date: string; time: string; client: string }>(
    `SELECT s.id, s.session_date AS date, s.start_time AS time, c.name AS client
       FROM sessions s JOIN users c ON c.id = s.client_id
      WHERE s.trainer_id = $1 AND s.status = 'booked' AND s.session_date <= $2::date ORDER BY s.session_date, s.start_time`,
    [user.id, today]
  );
  const needsClosing = toClose.filter((s) => hoursUntil(s.date, s.time) < 0);

  const overdue = await query<{ number: string; client: string; amount_cents: number; due_date: string }>(
    `SELECT i.number, c.name AS client, i.amount_cents, i.due_date FROM invoices i JOIN users c ON c.id = i.client_id
      WHERE i.trainer_id = $1 AND i.status = 'sent' AND i.due_date < $2::date ORDER BY i.due_date`,
    [user.id, today]
  );

  const leads = await query<{ id: number; name: string; goal: string }>(
    "SELECT u.id, u.name, p.goal FROM client_profiles p JOIN users u ON u.id = p.user_id WHERE p.status = 'lead' ORDER BY p.completed_at DESC"
  );

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Trainer dashboard</p>
          <h1>{SITE.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/availability" className="btn btn-ghost">Edit availability</Link>
          <Link href="/invoices" className="btn btn-primary">New invoice</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Active clients</div><div className="value">{kpi?.active ?? 0}</div></div>
        <div className="kpi"><div className="label">Sessions · next 7 days</div><div className="value">{kpi?.week ?? 0}</div></div>
        <div className="kpi"><div className="label">Paid this month</div><div className="value">{money(kpi?.month ?? 0)}</div></div>
        <div className="kpi"><div className="label">Outstanding</div><div className="value">{money(kpi?.outstanding ?? 0)}</div><div className="sub">{overdue.length} overdue</div></div>
      </div>

      <div className="two-col wide-left">
        <section className="card">
          <div className="panel-title"><h2>Upcoming sessions</h2><span className="muted">next 14 days</span></div>
          {sessions.length === 0 ? <div className="empty">Nothing booked yet.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Time</th><th>Client</th><th /></tr></thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{fmtDate(s.date)}</td><td>{fmtTime(s.time)}</td>
                      <td><Link href={`/clients/${s.client_id}`} className="accent">{s.client}</Link></td>
                      <td><SessionActions id={s.id} role="trainer" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="panel-title"><h2>Paid revenue</h2><span className="muted">last 6 months</span></div>
          <RevenueChart data={revenue} />
        </section>
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        {needsClosing.length > 0 && (
          <section className="card">
            <div className="panel-title"><h2>Needs closing out</h2><span className="muted">{needsClosing.length}</span></div>
            <div className="table-wrap"><table><tbody>
              {needsClosing.map((s) => (
                <tr key={s.id}><td>{fmtDate(s.date)} · {fmtTime(s.time)}</td><td>{s.client}</td><td><SessionActions id={s.id} role="trainer" canComplete /></td></tr>
              ))}
            </tbody></table></div>
          </section>
        )}

        <section className="card">
          <div className="panel-title"><h2>Overdue invoices</h2><Link href="/invoices" className="accent">All invoices →</Link></div>
          {overdue.length === 0 ? <div className="empty">Nothing overdue. Nice.</div> : (
            <div className="table-wrap"><table><tbody>
              {overdue.map((o) => (
                <tr key={o.number}><td>{o.number}</td><td>{o.client}</td><td>due {fmtDate(o.due_date)}</td><td className="num">{money(o.amount_cents)}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </section>

        <section className="card">
          <div className="panel-title"><h2>New leads</h2><Link href="/clients" className="accent">All clients →</Link></div>
          {leads.length === 0 ? <div className="empty">No new leads.</div> : (
            <div className="table-wrap"><table><tbody>
              {leads.map((l) => (
                <tr key={l.id}><td><Link href={`/clients/${l.id}`} className="accent">{l.name}</Link></td><td className="muted">{l.goal}</td><td><Badge status="lead" /></td></tr>
              ))}
            </tbody></table></div>
          )}
        </section>
      </div>
    </>
  );
}
