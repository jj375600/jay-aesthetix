// Booking / cancellation email tests. With no RESEND_API_KEY set, emails are only recorded ("logged"),
// which is what CI and the public demo use; with a key set they would be "sent". Both are accepted here.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const rnd = () => Math.floor(Math.random() * 256);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;

const call = (path, { method = "GET", cookie, body } = {}) =>
  fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

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
  for (const id of created) await call(`/api/sessions/${id}`, { method: "PATCH", cookie: t, body: { status: "cancelled" } });
});

/** Books a slot near the END of the open list. The other test files use slots near the start or the very end. */
async function book(cookie, extra = {}) {
  const slots = (await (await call("/api/slots?days=14", { cookie })).json()).slots;
  const slot = slots.at(-6);
  const res = await call("/api/sessions", { method: "POST", cookie, body: { date: slot.date, time: slot.time, ...extra } });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  created.push(id);
  return { id, slot };
}

async function emailsFor(sessionId) {
  const res = await call(`/api/emails?sessionId=${sessionId}`, { cookie: await getTrainer() });
  assert.equal(res.status, 200);
  return (await res.json()).emails;
}

// Same wording the app uses for dates in subjects: "Sat, Nov 7".
const shortDate = (ymd) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const STATUSES = ["logged", "sent", "failed"];

describe("booking emails", () => {
  test("a client booking confirms to the client and alerts the trainer", async () => {
    const maya = await login("maya@example.test");
    const { id, slot } = await book(maya);

    const emails = await emailsFor(id);
    const confirmation = emails.find((e) => e.kind === "booking_confirmation");
    const alert = emails.find((e) => e.kind === "booking_alert");

    assert.ok(confirmation, "client confirmation email");
    assert.equal(confirmation.to_email, "maya@example.test");
    assert.match(confirmation.subject, new RegExp(`Session confirmed: ${shortDate(slot.date)}`));
    assert.match(confirmation.body, /Hi Maya/);
    assert.ok(confirmation.body.includes(`/api/sessions/${id}/calendar`), "links to the calendar download");
    assert.ok(STATUSES.includes(confirmation.status));

    assert.ok(alert, "trainer alert email");
    assert.equal(alert.to_email, "jay@jayaesthetix.test");
    assert.match(alert.subject, /New booking: Maya/);
  });

  test("a trainer booking for a client sends only the client's confirmation", async () => {
    const t = await getTrainer();
    const mayaId = (await (await call("/api/sessions", { cookie: t })).json()).sessions.find((s) => s.client_name === "Maya Johnson").client_id;
    const { id } = await book(t, { clientId: mayaId });

    const emails = await emailsFor(id);
    assert.deepEqual(emails.map((e) => e.kind), ["booking_confirmation"]);
    assert.equal(emails[0].to_email, "maya@example.test");
  });
});

describe("cancellation emails", () => {
  test("when the trainer cancels, the client is told", async () => {
    const maya = await login("maya@example.test");
    const { id } = await book(maya);
    const cancel = await call(`/api/sessions/${id}`, { method: "PATCH", cookie: await getTrainer(), body: { status: "cancelled" } });
    assert.equal(cancel.status, 200);

    const mail = (await emailsFor(id)).find((e) => e.kind === "cancellation");
    assert.ok(mail, "cancellation email");
    assert.equal(mail.to_email, "maya@example.test");
    assert.match(mail.subject, /^Session cancelled:/);
  });

  test("when the client cancels, the trainer is told", async () => {
    const maya = await login("maya@example.test");
    const { id } = await book(maya);
    const cancel = await call(`/api/sessions/${id}`, { method: "PATCH", cookie: maya, body: { status: "cancelled" } });
    assert.equal(cancel.status, 200);

    const mail = (await emailsFor(id)).find((e) => e.kind === "cancellation");
    assert.ok(mail, "cancellation email");
    assert.equal(mail.to_email, "jay@jayaesthetix.test");
    assert.match(mail.subject, /^Cancelled: Maya/);
  });

  test("a rejected cancellation (someone else's session) sends nothing", async () => {
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const { id } = await book(maya);
    const before = (await emailsFor(id)).length;
    const attempt = await call(`/api/sessions/${id}`, { method: "PATCH", cookie: marcus, body: { status: "cancelled" } });
    assert.equal(attempt.status, 403);
    assert.equal((await emailsFor(id)).length, before);
  });
});

describe("email log access", () => {
  test("only the trainer can read the log", async () => {
    const maya = await login("maya@example.test");
    assert.equal((await call("/api/emails")).status, 401);
    assert.equal((await call("/api/emails", { cookie: maya })).status, 403);
    assert.equal((await call("/api/emails?sessionId=abc", { cookie: await getTrainer() })).status, 422);
  });

  test("the Email log page is trainer-only", async () => {
    const maya = await login("maya@example.test");
    const anon = await call("/emails");
    assert.ok([302, 303, 307, 308].includes(anon.status));
    assert.match(anon.headers.get("location") ?? "", /\/login/);

    const asClient = await call("/emails", { cookie: maya });
    // With a loading skeleton the page streams, so the redirect may arrive as 200 + an in-page
    // NEXT_REDIRECT instead of a 307. Either way the client must be sent away and see no log.
    const clientBody = await asClient.text();
    if ([302, 303, 307, 308].includes(asClient.status)) {
      assert.ok(true);
    } else {
      assert.equal(asClient.status, 200);
      assert.match(clientBody, /NEXT_REDIRECT/, "client was not redirected");
      assert.doesNotMatch(clientBody, /<table/, "email log table leaked to a client");
    }

    const asTrainer = await call("/emails", { cookie: await getTrainer() });
    assert.equal(asTrainer.status, 200);
    assert.match(await asTrainer.text(), /Email log/);
  });
});
