import { authed, fail, json } from "@/lib/api";
import { getOpenSlots, getTrainerId, todayInStudio } from "@/lib/slots";

// GET /api/slots?from=YYYY-MM-DD&days=14
export async function GET(req: Request) {
  const [, authErr] = await authed();
  if (authErr) return authErr;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? todayInStudio();
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14), 1), 31);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail("Bad 'from' date");
  const trainerId = await getTrainerId();
  if (!trainerId) return fail("No trainer configured", 500);
  return json({ slots: await getOpenSlots(trainerId, from, days) });
}
