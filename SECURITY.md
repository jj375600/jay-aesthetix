# Security

JAY_AESTHETIX is a portfolio project with clearly fictional demo data, but it is built the way a real
client portal should be: it handles logins, personal health answers and payments-style invoices. This
page explains what is protected, how, and what is deliberately *not* covered yet.

## Reporting a vulnerability

Please open a private report under **Security → Report a vulnerability** on this repository, or email
the address on my GitHub profile. Please don't open a public issue for a security problem.

## Threat model

| # | Threat | Defense | Where |
|---|--------|---------|-------|
| 1 | **Password guessing / credential stuffing** | Failed logins are stored in Postgres. 5 failures for one email lock that email for 15 minutes; 50 failures from one IP block that IP. The check runs *before* bcrypt, so guessing is also cheap for the server to refuse. A correct password clears that email's failures. Responses are `429` with `Retry-After`. | `src/lib/rate-limit.ts`, `api/auth/login` |
| 2 | **Stolen password database** | Passwords are hashed with bcrypt (cost 10); plaintext is never stored or logged. | `api/auth/register` |
| 3 | **Account enumeration** (finding out which emails are registered) | Wrong password and unknown email return the identical `401`. For unknown emails a dummy bcrypt hash is still compared, so timing doesn't differ. Lockouts are keyed on the typed email, so they behave the same for accounts that don't exist. | `api/auth/login`, tests |
| 4 | **Session theft / forgery** | Sessions are HS256-signed JWTs in an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie, so page JavaScript can't read it. The secret comes from the environment, never the repo. The user is re-loaded from the database on every request, so a deleted user stops working immediately. | `src/lib/auth.ts` |
| 5 | **Cross-site request forgery (CSRF)** | `SameSite=Lax` cookies, plus an Origin check: a state-changing API request that a browser says came from another site gets `403`. | `src/proxy.ts` |
| 6 | **Privilege escalation / IDOR** (a client reading or changing someone else's data) | Every API route checks the session; trainer-only routes check the role; client routes filter by the signed-in user's id and ignore any `clientId` they send. Page routes are also gated in the proxy (defense in depth). | `src/lib/api.ts`, tests |
| 7 | **Injection** | All SQL is parameterised (`$1, $2…`), and all input is validated with Zod before use. React escapes output by default. | `src/lib/validators.ts` |
| 8 | **Double-booking races** | A partial unique index in Postgres makes two active sessions for the same trainer/date/time impossible, even under concurrent requests. | `db/schema.sql`, tests |
| 9 | **Clickjacking, MIME sniffing, XSS impact** | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, a Content-Security-Policy that limits where scripts, styles, fonts and images may load from, `Referrer-Policy`, `Permissions-Policy` and HSTS. | `next.config.mjs` |
| 10 | **Vulnerable dependencies** | Dependabot opens weekly update PRs; CI runs `npm audit` on every push; CodeQL scans the code for known vulnerability patterns. | `.github/` |

Every row marked with "tests" is checked automatically on every push (`npm test`), including a test
that proves the protections fail loudly when removed.

## Known limitations (deliberately out of scope for a portfolio app)

- **Lockout can be abused to annoy a user.** Anyone who knows an email can trigger a 15-minute lockout
  by guessing wrong passwords for it. Locking temporarily (not permanently) limits the damage; a
  production system would add CAPTCHA or per-device tokens.
- **IP-based limits trust `x-forwarded-for`.** That is correct on Vercel, which sets the header itself,
  but not safe behind a proxy that passes client-supplied values through.
- **The CSP allows inline scripts** (`'unsafe-inline'`) because Next.js injects small inline bootstrap
  scripts. A per-request nonce would tighten this.
- **Sessions last 7 days and can't be revoked individually** (no server-side session list). Logging out
  deletes the cookie, but a copied token would stay valid until it expires.
- **No email verification or password reset**, and registration reveals whether an email is taken
  (the usual trade-off for a friendly sign-up form).
- **Emails go to whatever address an account was registered with, and addresses aren't verified.** Someone
  could register with another person's email and trigger a booking or cancellation email to it. Emails
  are only sent on those actions, never in bulk, and real delivery is off unless a provider key is
  configured (the public demo only *logs* emails). A production system would verify addresses first.
- **Demo credentials are public on purpose** and the data is fictional. Real deployments must set a
  strong `AUTH_SECRET`, turn off `NEXT_PUBLIC_DEMO_MODE`, and never reuse these passwords.
