import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container state-box">
      <h1>Page not found</h1>
      <p className="muted">That page doesn’t exist, or it isn’t yours to see.</p>
      <p><Link className="btn btn-primary" href="/">Back to home</Link></p>
    </main>
  );
}
