-- JAY-AESTHETIX schema (PostgreSQL)
-- All session times are "studio local time" (one studio, one timezone), stored as
-- a DATE + TIME pair. That keeps slot math simple and avoids timezone bugs.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('trainer', 'client')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per client: the multi-step onboarding questionnaire.
CREATE TABLE IF NOT EXISTS client_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone          TEXT,
  goal           TEXT NOT NULL,
  experience     TEXT NOT NULL CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  target_weight  NUMERIC(5,1),
  injuries       TEXT,
  medical_notes  TEXT,
  par_q_flags    TEXT[] NOT NULL DEFAULT '{}',
  sessions_per_week INTEGER NOT NULL DEFAULT 2 CHECK (sessions_per_week BETWEEN 1 AND 7),
  preferred_days TEXT[] NOT NULL DEFAULT '{}',
  preferred_time TEXT NOT NULL DEFAULT 'any' CHECK (preferred_time IN ('morning', 'afternoon', 'evening', 'any')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'paused')),
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The trainer's weekly availability blocks (0 = Sunday ... 6 = Saturday).
CREATE TABLE IF NOT EXISTS availability (
  id           SERIAL PRIMARY KEY,
  trainer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  trainer_id   INTEGER NOT NULL REFERENCES users(id),
  client_id    INTEGER NOT NULL REFERENCES users(id),
  session_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  type         TEXT NOT NULL DEFAULT 'Strength training',
  status       TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- THE double-booking guard: the database itself refuses two active sessions
-- for the same trainer at the same date/time, even under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_no_double_booking
  ON sessions (trainer_id, session_date, start_time)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS sessions_client_idx ON sessions (client_id, session_date);

CREATE TABLE IF NOT EXISTS progress_entries (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date    DATE NOT NULL,
  weight_lb     NUMERIC(5,1),
  body_fat_pct  NUMERIC(4,1),
  bench_lb      INTEGER,
  squat_lb      INTEGER,
  deadlift_lb   INTEGER,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS progress_client_idx ON progress_entries (client_id, entry_date);

CREATE TABLE IF NOT EXISTS invoices (
  id            SERIAL PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,
  trainer_id    INTEGER NOT NULL REFERENCES users(id),
  client_id     INTEGER NOT NULL REFERENCES users(id),
  description   TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  issued_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  paid_date     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);

-- Failed logins, used to throttle brute-force guessing (see src/lib/rate-limit.ts).
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, created_at);

-- Every email the app sends (confirmations, cancellations). Shown to the trainer on the Email log page,
-- so the feature is visible even when no real email provider is configured. See src/lib/email.ts.
CREATE TABLE IF NOT EXISTS email_log (
  id         BIGSERIAL PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('logged', 'sent', 'failed')),
  error      TEXT,
  session_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_session_idx ON email_log (session_id);
