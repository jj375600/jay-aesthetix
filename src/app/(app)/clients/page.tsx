import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { money } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { SITE } from "@/lib/site";

export const metadata = { title: `Clients · ${SITE.name}` };

export default async function ClientsPage() {
  await requireUser("trainer");
  const rows = await query<{ id: number; name: string; email: string; status: string; goal: string; done: number; owed: number; weight: number | null }>(
    `SELECT u.id, u.name, u.email, p.status, p.goal,
            (SELECT count(*) FROM sessions s WHERE s.client_id = u.id AND s.status = 'completed') AS done,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM invoices i WHERE i.client_id = u.id AND i.status = 'sent') AS owed,
            (SELECT weight_lb FROM progress_entries e WHERE e.client_id = u.id AND weight_lb IS NOT NULL ORDER BY entry_date DESC LIMIT 1) AS weight
       FROM users u LEFT JOIN client_profiles p ON p.user_id = u.id
      WHERE u.role = 'client' ORDER BY (p.status = 'active') DESC NULLS LAST, u.name`
  );

  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Roster</p><h1>Clients</h1></div></div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Goal</th><th className="num">Sessions done</th><th className="num">Weight</th><th className="num">Owed</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clients/${c.id}`} className="accent">{c.name}</Link><div className="hint">{c.email}</div></td>
                  <td>{c.status ? <Badge status={c.status} /> : <span className="muted">no onboarding</span>}</td>
                  <td className="muted">{c.goal ?? "—"}</td>
                  <td className="num">{c.done}</td>
                  <td className="num">{c.weight ? `${c.weight} lb` : "—"}</td>
                  <td className="num">{c.owed ? money(c.owed) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
