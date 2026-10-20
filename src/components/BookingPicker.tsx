"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate, fmtDateLong, fmtTime } from "@/lib/format";

type Slot = { date: string; time: string };

export function BookingPicker({ slots }: { slots: Slot[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Slot | null>(null);
  const [type, setType] = useState("Strength training");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const byDate = slots.reduce<Record<string, string[]>>((acc, s) => {
    (acc[s.date] ||= []).push(s.time);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  async function book() {
    if (!picked) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...picked, type }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not book that slot.");
      setPicked(null);
      router.refresh(); // reload the list: that slot may have just been taken
      return;
    }
    router.push("/dashboard?booked=1");
    router.refresh();
  }

  if (dates.length === 0) return <div className="empty">No open times in the next two weeks. Check back soon or message Jay.</div>;

  return (
    <div>
      <div className="field" style={{ maxWidth: 320, marginBottom: 20 }}>
        <label htmlFor="stype">Session focus</label>
        <select id="stype" value={type} onChange={(e) => setType(e.target.value)}>
          <option>Strength training</option>
          <option>Conditioning + mobility</option>
          <option>Form check & technique</option>
          <option>Intro session</option>
        </select>
      </div>

      {dates.map((d) => (
        <div className="day-col" key={d}>
          <h2>{fmtDate(d)}</h2>
          <div className="slots">
            {byDate[d].map((t) => (
              <button
                key={t}
                type="button"
                className="slot"
                aria-pressed={picked?.date === d && picked.time === t}
                onClick={() => setPicked({ date: d, time: t })}
              >
                {fmtTime(t)}
              </button>
            ))}
          </div>
        </div>
      ))}

      {error && <div className="alert error" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      {picked && (
        <div className="confirm-bar">
          <div>
            <strong>{fmtDateLong(picked.date)}</strong> at <strong>{fmtTime(picked.time)}</strong>
            <div className="hint">60 minutes · {type}</div>
          </div>
          <button className="btn btn-primary" onClick={book} disabled={busy}>{busy ? "Booking…" : "Confirm booking"}</button>
        </div>
      )}
    </div>
  );
}
