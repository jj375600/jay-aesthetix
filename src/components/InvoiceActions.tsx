"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: "paid" | "void" | "sent") {
    setBusy(true);
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  if (status === "void") return <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => set("sent")}>Reopen</button>;
  if (status === "paid") return <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => set("sent")}>Mark unpaid</button>;
  return (
    <div className="row-actions">
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => set("paid")}>Mark paid</button>
      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => set("void")}>Void</button>
    </div>
  );
}
