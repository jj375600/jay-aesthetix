import { pool, query } from "@/lib/db";
import { authed, fail, json, parse } from "@/lib/api";
import { availabilitySchema } from "@/lib/validators";

export async function GET() {
  const [user, err] = await authed("trainer");
  if (err) return err;
  const rows = await query(
    "SELECT weekday, start_time AS start, end_time AS \"end\" FROM availability WHERE trainer_id = $1 ORDER BY weekday, start_time",
    [user!.id]
  );
  return json({ blocks: rows });
}

// Replaces the whole weekly schedule in one transaction.
export async function PUT(req: Request) {
  const [user, authErr] = await authed("trainer");
  if (authErr) return authErr;
  const [d, err] = await parse(req, availabilitySchema);
  if (err) return err;
  if (d.blocks.some((b) => b.end <= b.start)) return fail("Each block must end after it starts", 422);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM availability WHERE trainer_id = $1", [user!.id]);
    for (const b of d.blocks) {
      await client.query(
        "INSERT INTO availability (trainer_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)",
        [user!.id, b.weekday, b.start, b.end]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return json({ ok: true });
}
