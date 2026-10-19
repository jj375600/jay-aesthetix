import { query, queryOne } from "./db";
import { SITE } from "./site";

export type Slot = { date: string; time: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** "Now" as wall-clock time in the studio's timezone, e.g. { date: "2026-10-18", minutes: 485 } */
export function studioNow(at: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE.studioTimezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Whole hours from now until a session starts (negative if it already started). */
export function hoursUntil(date: string, time: string) {
  const now = studioNow();
  const dayDiff = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${now.date}T00:00:00Z`)) / 86_400_000;
  return (dayDiff * 1440 + toMin(time) - now.minutes) / 60;
}

type Block = { weekday: number; start_time: string; end_time: string };

/** Every bookable start time for [fromDate, fromDate + days), minus booked and too-soon slots. */
export async function getOpenSlots(trainerId: number, fromDate: string, days: number): Promise<Slot[]> {
  const blocks = await query<Block>(
    "SELECT weekday, start_time, end_time FROM availability WHERE trainer_id = $1",
    [trainerId]
  );
  const start = new Date(`${fromDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const taken = await query<{ session_date: string; start_time: string }>(
    `SELECT session_date, start_time FROM sessions
      WHERE trainer_id = $1 AND status <> 'cancelled' AND session_date >= $2 AND session_date < $3`,
    [trainerId, ymd(start), ymd(end)]
  );
  const takenSet = new Set(taken.map((t) => `${t.session_date} ${t.start_time}`));

  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    const date = ymd(day);
    for (const b of blocks.filter((x) => x.weekday === day.getDay())) {
      for (let m = toMin(b.start_time); m + SITE.sessionMinutes <= toMin(b.end_time); m += SITE.sessionMinutes) {
        const time = toHHMM(m);
        if (takenSet.has(`${date} ${time}`)) continue;
        if (hoursUntil(date, time) < SITE.minLeadHours) continue;
        slots.push({ date, time });
      }
    }
  }
  return slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** True if this exact start time is inside the trainer's availability, in the future, and free. */
export async function isSlotBookable(trainerId: number, date: string, time: string) {
  const open = await getOpenSlots(trainerId, date, 1);
  return open.some((s) => s.date === date && s.time === time);
}

export async function getTrainerId(): Promise<number | null> {
  const row = await queryOne<{ id: number }>("SELECT id FROM users WHERE role = 'trainer' ORDER BY id LIMIT 1");
  return row?.id ?? null;
}

export const todayInStudio = () => studioNow().date;
