"use client";
import { useState } from "react";

export function PayInvoiceButton({ id }: { id: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/invoices/${id}/checkout`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) {
      setBusy(false);
      return setError(body.error ?? "Could not start payment");
    }
    window.location.assign(body.url); // off to Stripe's hosted payment page
  }

  return (
    <div>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={pay}>{busy ? "Opening…" : "Pay now"}</button>
      {error && <div className="hint" role="alert" style={{ color: "var(--bad)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
