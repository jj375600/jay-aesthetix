import { Pool, types } from "pg";

// Return Postgres DATE / TIME / NUMERIC / BIGINT as plain JS values instead of
// Date objects and strings, so the rest of the app stays simple and timezone-safe.
types.setTypeParser(1082, (v: string) => v); // date  -> "2026-10-18"
types.setTypeParser(1083, (v: string) => v.slice(0, 5)); // time -> "06:00"
types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric -> number
types.setTypeParser(20, (v: string) => parseInt(v, 10)); // bigint (count) -> number

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
