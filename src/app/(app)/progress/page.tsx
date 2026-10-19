import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { todayInStudio } from "@/lib/slots";
import { fmtDate } from "@/lib/format";
import { BodyChart, StrengthChart, type Entry } from "@/components/Charts";
import { ProgressForm } from "@/components/ProgressForm";
import { SITE } from "@/lib/site";

export const metadata = { title: `Progress · ${SITE.name}` };

const ENTRY_SQL = `SELECT id, entry_date AS "entryDate", weight_lb AS "weightLb", body_fat_pct AS "bodyFatPct",
  bench_lb AS "benchLb", squat_lb AS "squatLb", deadlift_lb AS "deadliftLb", note
  FROM progress_entries WHERE client_id = $1 ORDER BY entry_date`;

export default async function ProgressPage() {
  const user = await requireUser();
  if (user.role === "trainer") redirect("/clients");
  const entries = await query<Entry & { id: number; note: string | null }>(ENTRY_SQL, [user.id]);
  const latest = [...entries].reverse();

  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Your numbers</p><h1>Progress</h1></div></div>
      <div className="two-col wide-left">
        <div className="grid">
          <section className="card"><div className="panel-title"><h2>Body composition</h2></div><BodyChart entries={entries} /></section>
          <section className="card"><div className="panel-title"><h2>Strength</h2></div><StrengthChart entries={entries} /></section>
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <section className="card"><div className="panel-title"><h2>Log a check-in</h2></div><ProgressForm today={todayInStudio()} /></section>
        </div>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="panel-title"><h2>History</h2></div>
        {latest.length === 0 ? <div className="empty">No check-ins yet.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th className="num">Weight</th><th className="num">Body fat</th><th className="num">Bench</th><th className="num">Squat</th><th className="num">Deadlift</th></tr></thead>
              <tbody>
                {latest.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.entryDate)}</td>
                    <td className="num">{e.weightLb ?? "—"}</td><td className="num">{e.bodyFatPct !== null ? `${e.bodyFatPct}%` : "—"}</td>
                    <td className="num">{e.benchLb ?? "—"}</td><td className="num">{e.squatLb ?? "—"}</td><td className="num">{e.deadliftLb ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
