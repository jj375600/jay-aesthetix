import bcrypt from "bcryptjs";
import { queryOne } from "@/lib/db";
import { createSessionToken, COOKIE, sessionCookieOptions, type Role } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { fail, json, parse } from "@/lib/api";

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function POST(req: Request) {
  const [data, err] = await parse(req, loginSchema);
  if (err) return err;

  const user = await queryOne<{ id: number; role: Role; password_hash: string }>(
    "SELECT id, role, password_hash FROM users WHERE email = $1",
    [data.email]
  );
  const ok = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return fail("Incorrect email or password", 401);

  const res = json({ ok: true });
  res.cookies.set(COOKIE, await createSessionToken(user), sessionCookieOptions());
  return res;
}
