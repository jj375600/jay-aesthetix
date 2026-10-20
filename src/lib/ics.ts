import { SITE } from "./site";

// Builds an iCalendar (.ics) file, the format Apple Calendar, Google Calendar and Outlook all import.
// Written by hand (RFC 5545) rather than with a library: it's a small, well-defined text format.

/** How many minutes the studio's clock is ahead of UTC at a given moment (e.g. -240 for New York in summer). */
function offsetMinutes(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asIfUtc - utcMs) / 60_000;
}

/** Converts the studio's wall-clock date + time (how sessions are stored) into the real instant in time. */
export function studioLocalToUtc(date: string, time: string, timeZone = SITE.studioTimezone) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes so the answer is right even when the offset changes (daylight saving) near that time.
  let guess = naive - offsetMinutes(naive, timeZone) * 60_000;
  guess = naive - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261022T210000Z

/** Escapes text values: backslash, semicolon, comma and line breaks have special meaning in .ics. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines may be at most 75 bytes; longer ones continue on the next line starting with a space. */
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > 74) {
      out.push(current);
      current = " " + ch;
      bytes = 1 + size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n");
}

export type CalendarEvent = {
  id: number;
  date: string; // "2026-10-22"
  time: string; // "17:00" (studio local time)
  durationMin: number;
  summary: string;
  description: string;
  location: string;
};

export function buildIcs(ev: CalendarEvent, now = new Date()) {
  const start = studioLocalToUtc(ev.date, ev.time);
  const end = new Date(start.getTime() + ev.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE.name}//Client Portal//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:session-${ev.id}@jayaesthetix.test`, // stable, so re-importing updates the event instead of duplicating it
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.summary)}`,
    `DESCRIPTION:${esc(ev.description)}`,
    `LOCATION:${esc(ev.location)}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(ev.summary)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
