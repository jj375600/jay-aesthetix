// "Add to calendar" (.ics download) tests. Same setup as the other test files: the app must be running.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const rnd = () => Math.floor(Math.random() * 256);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;

async function call(path, { method = "GET", cookie, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function login(email) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": randomIp() },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const created = [];
let trainerCookie;
const getTrainer = async () => (trainerCookie ??= await login("jay@jayaesthetix.test"));

after(async () => {
  const t = await getTrainer();
  for (const id of created) {
    await call(`/api/sessions/${id}`, { method: "PATCH", cookie: t, body: { status: "cancelled" } });
  }
});

/** Books an early open slot (the other test files use slots from the end of the list, so they never collide). */
async function bookEarlySlot(cookie) {
  const slots = (await (await call("/api/slots?days=14", { cookie })).json()).slots;
  const slot = slots[3];
  const res = await call("/api/sessions", { method: "POST", cookie, body: { date: slot.date, time: slot.time } });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  created.push(id);
  return { id, slot };
}

// Reads one field out of the .ics text (after undoing line folding).
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, "");
const field = (ics, name) => unfold(ics).match(new RegExp(`^${name}[;:](.*)$`, "m"))?.[1].replace(/\r$/, "");

// Turns "20261022T210000Z" back into New York wall-clock "2026-10-22" / "17:00".
function toStudioLocal(icsStamp) {
  const m = icsStamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  assert.ok(m, `not a UTC timestamp: ${icsStamp}`);
  const instant = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}`, instant };
}

describe("add to calendar (.ics)", () => {
  test("a client can download their booked session as a valid calendar file", async () => {
    const maya = await login("maya@example.test");
    const { id, slot } = await bookEarlySlot(maya);

    const res = await call(`/api/sessions/${id}/calendar`, { cookie: maya });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/calendar/);
    assert.match(res.headers.get("content-disposition"), /attachment; filename="jay-aesthetix-session-\d{4}-\d{2}-\d{2}\.ics"/);

    const ics = await res.text();
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.ok(!/(^|[^\r])\n/.test(ics), "every line break must be CRLF");
    for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
    assert.equal(field(ics, "UID"), `session-${id}@jayaesthetix.test`);

    // The start time, converted back into the studio's clock, must be exactly the slot that was booked...
    const start = toStudioLocal(field(ics, "DTSTART"));
    assert.deepEqual({ date: start.date, time: start.time }, { date: slot.date, time: slot.time });
    // ...and the event lasts one hour.
    const end = toStudioLocal(field(ics, "DTEND"));
    assert.equal(end.instant - start.instant, 60 * 60_000);

    // Commas in text must be escaped, or calendars split the value in two.
    assert.match(field(ics, "LOCATION"), /Decatur\\, GA/);
  });

  test("the trainer can download it too, titled with the client's name", async () => {
    const maya = await login("maya@example.test");
    const { id } = await bookEarlySlot(maya);
    const res = await call(`/api/sessions/${id}/calendar`, { cookie: await getTrainer() });
    assert.equal(res.status, 200);
    assert.match(field(await res.text(), "SUMMARY"), /Maya/);
  });

  test("only the session's own client or trainer can download it", async () => {
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const { id } = await bookEarlySlot(maya);

    assert.equal((await call(`/api/sessions/${id}/calendar`)).status, 401);
    assert.equal((await call(`/api/sessions/${id}/calendar`, { cookie: marcus })).status, 403);
  });

  test("unknown, malformed or oversized ids return 404, not a server error", async () => {
    const maya = await login("maya@example.test");
    for (const bad of ["999999999", "abc", "1.5", "99999999999999999999"]) {
      assert.equal((await call(`/api/sessions/${bad}/calendar`, { cookie: maya })).status, 404, bad);
    }
  });

  test("a cancelled session can no longer be added to a calendar", async () => {
    const maya = await login("maya@example.test");
    const { id } = await bookEarlySlot(maya);
    const cancel = await call(`/api/sessions/${id}`, { method: "PATCH", cookie: await getTrainer(), body: { status: "cancelled" } });
    assert.equal(cancel.status, 200);
    assert.equal((await call(`/api/sessions/${id}/calendar`, { cookie: maya })).status, 409);
  });
});
