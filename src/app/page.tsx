import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { Footer } from "@/components/Footer";
import { CREDENTIALS, FAQ, PACKAGES, SITE, STEPS } from "@/lib/site";

const PORTAL = [
  ["Book online", "See Jay's open times and reserve a session in two taps. No double-bookings, ever."],
  ["Track your numbers", "Log weight, body fat and your big lifts, then watch the trend lines move."],
  ["Clear invoices", "Every package, due date and payment status lives in one place."],
  ["Built around you", "A short onboarding form means your first session starts with a real plan."],
];

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">{SITE.tagline} · {SITE.location}</p>
              <h1>
                Build the body.<span className="accent">Keep the habit.</span>
              </h1>
              <p className="hero-lead">
                One-on-one coaching for beginners and people getting back into it. Real programming, honest
                accountability, and a client portal that tracks every win.
              </p>
              <div className="hero-cta">
                <Link href="/register" className="btn btn-primary btn-lg">Book your free intro</Link>
                <a href="#services" className="btn btn-ghost btn-lg">See packages</a>
              </div>
              <div className="creds" aria-label="Credentials">
                {CREDENTIALS.map((c) => <span className="chip" key={c}>{c}</span>)}
              </div>
            </div>
            <div className="hero-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/portrait.jpg" width={1100} height={1100} decoding="async" alt={`${SITE.trainerName}, your personal trainer, smiling in the gym`} />
              <div className="hero-badge">
                <strong>Train with {SITE.trainerName}</strong>
                Independent personal trainer
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="section">
          <div className="container">
            <p className="eyebrow">Services</p>
            <h2>Simple packages. Clear prices.</h2>
            <p className="muted" style={{ maxWidth: 560 }}>Start with a free intro, then pick the plan that fits your schedule and goals.</p>
            <div className="grid grid-3" style={{ marginTop: 28 }}>
              {PACKAGES.map((p) => (
                <article key={p.name} className={`card${p.featured ? " featured" : ""}`}>
                  {p.featured && <span className="tag">Most popular</span>}
                  <h3>{p.name}</h3>
                  <div className="price">{p.price}<small>{p.unit}</small></div>
                  <p className="muted" style={{ marginTop: 12 }}>{p.blurb}</p>
                  <ul className="ticks">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  <Link href="/register" className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`} style={{ width: "100%" }}>
                    {p.price === "Free" ? "Book intro" : "Get started"}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="section alt">
          <div className="container">
            <p className="eyebrow">How it works</p>
            <h2>Three steps to your first session</h2>
            <div className="grid grid-3" style={{ marginTop: 28 }}>
              {STEPS.map((s, i) => (
                <div className="card" key={s.title}>
                  <div className="step-num">0{i + 1}</div>
                  <h3>{s.title}</h3>
                  <p className="muted" style={{ marginBottom: 0 }}>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="section">
          <div className="container about-grid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="about-logo" src="/img/logo.png" width={900} height={835} loading="lazy" decoding="async" alt={`${SITE.name} logo`} />
            <div>
              <p className="eyebrow">About</p>
              <h2>Coaching that fits real life</h2>
              <p className="muted">
                I&apos;m Jay, an independent personal trainer based in {SITE.location}. I work with people who want
                to get stronger, lose fat, and finally make training a habit, without the intimidation of a
                big-box gym.
              </p>
              <p className="muted">
                Every client gets a plan built around their goals, injuries, and schedule. You&apos;ll learn proper
                form, see your progress in numbers, and always know what&apos;s next.
              </p>
              <div className="creds">{CREDENTIALS.map((c) => <span className="chip" key={c}>{c}</span>)}</div>
            </div>
          </div>
        </section>

        <section className="section alt">
          <div className="container">
            <p className="eyebrow">Your client portal</p>
            <h2>Everything in one place</h2>
            <div className="grid grid-4" style={{ marginTop: 28 }}>
              {PORTAL.map(([t, d]) => (
                <div className="card" key={t}>
                  <h3>{t}</h3>
                  <p className="muted" style={{ marginBottom: 0 }}>{d}</p>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 24 }}>
              <Link href="/login" className="btn btn-ghost">Already a client? Log in</Link>
            </p>
          </div>
        </section>

        <section id="faq" className="section">
          <div className="narrow">
            <p className="eyebrow">FAQ</p>
            <h2>Good questions</h2>
            <div style={{ marginTop: 22 }}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="card" style={{ textAlign: "center", padding: "48px 24px", background: "linear-gradient(135deg, var(--navy), #0e1630)" }}>
              <h2>Ready to start?</h2>
              <p className="muted">Your first session is on me. Create an account and pick a time.</p>
              <Link href="/register" className="btn btn-primary btn-lg">Book your free intro</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
