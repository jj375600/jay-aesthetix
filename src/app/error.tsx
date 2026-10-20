"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="container state-box">
      <h1>Something went wrong</h1>
      <p className="muted">That page hit an unexpected error. Your data is safe. Try again, or head back to the start.</p>
      {error.digest && <p className="hint">Reference: {error.digest}</p>}
      <p style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <a className="btn" href="/">Home</a>
      </p>
    </main>
  );
}
