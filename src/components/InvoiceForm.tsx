"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceForm({ clients, defaultDue }: { clients: { id: number; name: string }[]; defaultDue: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setError("");
    setOk("");
    setBusy(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(formEl).entries())),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not create invoice");
    formEl.reset();
    setOk(`Created ${body.invoice.number}`);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="clientId">Client</label>
        <select id="clientId" name="clientId" required defaultValue="">
          <option value="" disabled>Choose a client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="description">Description</label>
        <input id="description" name="description" type="text" placeholder="e.g. 8-session pack" required />
      </div>
      <div className="row-2">
        <div className="field"><label htmlFor="amount">Amount (USD)</label><input id="amount" name="amount" type="number" step="0.01" min="0" inputMode="decimal" required /></div>
        <div className="field"><label htmlFor="dueDate">Due date</label><input id="dueDate" name="dueDate" type="date" defaultValue={defaultDue} required /></div>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {ok && <div className="alert ok" role="status">{ok}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create & send invoice"}</button>
    </form>
  );
}
