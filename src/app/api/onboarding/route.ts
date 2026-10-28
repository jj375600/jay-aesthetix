import { query, queryOne } from "@/lib/db";
import { nudgeConsentChanged } from "@/lib/nudge";
import { normalizePhone } from "@/lib/phone";
import { authed, json, parse } from "@/lib/api";
import { onboardingSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const [user, authErr] = await authed("client");
  if (authErr) return authErr;
  const [d, err] = await parse(req, onboardingSchema);
  if (err) return err;

  const before = await queryOne<{ sms_consent: boolean }>("SELECT sms_consent FROM client_profiles WHERE user_id = $1", [user!.id]);
  // With consent, store the number in the one format the text-message bot accepts.
  const phone = d.smsConsent ? normalizePhone(d.phone) : d.phone || null;

  await query(
    `INSERT INTO client_profiles
       (user_id, phone, sms_consent, sms_consent_at, goal, experience, target_weight, injuries, medical_notes, par_q_flags,
        sessions_per_week, preferred_days, preferred_time, status)
     VALUES ($1,$2,$12,CASE WHEN $12 THEN now() END,$3,$4,$5,$6,$7,$8,$9,$10,$11,'lead')
     ON CONFLICT (user_id) DO UPDATE SET
       phone = EXCLUDED.phone, sms_consent = EXCLUDED.sms_consent,
       sms_consent_at = CASE WHEN NOT EXCLUDED.sms_consent THEN NULL
                             WHEN client_profiles.sms_consent THEN client_profiles.sms_consent_at
                             ELSE now() END,
       goal = EXCLUDED.goal, experience = EXCLUDED.experience,
       target_weight = EXCLUDED.target_weight, injuries = EXCLUDED.injuries,
       medical_notes = EXCLUDED.medical_notes, par_q_flags = EXCLUDED.par_q_flags,
       sessions_per_week = EXCLUDED.sessions_per_week, preferred_days = EXCLUDED.preferred_days,
       preferred_time = EXCLUDED.preferred_time`,
    [user!.id, phone, d.goal, d.experience, d.targetWeight ?? null, d.injuries || null,
     d.medicalNotes || null, d.parQFlags, d.sessionsPerWeek, d.preferredDays, d.preferredTime, d.smsConsent]
  );
  await nudgeConsentChanged(user!.id, before?.sms_consent ?? false);
  return json({ ok: true });
}
