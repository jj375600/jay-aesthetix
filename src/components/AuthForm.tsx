"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    const next = params.get("next");
    router.push(mode === "register" ? "/onboarding" : next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <div className="card auth-card">
      <h1 style={{ fontSize: "2.4rem" }}>{mode === "login" ? "Welcome back" : "Start your journey"}</h1>
      <p className="muted">
        {mode === "login" ? "Log in to book sessions and track your progress." : "Create your free client account. Takes under a minute."}
      </p>
      <form className="form" onSubmit={onSubmit} noValidate>
        {mode === "register" && (
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" type="text" autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          {mode === "register" && <span className="hint">At least 8 characters.</span>}
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "One sec…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
        {mode === "login" ? (
          <>New here? <Link href="/register" className="accent link-u">Create an account</Link></>
        ) : (
          <>Already a client? <Link href="/login" className="accent link-u">Log in</Link></>
        )}
      </p>
    </div>
  );
}
