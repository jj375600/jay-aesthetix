"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SessionActions({ id, role, canComplete }: { id: number; role: "trainer" | "client"; canComplete?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(status: "cancelled" | "completed") {
    if (status === "cancelled" && !window.confirm("Cancel this session?")) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not update");
    router.refresh();
  }

  return (
    <div>
      <div className="row-actions">
        {role === "trainer" && canComplete && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act("completed")}>Complete</button>
        )}
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act("cancelled")}>Cancel</button>
      </div>
      {error && <div className="hint" role="alert" style={{ color: "var(--bad)", textAlign: "right", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
