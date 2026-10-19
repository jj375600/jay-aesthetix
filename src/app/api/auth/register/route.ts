import bcrypt from "bcryptjs";
import { queryOne } from "@/lib/db";
import { createSessionToken, COOKIE, sessionCookieOptions } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { fail, json, parse } from "@/lib/api";

export async function POST(req: Request) {
  const [data, err] = await parse(req, registerSchema);
  if (err) return err;

  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [data.email]);
  if (existing) return fail("An account with that email already exists", 409);

  const hash = await bcrypt.hash(data.password, 10);
  const user = await queryOne<{ id: number }>(
    "INSERT INTO users (role, name, email, password_hash) VALUES ('client', $1, $2, $3) RETURNING id",
    [data.name, data.email, hash]
  );
  const res = json({ ok: true, next: "/onboarding" }, 201);
  res.cookies.set(COOKIE, await createSessionToken({ id: user!.id, role: "client" }), sessionCookieOptions());
  return res;
}
