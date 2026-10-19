import { query } from "@/lib/db";
import { authed, json, parse } from "@/lib/api";
import { onboardingSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const [user, authErr] = await authed("client");
  if (authErr) return authErr;
  const [d, err] = await parse(req, onboardingSchema);
  if (err) return err;

  await query(
    `INSERT INTO client_profiles
       (user_id, phone, goal, experience, target_weight, injuries, medical_notes, par_q_flags,
        sessions_per_week, preferred_days, preferred_time, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'lead')
     ON CONFLICT (user_id) DO UPDATE SET
       phone = EXCLUDED.phone, goal = EXCLUDED.goal, experience = EXCLUDED.experience,
       target_weight = EXCLUDED.target_weight, injuries = EXCLUDED.injuries,
       medical_notes = EXCLUDED.medical_notes, par_q_flags = EXCLUDED.par_q_flags,
       sessions_per_week = EXCLUDED.sessions_per_week, preferred_days = EXCLUDED.preferred_days,
       preferred_time = EXCLUDED.preferred_time`,
    [user!.id, d.phone || null, d.goal, d.experience, d.targetWeight ?? null, d.injuries || null,
     d.medicalNotes || null, d.parQFlags, d.sessionsPerWeek, d.preferredDays, d.preferredTime]
  );
  return json({ ok: true });
}
