import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { createSessionToken, COOKIE, sessionCookieOptions, type Role } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { fail, json, parse } from "@/lib/api";
import { clearLoginFailures, clientIp, loginRetryAfter, recordLoginFailure } from "@/lib/rate-limit";

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function POST(req: Request) {
  const [data, err] = await parse(req, loginSchema);
  if (err) return err;

  // Throttle before doing any password hashing, so guessing is slow and cheap for us to refuse.
  const ip = clientIp(req);
  const wait = await loginRetryAfter(data.email, ip);
  if (wait !== null) {
    const res = NextResponse.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(wait));
    return res;
  }

  const user = await queryOne<{ id: number; role: Role; password_hash: string }>(
    "SELECT id, role, password_hash FROM users WHERE email = $1",
    [data.email]
  );
  const ok = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    await recordLoginFailure(data.email, ip);
    return fail("Incorrect email or password", 401);
  }

  await clearLoginFailures(data.email);
  const res = json({ ok: true });
  res.cookies.set(COOKIE, await createSessionToken(user), sessionCookieOptions());
  return res;
}
