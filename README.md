# JAY_AESTHETIX: Independent Trainer Platform

A full-stack web app for an independent personal trainer: a public marketing site plus a
login-protected portal where **clients** onboard, book sessions, and track progress, and the
**trainer** manages availability, clients, and invoices.

**Live demo:** https://jay-aesthetix.vercel.app/
Sample logins (demo data only): client `maya@example.test` / trainer `jay@jayaesthetix.test`, password `demo1234`.

![Landing page](docs/screenshots/landing.png)

![Trainer dashboard](docs/screenshots/dashboard.png)

![Client portal](docs/screenshots/client-portal.png)

![Booking page](docs/screenshots/booking.png)

> **Portfolio concept project.** All clients, sessions, invoices, and prices are sample data, and
> payments are simulated. Set `NEXT_PUBLIC_DEMO_MODE=false` to hide the demo disclaimers.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL (`pg`) · JWT cookie auth (`jose`, `bcryptjs`) · Zod · Recharts · Vercel + Neon

## Testing & CI

![CI](https://github.com/jj375600/jay-aesthetix/actions/workflows/ci.yml/badge.svg)

Integration tests (`npm test`) run against the real app and database, covering:
- Authentication: HttpOnly cookies and no account enumeration
- Role-based access: clients can't reach trainer endpoints or other clients' data
- Concurrency: 8 simultaneous bookings of one slot produce exactly one booking and seven 409s

GitHub Actions runs typecheck, build, tests and a dependency audit on every push and pull request.

## Features

| Area | What it does |
| --- | --- |
| Marketing site | Hero, packages, how-it-works, about, FAQ, mobile-responsive, branded with the JAY_AESTHETIX identity |
| Auth | Client registration, login/logout, bcrypt-hashed passwords, httpOnly signed-JWT cookie, role-based access (trainer / client) |
| Onboarding | 3-step wizard: goals, health screening (PAR-Q style), schedule preferences. Saved per client and editable |
| Session booking | Trainer sets weekly availability. Clients see open 60-minute slots for 14 days and can book or cancel (12-hour cancellation window) |
| Progress analytics | Log weight, body fat, bench/squat/deadlift. Recharts line charts for body composition and strength |
| Invoice tracking | Trainer creates invoices, marks them paid or void. Overdue status is computed. Revenue chart and outstanding totals |
| Trainer dashboard | KPIs, upcoming sessions, sessions needing close-out, overdue invoices, new leads, 6-month paid revenue |

## Quick start

Requires **Node 20.6+** and a PostgreSQL database.

```bash
npm install
cp .env.example .env.local        # then edit AUTH_SECRET (see the file for a generator command)
docker compose up -d              # optional: local Postgres (or point DATABASE_URL at your own)
npm run db:setup                  # creates tables + loads demo data
npm run dev                       # http://localhost:3000
```

Demo logins (password `demo1234`):

- Trainer: `jay@jayaesthetix.test`
- Client: `maya@example.test`

`npm run db:reset` drops everything and reseeds.

## Design decisions (the interesting parts)

**Double-booking is prevented by the database, not just the UI.** Booking runs two checks. The API
first verifies the slot is inside the trainer's availability, in the future, and free (a friendly
error). The real guarantee is a partial unique index:

```sql
CREATE UNIQUE INDEX sessions_no_double_booking
  ON sessions (trainer_id, session_date, start_time) WHERE status <> 'cancelled';
```

If two people book the same slot at the same instant, Postgres rejects the loser (`23505`) and the API
returns `409`. Cancelling a session frees the slot again because the index ignores cancelled rows.

**One studio, one timezone.** Session times are stored as a `DATE` + `TIME` in studio-local time, with
"now" computed in `America/New_York` via `Intl`. That removes a whole class of timezone and DST bugs for a
single-location business. Multi-location support would move to `timestamptz`.

**Auth.** Passwords are hashed with bcrypt. A 7-day JWT lives in an httpOnly, SameSite=Lax cookie. Middleware
gates page routes, and every API route and server page independently re-checks the user and role from the
database (defense in depth). Login does a dummy bcrypt compare when the email is unknown so timing doesn't leak
which emails exist.

**Validation.** Every request body is parsed with Zod schemas (`src/lib/validators.ts`) and the database has
matching `CHECK` constraints.

**Data access.** Server components query Postgres directly. Mutations go through REST route handlers called
from small client components, followed by `router.refresh()`.

## REST API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` · `/login` · `/logout` | public | Account + session cookie |
| POST | `/api/onboarding` | client | Save onboarding answers (upsert) |
| GET | `/api/slots?from=&days=` | any user | Open bookable slots |
| GET / PUT | `/api/availability` | trainer | Read / replace weekly availability (transaction) |
| GET / POST | `/api/sessions` | any user | List own sessions / book one (`409` on conflict) |
| PATCH | `/api/sessions/:id` | owner | Cancel (client, 12h rule) or cancel/complete (trainer) |
| GET / POST | `/api/progress` | any user | Own entries / add a check-in (trainer can add for a client) |
| GET / POST | `/api/invoices` | any user / trainer | List own invoices / create one |
| PATCH | `/api/invoices/:id` | trainer | Mark paid, void, or reopen |

## Project structure

```
db/schema.sql           tables, constraints, double-booking index
scripts/db-setup.mjs    migrate + seed (demo data)
src/lib/                db pool, auth, slot engine, validators, site config
src/app/api/            REST route handlers
src/app/(app)/          authenticated pages (dashboard, book, progress, invoices, clients, availability)
src/components/         client components (wizard, booking picker, charts, forms)
```

Branding, prices, FAQ and credentials all live in `src/lib/site.ts`. Edit them to rebrand or go live.

## Deploying

1. Create a Postgres database (Neon, Supabase, Railway, or Render all work).
2. Push the repo to GitHub and import it into **Vercel**.
3. Set `DATABASE_URL`, `AUTH_SECRET`, and `NEXT_PUBLIC_DEMO_MODE` in the project's environment variables.
4. Create the tables once from your machine: `DATABASE_URL="<prod url>" node scripts/db-setup.mjs`.
   Note that this also seeds the **demo accounts with a known password**. For anything real, delete those
   users or skip the seed section.

## Known limitations / next steps

- No rate limiting on login/register, no password reset, no email verification or notifications.
- Payments are tracked, not processed (Stripe Checkout would be the natural next step).
- Health screening data is collected for demo purposes. A real deployment needs a privacy policy and
  appropriate handling of sensitive health information.
- Add automated tests (the booking-race behaviour was verified manually with 4 concurrent requests: 1×`201`, 3×`409`).
- Trainer-side booking for a client exists in the API but has no UI yet.
