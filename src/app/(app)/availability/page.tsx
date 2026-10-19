import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { SITE } from "@/lib/site";

export const metadata = { title: `Availability · ${SITE.name}` };

export default async function AvailabilityPage() {
  const user = await requireUser("trainer");
  const blocks = await query<{ weekday: number; start: string; end: string }>(
    'SELECT weekday, start_time AS start, end_time AS "end" FROM availability WHERE trainer_id = $1 ORDER BY weekday, start_time',
    [user.id]
  );
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Weekly schedule</p><h1>Availability</h1></div></div>
      <section className="card">
        <p className="muted">Set the hours you&apos;re open. Clients can book {SITE.sessionMinutes}-minute sessions inside these blocks, and booked times disappear automatically.</p>
        <AvailabilityEditor initial={blocks} />
      </section>
    </>
  );
}
