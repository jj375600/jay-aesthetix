"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProgressForm({ clientId, today }: { clientId?: number; today: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setError("");
    setOk(false);
    setBusy(true);
    const f = Object.fromEntries(new FormData(formEl).entries());
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, clientId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not save");
    formEl.reset();
    setOk(true);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="entryDate">Date</label>
        <input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
      </div>
      <div className="row-2">
        <div className="field"><label htmlFor="weightLb">Weight (lb)</label><input id="weightLb" name="weightLb" type="number" step="0.1" inputMode="decimal" /></div>
        <div className="field"><label htmlFor="bodyFatPct">Body fat (%)</label><input id="bodyFatPct" name="bodyFatPct" type="number" step="0.1" inputMode="decimal" /></div>
      </div>
      <div className="row-2">
        <div className="field"><label htmlFor="benchLb">Bench (lb)</label><input id="benchLb" name="benchLb" type="number" inputMode="numeric" /></div>
        <div className="field"><label htmlFor="squatLb">Squat (lb)</label><input id="squatLb" name="squatLb" type="number" inputMode="numeric" /></div>
        <div className="field"><label htmlFor="deadliftLb">Deadlift (lb)</label><input id="deadliftLb" name="deadliftLb" type="number" inputMode="numeric" /></div>
      </div>
      <div className="field"><label htmlFor="note">Note (optional)</label><input id="note" name="note" type="text" /></div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {ok && <div className="alert ok" role="status">Check-in saved.</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save check-in"}</button>
    </form>
  );
}
