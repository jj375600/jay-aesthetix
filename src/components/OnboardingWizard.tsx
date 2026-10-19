"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type OnboardingData = {
  phone: string;
  goal: string;
  experience: "beginner" | "intermediate" | "advanced";
  targetWeight: string;
  injuries: string;
  medicalNotes: string;
  parQFlags: string[];
  sessionsPerWeek: number;
  preferredDays: string[];
  preferredTime: "morning" | "afternoon" | "evening" | "any";
};

const PAR_Q = [
  "A doctor has told me I have a heart condition",
  "I feel chest pain when I exercise",
  "I sometimes feel dizzy or lose my balance",
  "I have a bone or joint problem that exercise could worsen",
  "I take medication for blood pressure or a heart condition",
  "I am pregnant or recently postpartum",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TITLES = ["Your goals", "Health history", "Your schedule"];

export function OnboardingWizard({ initial }: { initial: OnboardingData }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => setData((d) => ({ ...d, [k]: v }));
  const toggle = (k: "parQFlags" | "preferredDays", v: string) =>
    set(k, data[k].includes(v) ? data[k].filter((x) => x !== v) : [...data[k], v]);

  function validate(): string {
    if (step === 0 && data.goal.trim().length < 5) return "Tell me a bit more about your goal.";
    if (step === 2 && data.preferredDays.length === 0) return "Pick at least one day that works for you.";
    return "";
  }

  function next() {
    const v = validate();
    setError(v);
    if (!v) setStep((s) => s + 1);
  }

  async function submit() {
    const v = validate();
    setError(v);
    if (v) return;
    setBusy(true);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, targetWeight: data.targetWeight === "" ? null : Number(data.targetWeight) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not save. Please try again.");
    router.push("/book");
    router.refresh();
  }

  return (
    <div className="card">
      <div className="steps" aria-hidden="true">
        {TITLES.map((_, i) => <div key={i} className={`bar${i <= step ? " done" : ""}`} />)}
      </div>
      <p className="eyebrow">Step {step + 1} of 3</p>
      <h2>{TITLES[step]}</h2>

      <form className="form" onSubmit={(e) => e.preventDefault()} noValidate>
        {step === 0 && (
          <>
            <div className="field">
              <label htmlFor="goal">What&apos;s your main goal?</label>
              <textarea id="goal" value={data.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. Lose 15 lb and feel confident in the gym" />
            </div>
            <div className="field">
              <span className="legend">Training experience</span>
              <div className="pills" role="radiogroup" aria-label="Training experience">
                {(["beginner", "intermediate", "advanced"] as const).map((x) => (
                  <label className="pill" key={x}>
                    <input type="radio" name="experience" checked={data.experience === x} onChange={() => set("experience", x)} />
                    <span style={{ textTransform: "capitalize" }}>{x}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="target">Target weight (lb, optional)</label>
                <input id="target" type="number" inputMode="decimal" value={data.targetWeight} onChange={(e) => set("targetWeight", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="phone">Phone (optional)</label>
                <input id="phone" type="text" inputMode="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="muted" style={{ marginBottom: 0 }}>Check anything that applies. This helps keep your training safe. It isn&apos;t medical advice, and a doctor&apos;s OK is wise if you&apos;re unsure.</p>
            <div className="checks">
              {PAR_Q.map((q) => (
                <label className="check" key={q}>
                  <input type="checkbox" checked={data.parQFlags.includes(q)} onChange={() => toggle("parQFlags", q)} />
                  <span>{q}</span>
                </label>
              ))}
            </div>
            <div className="field">
              <label htmlFor="injuries">Injuries or limitations (optional)</label>
              <textarea id="injuries" value={data.injuries} onChange={(e) => set("injuries", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="medical">Anything else I should know? (optional)</label>
              <textarea id="medical" value={data.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label htmlFor="spw">Sessions per week</label>
              <select id="spw" value={data.sessionsPerWeek} onChange={(e) => set("sessionsPerWeek", Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field">
              <span className="legend">Days that work for you</span>
              <div className="pills">
                {DAYS.map((d) => (
                  <label className="pill" key={d}>
                    <input type="checkbox" checked={data.preferredDays.includes(d)} onChange={() => toggle("preferredDays", d)} />
                    <span>{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="legend">Best time of day</span>
              <div className="pills" role="radiogroup" aria-label="Best time of day">
                {(["morning", "afternoon", "evening", "any"] as const).map((t) => (
                  <label className="pill" key={t}>
                    <input type="radio" name="ptime" checked={data.preferredTime === t} onChange={() => set("preferredTime", t)} />
                    <span style={{ textTransform: "capitalize" }}>{t}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="wizard-nav">
          {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => { setError(""); setStep(step - 1); }}>Back</button> : <span />}
          {step < 2 ? (
            <button type="button" className="btn btn-primary" onClick={next}>Continue</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Finish & book a session"}</button>
          )}
        </div>
      </form>
    </div>
  );
}
