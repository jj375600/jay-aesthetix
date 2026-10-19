import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <strong style={{ color: "var(--text)" }}>{SITE.name}</strong> · {SITE.tagline}
            <br />
            {SITE.location} · {SITE.email} · {SITE.instagram}
          </div>
          <div>© {new Date().getFullYear()} {SITE.name}. Independent contractor.</div>
        </div>
        {SITE.demoMode && (
          <p className="demo-note">
            Portfolio concept project: all clients, sessions, invoices and prices shown are sample data, and
            payments are simulated. Built with Next.js, TypeScript and PostgreSQL.
          </p>
        )}
      </div>
    </footer>
  );
}
