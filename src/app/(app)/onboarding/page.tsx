import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { OnboardingWizard, type OnboardingData } from "@/components/OnboardingWizard";
import { SITE } from "@/lib/site";

export const metadata = { title: `Onboarding · ${SITE.name}` };

export default async function OnboardingPage() {
  const user = await requireUser("client");
  const p = await queryOne<{
    phone: string | null; goal: string; experience: OnboardingData["experience"]; target_weight: number | null;
    injuries: string | null; medical_notes: string | null; par_q_flags: string[]; sessions_per_week: number;
    preferred_days: string[]; preferred_time: OnboardingData["preferredTime"];
  }>("SELECT * FROM client_profiles WHERE user_id = $1", [user.id]);

  const initial: OnboardingData = {
    phone: p?.phone ?? "",
    goal: p?.goal ?? "",
    experience: p?.experience ?? "beginner",
    targetWeight: p?.target_weight ? String(p.target_weight) : "",
    injuries: p?.injuries ?? "",
    medicalNotes: p?.medical_notes ?? "",
    parQFlags: p?.par_q_flags ?? [],
    sessionsPerWeek: p?.sessions_per_week ?? 2,
    preferredDays: p?.preferred_days ?? [],
    preferredTime: p?.preferred_time ?? "any",
  };

  return (
    <div className="narrow" style={{ paddingTop: 8 }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Welcome, {user.name.split(" ")[0]}</p>
          <h1>Let&apos;s build your plan</h1>
        </div>
      </div>
      <OnboardingWizard initial={initial} />
    </div>
  );
}
