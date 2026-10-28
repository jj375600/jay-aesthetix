// Tests for the link to the jay-nudge text-message bot.
// The bot is replaced by a tiny fake server that records every event the app sends it.
// The app must be started with NUDGE_URL=http://localhost:4030 and NUDGE_EVENTS_SECRET=<same as NUDGE_SECRET below>
// (CI does this). Without those, the whole file is skipped.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const NUDGE_URL = process.env.NUDGE_URL;
const SECRET = process.env.NUDGE_EVENTS_SECRET;
const enabled = Boolean(NUDGE_URL && SECRET);
const skip = enabled ? false : "start the app with NUDGE_URL and NUDGE_EVENTS_SECRET set to run these";

// ---------------------------------------------------------------- fake bot
const received = []; // { event, signature, rawBody, at }
let mode = "ok"; // ok | error | hang | refuse
let server;

before(async () => {
  if (!enabled) return;
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url !== "/events" || req.method !== "POST") return res.writeHead(404).end();
      received.push({ event: JSON.parse(raw), rawBody: raw, signature: req.headers["x-nudge-signature"], at: Date.now() });
      if (mode === "hang") return; // never answers
      if (mode === "error") return res.writeHead(503).end("down");
      if (mode === "refuse") return res.writeHead(422, { "content-type": "application/json" }).end('{"error":"phone in use"}');
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(Number(new URL(NUDGE_URL).port), r));
});
after(() => {
  server?.closeAllConnections?.();
  server?.close();
});
beforeEach(() => {
  received.length = 0;
  mode = "ok";
});

// ---------------------------------------------------------------- helpers
const rnd = () => Math.floor(Math.random() * 256);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = (path, { method = "GET", cookie, body } = {}) =>
  fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { "x-forwarded-for": randomIp(), ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

async function newClient() {
  const email = `nudge-${randomUUID()}@example.test`;
  const res = await call("/api/auth/register", { method: "POST", body: { name: "Nina Test", email, password: "demo1234" } });
  assert.equal(res.status, 201);
  return cookieOf(res);
}

const profile = (over = {}) => ({
  phone: "", smsConsent: false, goal: "Build a steady routine", experience: "beginner", targetWeight: null,
  sessionsPerWeek: 2, preferredDays: ["Mon", "Thu"], preferredTime: "any", ...over,
});
const onboard = (cookie, over) => call("/api/onboarding", { method: "POST", cookie, body: profile(over) });

let trainer;
const getTrainer = async () => {
  if (!trainer) {
    const res = await call("/api/auth/login", { method: "POST", body: { email: "jay@jayaesthetix.test", password: "demo1234" } });
    trainer = cookieOf(res);
  }
  return trainer;
};

const made = [];
after(async () => {
  if (!enabled) return;
  mode = "ok";
  const t = await getTrainer();
  for (const id of made) await call(`/api/sessions/${id}`, { method: "PATCH", cookie: t, body: { status: "cancelled" } });
});

/** Books a slot from near the end of the list, moving on if another test file already took it. */
async function book(cookie, extra = {}) {
  const slots = (await (await call("/api/slots?days=14", { cookie })).json()).slots;
  for (let i = 12; i >= 7; i--) {
    const slot = slots.at(-i);
    const res = await call("/api/sessions", { method: "POST", cookie, body: { date: slot.date, time: slot.time, ...extra } });
    if (res.status === 201) {
      const { id } = await res.json();
      made.push(id);
      return { id, slot, res };
    }
    assert.equal(res.status, 409, "only 'slot taken' is an acceptable reason to try the next slot");
  }
  throw new Error("no free slot found");
}

const verifies = ({ rawBody, signature }) => {
  const parts = Object.fromEntries(signature.split(",").map((p) => p.split("=")));
  const expected = createHmac("sha256", SECRET).update(`${parts.t}.${rawBody}`).digest("hex");
  return expected === parts.v1 && Math.abs(Date.now() / 1000 - Number(parts.t)) < 60;
};

// ---------------------------------------------------------------- tests
describe("consent at onboarding", { skip }, () => {
  test("ticking the box sends a signed opt-in with the number in E.164", async () => {
    const c = await newClient();
    const res = await onboard(c, { phone: "(404) 555-0123", smsConsent: true });
    assert.equal(res.status, 200);
    assert.equal(received.length, 1);
    const [r] = received;
    assert.equal(r.event.type, "client.opted_in");
    assert.equal(r.event.client.phone, "+14045550123");
    assert.equal(r.event.client.name, "Nina Test");
    assert.equal(r.event.client.timezone, "America/New_York");
    assert.ok(r.event.eventId);
    assert.ok(verifies(r), "the signature is valid for the exact body that was sent");
  });

  test("without the box ticked, nothing is sent, whatever the phone field holds", async () => {
    const c = await newClient();
    assert.equal((await onboard(c, { phone: "404-555-0123", smsConsent: false })).status, 200);
    assert.equal((await onboard(c, { phone: "", smsConsent: false })).status, 200);
    await sleep(300);
    assert.equal(received.length, 0);
  });

  test("consent needs a real mobile number", async () => {
    const c = await newClient();
    for (const phone of ["", "555-0100", "12345", "abcdefghij", "000-000-0000", "404-155-0123"]) {
      const res = await onboard(c, { phone, smsConsent: true });
      assert.equal(res.status, 422, `rejects ${JSON.stringify(phone)}`);
      assert.match((await res.json()).error, /valid mobile number/);
    }
    assert.equal(received.length, 0);
  });

  test("different ways of typing a US number all arrive the same", async () => {
    for (const phone of ["404-555-0123", "404.555.0123", "1 404 555 0123", "+1 (404) 555-0123", "+14045550123"]) {
      received.length = 0;
      const c = await newClient();
      assert.equal((await onboard(c, { phone, smsConsent: true })).status, 200, phone);
      assert.equal(received[0].event.client.phone, "+14045550123", phone);
    }
  });

  test("a number from another country needs its + and country code", async () => {
    const c = await newClient();
    assert.equal((await onboard(c, { phone: "+44 7700 900123", smsConsent: true })).status, 200);
    assert.equal(received[0].event.client.phone, "+447700900123");
  });

  test("unticking the box later tells the bot to stop; unticking when never ticked tells it nothing", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    received.length = 0;
    assert.equal((await onboard(c, { phone: "404-555-0123", smsConsent: false })).status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].event.type, "client.opted_out");
    assert.ok(verifies(received[0]));

    received.length = 0;
    await onboard(c, { phone: "404-555-0123", smsConsent: false });
    await sleep(300);
    assert.equal(received.length, 0, "already opted out: nothing to say");
  });

  test("the saved choice comes back when they reopen onboarding", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    const page = await (await call("/onboarding", { cookie: c })).text();
    assert.match(page, /Text me session reminders/);
    assert.match(page, /\+14045550123/);
  });
});

describe("bookings and cancellations", { skip }, () => {
  test("a consenting client's booking sends session.booked, and cancelling sends session.cancelled", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    received.length = 0;

    const { id, slot } = await book(c);
    const booked = received.find((r) => r.event.type === "session.booked");
    assert.ok(booked, "booked event sent");
    assert.equal(booked.event.session.id, String(id));
    assert.equal(booked.event.session.date, slot.date);
    assert.equal(booked.event.session.startTime, slot.time);
    assert.equal(booked.event.client.phone, "+14045550123");
    assert.ok(verifies(booked));

    received.length = 0;
    const res = await call(`/api/sessions/${id}`, { method: "PATCH", cookie: await getTrainer(), body: { status: "cancelled" } });
    assert.equal(res.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].event.type, "session.cancelled");
    assert.equal(received[0].event.session.id, String(id));
  });

  test("a client who did not consent is never reported: no booking event, no cancellation event", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: false });
    received.length = 0;
    const { id } = await book(c);
    await call(`/api/sessions/${id}`, { method: "PATCH", cookie: await getTrainer(), body: { status: "cancelled" } });
    await sleep(300);
    assert.equal(received.length, 0);
  });

  test("a client who withdrew consent is not reported either", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    await onboard(c, { phone: "404-555-0123", smsConsent: false });
    received.length = 0;
    await book(c);
    await sleep(300);
    assert.equal(received.length, 0);
  });
});

describe("when the bot is having a bad day", { skip }, () => {
  test("a bot that returns errors never breaks a booking (it tries twice, then gives up)", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    mode = "error";
    received.length = 0;
    const { res } = await book(c);
    assert.equal(res.status, 201);
    const attempts = received.filter((r) => r.event.type === "session.booked");
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].event.eventId, attempts[1].event.eventId, "the retry is the same event, so the bot can dedupe it");
  });

  test("a bot that never answers delays a booking by seconds, not forever, and it still succeeds", async () => {
    const c = await newClient();
    await onboard(c, { phone: "404-555-0123", smsConsent: true });
    mode = "hang";
    const started = Date.now();
    const { res } = await book(c);
    assert.equal(res.status, 201);
    assert.ok(Date.now() - started < 8000, `took ${Date.now() - started}ms`);
  });

  test("a bot that refuses the event (422) is not retried and onboarding still saves", async () => {
    const c = await newClient();
    mode = "refuse";
    const res = await onboard(c, { phone: "404-555-0123", smsConsent: true });
    assert.equal(res.status, 200);
    assert.equal(received.length, 1, "a 4xx would get the same answer again, so it's not retried");
  });
});
