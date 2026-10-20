// Creates the tables and loads clearly-fictional demo data.
//   npm run db:setup   -> create tables, seed only if the database is empty
//   npm run db:reset   -> drop everything, recreate, reseed
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const reset = process.argv.includes("--reset");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

try {
  if (reset) {
    await client.query(
      "DROP TABLE IF EXISTS login_attempts, invoices, progress_entries, sessions, availability, client_profiles, users CASCADE"
    );
    console.log("Dropped existing tables.");
  }
  await client.query(fs.readFileSync(path.join(here, "../db/schema.sql"), "utf8"));
  console.log("Schema ready.");

  const { rows } = await client.query("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log("Database already has users, skipping seed. (Use `npm run db:reset` to start over.)");
    process.exit(0);
  }

  const hash = await bcrypt.hash("demo1234", 10);
  const addUser = async (role, name, email) =>
    (
      await client.query(
        "INSERT INTO users (role, name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
        [role, name, email, hash]
      )
    ).rows[0].id;

  const trainerId = await addUser("trainer", "Jay", "jay@jayaesthetix.test");

  // Weekly availability: 0 = Sunday ... 6 = Saturday
  const blocks = [
    [1, "06:00", "10:00"], [1, "16:00", "19:00"],
    [2, "07:00", "11:00"], [2, "16:00", "20:00"],
    [3, "06:00", "10:00"], [3, "16:00", "19:00"],
    [4, "07:00", "11:00"], [4, "16:00", "20:00"],
    [5, "06:00", "10:00"], [5, "16:00", "19:00"],
    [6, "08:00", "12:00"],
  ];
  for (const [d, s, e] of blocks) {
    await client.query(
      "INSERT INTO availability (trainer_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)",
      [trainerId, d, s, e]
    );
  }

  const clients = [
    { name: "Maya Johnson", email: "maya@example.test", goal: "Lose 15 lb and build a consistent routine", exp: "beginner", target: 163, status: "active",
      slots: [[1, "06:00"], [4, "17:00"]], flags: [] },
    { name: "Marcus Lee", email: "marcus@example.test", goal: "Add strength: 225 bench, 315 deadlift", exp: "intermediate", target: 190, status: "active",
      slots: [[2, "07:00"], [5, "16:00"]], flags: ["I have a bone or joint problem that exercise could worsen"], injury: "Past left shoulder injury; avoid heavy overhead work at first" },
    { name: "Priya Patel", email: "priya@example.test", goal: "Tone up and improve mobility", exp: "beginner", target: 138, status: "active",
      slots: [[3, "17:00"], [6, "09:00"]], flags: [] },
    { name: "Devon Carter", email: "devon@example.test", goal: "Drop body fat before a summer trip", exp: "intermediate", target: 195, status: "active",
      slots: [[1, "17:00"], [4, "08:00"]], flags: [] },
    { name: "Sofia Ramirez", email: "sofia@example.test", goal: "Get started with strength training", exp: "beginner", target: null, status: "lead",
      slots: [], flags: [] },
  ];

  const ids = {};
  for (const c of clients) {
    const id = await addUser("client", c.name, c.email);
    ids[c.name] = id;
    await client.query(
      `INSERT INTO client_profiles
        (user_id, phone, goal, experience, target_weight, injuries, medical_notes, par_q_flags,
         sessions_per_week, preferred_days, preferred_time, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, "555-0100", c.goal, c.exp, c.target, c.injury ?? null, null, c.flags,
       Math.max(c.slots.length, 2), ["Mon", "Thu"], "any", c.status]
    );
  }

  // Sessions: 6 weeks of history + 2 weeks upcoming, one cancellation for realism.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cancelled = false;
  for (const c of clients) {
    for (let offset = -42; offset <= 14; offset++) {
      const day = addDays(today, offset);
      for (const [weekday, time] of c.slots) {
        if (day.getDay() !== weekday) continue;
        let status = offset < 0 ? "completed" : "booked";
        if (!cancelled && offset > 3 && c.name === "Devon Carter") {
          status = "cancelled";
          cancelled = true;
        }
        await client.query(
          `INSERT INTO sessions (trainer_id, client_id, session_date, start_time, status, type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [trainerId, ids[c.name], ymd(day), time, status,
           weekday % 2 ? "Strength training" : "Conditioning + mobility"]
        );
      }
    }
  }

  // Progress: 12 weekly check-ins per active client.
  const curves = {
    "Maya Johnson":  { w: [178, 168], bf: [31, 27.5], lifts: [0, 0, 0] },
    "Marcus Lee":    { w: [180, 184], bf: [17, 15.5], lifts: [155, 185, 205, 245, 245, 295] },
    "Priya Patel":   { w: [145, 141], bf: [28, 25.5], lifts: [65, 85, 95, 125, 115, 155] },
    "Devon Carter":  { w: [210, 199], bf: [24, 20], lifts: [185, 205, 225, 255, 275, 315] },
  };
  for (const [name, cv] of Object.entries(curves)) {
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const lerp = (a, b) => a + (b - a) * t;
      const lift = (k) => (cv.lifts[0] === 0 ? null : Math.round((lerp(cv.lifts[k * 2], cv.lifts[k * 2 + 1])) / 5) * 5);
      await client.query(
        `INSERT INTO progress_entries (client_id, entry_date, weight_lb, body_fat_pct, bench_lb, squat_lb, deadlift_lb)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ids[name], ymd(addDays(today, -77 + i * 7)),
         (lerp(cv.w[0], cv.w[1]) + Math.sin(i * 1.7) * 0.6).toFixed(1),
         lerp(cv.bf[0], cv.bf[1]).toFixed(1),
         lift(0), lift(1), lift(2)]
      );
    }
  }

  // Invoices: a mix of paid, outstanding and overdue.
  const inv = [
    ["Maya Johnson", "8-session pack", 44000, -60, -46, "paid"],
    ["Maya Johnson", "8-session pack", 44000, -25, -11, "paid"],
    ["Maya Johnson", "8-session pack", 44000, -2, 12, "sent"],
    ["Marcus Lee", "Monthly coaching plan", 32000, -70, -56, "paid"],
    ["Marcus Lee", "Monthly coaching plan", 32000, -40, -26, "paid"],
    ["Marcus Lee", "Monthly coaching plan", 32000, -10, 4, "sent"],
    ["Priya Patel", "8-session pack", 44000, -50, -36, "paid"],
    ["Priya Patel", "4 single sessions", 24000, -20, -6, "sent"],
    ["Devon Carter", "Monthly coaching plan", 32000, -45, -31, "paid"],
    ["Devon Carter", "Monthly coaching plan", 32000, -15, -1, "sent"],
  ];
  let n = 1;
  for (const [name, desc, cents, issued, due, status] of inv) {
    await client.query(
      `INSERT INTO invoices (number, trainer_id, client_id, description, amount_cents, issued_date, due_date, status, paid_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [`INV-${String(n++).padStart(4, "0")}`, trainerId, ids[name], desc, cents,
       ymd(addDays(today, issued)), ymd(addDays(today, due)), status,
       status === "paid" ? ymd(addDays(today, due - 3)) : null]
    );
  }

  console.log("Seeded demo data.");
  console.log("  Trainer: jay@jayaesthetix.test / demo1234");
  console.log("  Client:  maya@example.test / demo1234");
} finally {
  await client.end();
}
