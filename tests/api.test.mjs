// Integration tests: they call the running app over HTTP, so they exercise the real
// routes, validation, auth cookies and the Postgres constraints end to end.
//
//   npm run build && npm start      (in one terminal)
//   npm test                        (in another; set BASE_URL if the app is not on :3000)
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "demo1234";

async function call(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response (redirect, HTML) */
  }
  return { status: res.status, data, headers: res.headers };
}

// Each login comes from a made-up IP so the login rate limiter (see security.test.mjs) never sees the
// whole test run as one client.
const rnd = () => Math.floor(Math.random() * 256);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;

async function login(email, password = PASSWORD) {
  const res = await call("/api/auth/login", {
    method: "POST",
    body: { email, password },
    headers: { "x-forwarded-for": randomIp() },
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ...res, cookie };
}

// Sessions created by these tests; the trainer cancels them afterwards so reruns start clean.
const created = [];
let trainer;
async function getTrainer() {
  trainer ??= await login("jay@jayaesthetix.test");
  return trainer;
}

async function book(cookie, slot) {
  const res = await call("/api/sessions", { method: "POST", cookie, body: { date: slot.date, time: slot.time } });
  if (res.status === 201) created.push(res.data.id);
  return res;
}

after(async () => {
  const t = await getTrainer();
  for (const id of created) {
    await call(`/api/sessions/${id}`, { method: "PATCH", cookie: t.cookie, body: { status: "cancelled" } });
  }
});

describe("authentication", () => {
  test("login succeeds and sets an HttpOnly, SameSite cookie", async () => {
    const res = await login("maya@example.test");
    assert.equal(res.status, 200);
    const setCookie = res.headers.getSetCookie().join(";").toLowerCase();
    assert.match(setCookie, /httponly/);
    assert.match(setCookie, /samesite=lax/);
  });

  test("wrong password and unknown email return the same 401 (no account enumeration)", async () => {
    const wrongPassword = await login("maya@example.test", "not-the-password");
    // A fresh unknown email each run, so repeated runs never trip the login lockout for it.
    const unknownEmail = await login(`nobody-${Math.random().toString(36).slice(2)}@example.test`, "not-the-password");
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(wrongPassword.data, unknownEmail.data);
  });

  test("malformed login input is rejected with 422", async () => {
    const res = await login("not-an-email", "x");
    assert.equal(res.status, 422);
  });

  test("protected API routes reject anonymous requests", async () => {
    assert.equal((await call("/api/sessions")).status, 401);
    assert.equal((await call("/api/slots")).status, 401);
    assert.equal((await call("/api/invoices")).status, 401);
  });

  test("protected pages redirect anonymous visitors to /login", async () => {
    const res = await call("/dashboard");
    assert.ok([302, 303, 307, 308].includes(res.status), `unexpected status ${res.status}`);
    assert.match(res.headers.get("location") ?? "", /\/login/);
  });
});

describe("role-based access control", () => {
  test("a client cannot use trainer-only endpoints", async () => {
    const { cookie } = await login("maya@example.test");
    assert.equal((await call("/api/availability", { cookie })).status, 403);
    const put = await call("/api/availability", { method: "PUT", cookie, body: { blocks: [] } });
    assert.equal(put.status, 403);
    const invoice = await call("/api/invoices", {
      method: "POST",
      cookie,
      body: { clientId: 1, description: "x", amountCents: 100, dueDate: "2030-01-01" },
    });
    assert.equal(invoice.status, 403);
  });

  test("a client cannot cancel another client's session", async () => {
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const slots = (await call("/api/slots?days=14", { cookie: maya.cookie })).data.slots;
    const booked = await book(maya.cookie, slots.at(-3));
    assert.equal(booked.status, 201);
    const attempt = await call(`/api/sessions/${booked.data.id}`, {
      method: "PATCH",
      cookie: marcus.cookie,
      body: { status: "cancelled" },
    });
    assert.equal(attempt.status, 403);
  });

  test("a client only ever sees their own progress, even when asking for someone else's", async () => {
    const t = await getTrainer();
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const mayaId = (await call("/api/sessions", { cookie: t.cookie })).data.sessions.find(
      (s) => s.client_name === "Maya Johnson"
    ).client_id;

    const own = (await call("/api/progress", { cookie: marcus.cookie })).data.entries;
    const spoofed = (await call(`/api/progress?clientId=${mayaId}`, { cookie: marcus.cookie })).data.entries;
    const mayas = (await call("/api/progress", { cookie: maya.cookie })).data.entries;

    assert.deepEqual(spoofed, own);
    assert.notDeepEqual(spoofed, mayas);
  });
});

describe("booking", () => {
  test("rejects invalid dates and slots in the past", async () => {
    const { cookie } = await login("maya@example.test");
    const badFormat = await call("/api/sessions", { method: "POST", cookie, body: { date: "10/19/2030", time: "09:00" } });
    assert.equal(badFormat.status, 422);
    const past = await call("/api/sessions", { method: "POST", cookie, body: { date: "2020-01-06", time: "06:00" } });
    assert.equal(past.status, 409);
  });

  test("simultaneous bookings of one slot: exactly one wins, the rest get 409", async () => {
    const logins = await Promise.all(["maya", "marcus", "priya", "devon"].map((n) => login(`${n}@example.test`)));
    const slots = (await call("/api/slots?days=14", { cookie: logins[0].cookie })).data.slots;
    const slot = slots.at(-1);

    // 8 requests (2 per client) released at the same moment.
    const results = await Promise.all(logins.flatMap((l) => [book(l.cookie, slot), book(l.cookie, slot)]));
    const statuses = results.map((r) => r.status).sort();

    assert.equal(statuses.filter((s) => s === 201).length, 1, `expected one 201, got ${statuses}`);
    assert.equal(statuses.filter((s) => s === 409).length, 7, `expected seven 409s, got ${statuses}`);

    // The booked slot disappears from the open list...
    const taken = (await call("/api/slots?days=14", { cookie: logins[0].cookie })).data.slots;
    assert.ok(!taken.some((s) => s.date === slot.date && s.time === slot.time));

    // ...and comes back once the trainer cancels it, and can then be booked again.
    const t = await getTrainer();
    const winner = results.find((r) => r.status === 201);
    const cancel = await call(`/api/sessions/${winner.data.id}`, {
      method: "PATCH",
      cookie: t.cookie,
      body: { status: "cancelled" },
    });
    assert.equal(cancel.status, 200);
    const reopened = (await call("/api/slots?days=14", { cookie: logins[0].cookie })).data.slots;
    assert.ok(reopened.some((s) => s.date === slot.date && s.time === slot.time));
    assert.equal((await book(logins[1].cookie, slot)).status, 201);
  });
});
