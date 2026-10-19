"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WEEKDAYS } from "@/lib/format";

type Block = { weekday: number; start: string; end: string };

export function AvailabilityEditor({ initial }: { initial: Block[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Block>) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = (weekday: number) => setBlocks((b) => [...b, { weekday, start: "09:00", end: "12:00" }]);
  const remove = (i: number) => setBlocks((b) => b.filter((_, j) => j !== i));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: body.error ?? "Could not save" });
    setMsg({ kind: "ok", text: "Availability saved. Clients see the new times right away." });
    router.refresh();
  }

  return (
    <div>
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <div className="avail-row" key={day}>
          <strong>{WEEKDAYS[day]}</strong>
          <div className="avail-blocks">
            {blocks.map((b, i) =>
              b.weekday !== day ? null : (
                <div className="avail-block" key={i}>
                  <label className="sr-only" htmlFor={`s${i}`}>{WEEKDAYS[day]} start</label>
                  <input id={`s${i}`} type="time" value={b.start} onChange={(e) => update(i, { start: e.target.value })} />
                  <span className="muted">to</span>
                  <label className="sr-only" htmlFor={`e${i}`}>{WEEKDAYS[day]} end</label>
                  <input id={`e${i}`} type="time" value={b.end} onChange={(e) => update(i, { end: e.target.value })} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(i)} aria-label={`Remove ${WEEKDAYS[day]} block`}>Remove</button>
                </div>
              )
            )}
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => add(day)}>+ Add hours</button>
              {!blocks.some((b) => b.weekday === day) && <span className="muted" style={{ marginLeft: 10 }}>Off</span>}
            </div>
          </div>
        </div>
      ))}
      {msg && <div className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"} style={{ marginTop: 16 }}>{msg.text}</div>}
      <div style={{ marginTop: 18 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save availability"}</button>
      </div>
    </div>
  );
}
