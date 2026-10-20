// Stripe Checkout tests (test mode). These talk to a tiny fake Stripe server started inside this file, so no
// real Stripe account, network or money is involved. The app must be started with `npm run start:test`,
// which points it at that fake server. Against a normally started app the tests skip themselves.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_ci_mock";
const MOCK_PORT = 4010;

const rnd = () => Math.floor(Math.random() * 256);
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;
const call = (path, { method = "GET", cookie, body, headers = {}, raw } = {}) =>
  fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });

async function login(email) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": randomIp() },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// ---------- fake Stripe ----------
const checkoutRequests = []; // what the app sent to "Stripe"
const sessions = new Map(); // id -> session object the fake returns on retrieval
let counter = 0;
let mock;

before(async () => {
  mock = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
        const form = Object.fromEntries(new URLSearchParams(data));
        const id = `cs_test_mock${++counter}`;
        checkoutRequests.push({ auth: req.headers.authorization, form });
        sessions.set(id, {
          id,
          url: `https://checkout.stripe.com/c/pay/${id}`,
          payment_status: "unpaid",
          amount_total: Number(form["line_items[0][price_data][unit_amount]"]),
          currency: "usd",
          metadata: { invoice_id: form["metadata[invoice_id]"] },
        });
        return res.end(JSON.stringify(sessions.get(id)));
      }
      const m = req.url.match(/^\/v1\/checkout\/sessions\/(.+)$/);
      if (req.method === "GET" && m && sessions.has(m[1])) return res.end(JSON.stringify(sessions.get(m[1])));
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise((r) => mock.listen(MOCK_PORT, r));
});

const trainerInvoices = [];
let trainerCookie;
const getTrainer = async () => (trainerCookie ??= await login("jay@jayaesthetix.test"));

after(async () => {
  const t = await getTrainer();
  for (const id of trainerInvoices) await call(`/api/invoices/${id}`, { method: "PATCH", cookie: t, body: { status: "void" } });
  await new Promise((r) => mock.close(r));
});

/** The trainer invoices Maya (so the test has something real to pay). Returns { id, cents }. */
async function newInvoice(amountDollars = 12.34) {
  const t = await getTrainer();
  const mayaId = (await (await call("/api/sessions", { cookie: t })).json()).sessions.find((s) => s.client_name === "Maya Johnson").client_id;
  const res = await call("/api/invoices", {
    method: "POST",
    cookie: t,
    body: { clientId: mayaId, description: "Stripe test invoice", amount: amountDollars, dueDate: "2030-01-01" },
  });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();
  trainerInvoices.push(invoice.id);
  return { id: invoice.id, cents: Math.round(amountDollars * 100) };
}

const status = async (cookie, id) => (await (await call("/api/invoices", { cookie })).json()).invoices.find((i) => i.id === id).status;

const sign = (payload, now = Date.now()) => {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex")}`;
};
const completedEvent = (session) => JSON.stringify({ id: "evt_" + crypto.randomUUID(), type: "checkout.session.completed", data: { object: session } });
const sendWebhook = (payload, signature = sign(payload)) =>
  call("/api/stripe/webhook", { method: "POST", raw: payload, headers: { "content-type": "application/json", "stripe-signature": signature } });

const receiptsFor = async (invoiceNumberRegex) => {
  const emails = (await (await call("/api/emails", { cookie: await getTrainer() })).json()).emails;
  return emails.filter((e) => e.kind === "payment_receipt" && invoiceNumberRegex.test(e.subject));
};

let configured = true;
before(async () => {
  // A request that reaches the Stripe config check tells us whether the app was started with test keys.
  const maya = await login("maya@example.test");
  const probe = await call("/api/invoices/1/checkout", { method: "POST", cookie: maya });
  configured = probe.status !== 501;
});

describe("Stripe checkout (test mode)", () => {
  test("a client can start checkout for their own invoice, and Stripe is sent the right amount", async (t) => {
    if (!configured) return t.skip("start the app with `npm run start:test` to run the Stripe tests");
    const maya = await login("maya@example.test");
    const inv = await newInvoice(12.34);
    const res = await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya });
    assert.equal(res.status, 200);
    assert.match((await res.json()).url, /^https:\/\/checkout\.stripe\.com\//);

    const sent = checkoutRequests.at(-1);
    assert.match(sent.auth, /^Bearer sk_test_/);
    assert.equal(sent.form["line_items[0][price_data][unit_amount]"], String(inv.cents));
    assert.equal(sent.form["line_items[0][price_data][currency]"], "usd");
    assert.equal(sent.form["metadata[invoice_id]"], String(inv.id));
    assert.equal(sent.form.customer_email, "maya@example.test");
    assert.ok(sent.form.success_url.startsWith(BASE + "/invoices?checkout=success"));
  });

  test("nobody else can start checkout for it", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const inv = await newInvoice();
    assert.equal((await call(`/api/invoices/${inv.id}/checkout`, { method: "POST" })).status, 401);
    assert.equal((await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: marcus })).status, 403);
    assert.equal((await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: await getTrainer() })).status, 403);
    assert.equal((await call(`/api/invoices/999999999/checkout`, { method: "POST", cookie: maya })).status, 404);
    assert.equal((await call(`/api/invoices/abc/checkout`, { method: "POST", cookie: maya })).status, 404);
  });

  test("a paid or void invoice can't be paid again", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const trainer = await getTrainer();
    const inv = await newInvoice();
    await call(`/api/invoices/${inv.id}`, { method: "PATCH", cookie: trainer, body: { status: "paid" } });
    assert.equal((await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya })).status, 409);
    await call(`/api/invoices/${inv.id}`, { method: "PATCH", cookie: trainer, body: { status: "void" } });
    assert.equal((await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya })).status, 409);
  });
});

describe("Stripe webhook", () => {
  test("unsigned, wrongly signed and stale requests are rejected", async (t) => {
    if (!configured) return t.skip("not configured");
    const payload = completedEvent({ id: "cs_test_x", payment_status: "paid", amount_total: 100, currency: "usd", metadata: { invoice_id: "1" } });
    assert.equal((await call("/api/stripe/webhook", { method: "POST", raw: payload })).status, 400);
    assert.equal((await sendWebhook(payload, "t=1,v1=deadbeef")).status, 400);
    const forged = `t=${Math.floor(Date.now() / 1000)},v1=${crypto.createHmac("sha256", "whsec_wrong").update("x").digest("hex")}`;
    assert.equal((await sendWebhook(payload, forged)).status, 400);
    // Correctly signed, but 10 minutes old: a replay of a captured request.
    assert.equal((await sendWebhook(payload, sign(payload, Date.now() - 10 * 60_000))).status, 400);
    // Tampering with the body after signing breaks the signature.
    const signature = sign(payload);
    assert.equal((await sendWebhook(payload.replace("100", "1"), signature)).status, 400);
  });

  test("a signed payment event marks the invoice paid and sends receipts exactly once", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const inv = await newInvoice(21.5);
    const number = `INV-${String(inv.id).padStart(4, "0")}`;
    assert.equal(await status(maya, inv.id), "sent");

    const event = completedEvent({ id: "cs_test_w1", payment_status: "paid", amount_total: inv.cents, currency: "usd", metadata: { invoice_id: String(inv.id) } });
    assert.equal((await sendWebhook(event)).status, 200);
    assert.equal(await status(maya, inv.id), "paid");

    // Stripe retries and double-delivers events: the second one must change nothing and send nothing.
    assert.equal((await sendWebhook(event)).status, 200);
    assert.equal(await status(maya, inv.id), "paid");
    const receipts = await receiptsFor(new RegExp(number));
    assert.equal(receipts.length, 1, "exactly one receipt");
    assert.equal(receipts[0].to_email, "maya@example.test");
  });

  test("the amount Stripe charged must match the invoice, or nothing is marked paid", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const inv = await newInvoice(50);
    const wrongAmount = completedEvent({ id: "cs_test_w2", payment_status: "paid", amount_total: 100, currency: "usd", metadata: { invoice_id: String(inv.id) } });
    const wrongCurrency = completedEvent({ id: "cs_test_w3", payment_status: "paid", amount_total: inv.cents, currency: "eur", metadata: { invoice_id: String(inv.id) } });
    const unpaid = completedEvent({ id: "cs_test_w4", payment_status: "unpaid", amount_total: inv.cents, currency: "usd", metadata: { invoice_id: String(inv.id) } });
    for (const e of [wrongAmount, wrongCurrency, unpaid]) assert.equal((await sendWebhook(e)).status, 200);
    assert.equal(await status(maya, inv.id), "sent");
  });

  test("unrelated events and junk invoice ids are acknowledged and ignored", async (t) => {
    if (!configured) return t.skip("not configured");
    const other = JSON.stringify({ id: "evt_1", type: "charge.refunded", data: { object: {} } });
    assert.equal((await sendWebhook(other)).status, 200);
    for (const bad of ["abc", "-5", "99999999999999", ""]) {
      const e = completedEvent({ id: "cs_test_j", payment_status: "paid", amount_total: 100, currency: "usd", metadata: { invoice_id: bad } });
      assert.equal((await sendWebhook(e)).status, 200, `invoice_id=${bad}`);
    }
  });
});

describe("returning from Stripe", () => {
  test("the return page confirms the payment with Stripe even if the webhook never arrives", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const inv = await newInvoice(33);
    const started = await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya });
    assert.equal(started.status, 200);
    const sessionId = [...sessions.keys()].at(-1);

    // The customer pays on Stripe's side.
    sessions.get(sessionId).payment_status = "paid";

    const page = await call(`/invoices?checkout=success&session_id=${sessionId}`, { cookie: maya });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Payment received/);
    assert.equal(await status(maya, inv.id), "paid");
  });

  test("someone else's checkout session can't be used to mark an invoice paid", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const marcus = await login("marcus@example.test");
    const inv = await newInvoice(44);
    await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya });
    const sessionId = [...sessions.keys()].at(-1);
    sessions.get(sessionId).payment_status = "paid";

    await call(`/invoices?checkout=success&session_id=${sessionId}`, { cookie: marcus }); // Marcus replays Maya's session id
    assert.equal(await status(maya, inv.id), "sent");
  });

  test("an unpaid session leaves the invoice unpaid", async (t) => {
    if (!configured) return t.skip("not configured");
    const maya = await login("maya@example.test");
    const inv = await newInvoice(15);
    await call(`/api/invoices/${inv.id}/checkout`, { method: "POST", cookie: maya });
    const sessionId = [...sessions.keys()].at(-1);
    const page = await call(`/invoices?checkout=success&session_id=${sessionId}`, { cookie: maya });
    assert.doesNotMatch(await page.text(), /Payment received/);
    assert.equal(await status(maya, inv.id), "sent");
  });
});
