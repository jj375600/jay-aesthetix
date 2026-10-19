import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "./db";

export const COOKIE = "jx_session";
export type Role = "trainer" | "client";
export type SessionUser = { id: number; role: Role; name: string; email: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (16+ characters). See .env.example.");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: { id: number; role: Role }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

/** Returns the logged-in user (fresh from the DB) or null. */
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    if (!id) return null;
    return await queryOne<SessionUser>("SELECT id, role, name, email FROM users WHERE id = $1", [id]);
  } catch {
    return null;
  }
}

/** For server components/pages: redirect to /login if not signed in. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/dashboard");
  return user;
}
