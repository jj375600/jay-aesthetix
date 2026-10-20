// Security tests: brute-force throttling, security headers and cross-site request blocking.
// Same setup as api.test.mjs (app running, `npm test`). Every test uses made-up emails and IPs,
// so no demo account is ever locked out.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Random across ~16 million addresses, so reruns never share a rate-limit bucket by accident.
const randomIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;
const rnd = () => Math.floor(Math.random() * 256);

function attempt(email, password, { ip, origin } = {}) {
  return fetch(BASE + "/api/auth/login", {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
}

describe("brute-force protection", () => {
  test("an email is locked after 5 failed logins (429 + Retry-After)", async () => {
    const email = `lock-${randomUUID()}@example.test`;
    const ip = randomIp();
    for (let i = 1; i <= 5; i++) {
      assert.equal((await attempt(email, "wrong-" + i, { ip })).status, 401, `attempt ${i}`);
    }
    const blocked = await attempt(email, "wrong-6", { ip });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0, "Retry-After header should be set");

    // Locking is by the typed email, so a different email from a different IP is unaffected.
    const other = await attempt(`other-${randomUUID()}@example.test`, "wrong", { ip: randomIp() });
    assert.equal(other.status, 401);
  });

  test("a lockout looks the same for accounts that exist and ones that don't (no enumeration)", async () => {
    // Failures are counted for any typed email, so an unknown email locks exactly like a real one.
    const email = `ghost-${randomUUID()}@example.test`;
    const ip = randomIp();
    for (let i = 0; i < 5; i++) await attempt(email, "nope", { ip });
    const res = await attempt(email, "nope", { ip });
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /too many failed attempts/i);
  });

  test("an IP is blocked after 50 failures, even across different emails", async () => {
    const ip = randomIp();
    for (let i = 0; i < 50; i++) {
      assert.equal((await attempt(`spray-${randomUUID()}@example.test`, "password1", { ip })).status, 401);
    }
    assert.equal((await attempt(`spray-${randomUUID()}@example.test`, "password1", { ip })).status, 429);
  });

  test("a successful login clears earlier failures for that email", async () => {
    const email = "devon@example.test";
    const wrong = () => attempt(email, "not-the-password", { ip: randomIp() });
    const right = () => attempt(email, "demo1234", { ip: randomIp() });
    for (let i = 0; i < 4; i++) assert.equal((await wrong()).status, 401);
    assert.equal((await right()).status, 200);
    // 4 more failures would be 8 in total if the first 4 still counted, which would trigger a lockout.
    for (let i = 0; i < 4; i++) assert.equal((await wrong()).status, 401);
    assert.equal((await right()).status, 200);
  });
});

describe("security headers", () => {
  test("pages are served with hardening headers and don't advertise the framework", async () => {
    const res = await fetch(BASE + "/login");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  });

  test("API responses carry them too", async () => {
    const res = await fetch(BASE + "/api/sessions");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  test("production builds send a Content-Security-Policy that blocks framing and plugins", async (t) => {
    const res = await fetch(BASE + "/login");
    const csp = res.headers.get("content-security-policy");
    if (!csp) return t.skip("CSP is production-only (run `npm run build && npm start`)");
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /default-src 'self'/);
    assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=/);
  });
});

describe("cross-site request blocking", () => {
  test("a state-changing API request from another origin is refused", async () => {
    const res = await attempt("maya@example.test", "demo1234", { ip: randomIp(), origin: "https://evil.example" });
    assert.equal(res.status, 403);
  });

  test("the literal 'null' origin is refused too", async () => {
    const res = await attempt("maya@example.test", "demo1234", { ip: randomIp(), origin: "null" });
    assert.equal(res.status, 403);
  });

  test("a same-origin request is allowed", async () => {
    const res = await attempt("maya@example.test", "demo1234", { ip: randomIp(), origin: BASE });
    assert.equal(res.status, 200);
  });
});
