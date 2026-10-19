import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUser, type Role, type SessionUser } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Parse a request body; returns [data] or [null, errorResponse]. */
export async function parse<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<[T, null] | [null, NextResponse]> {
  try {
    return [schema.parse(await req.json()), null];
  } catch (e) {
    if (e instanceof ZodError) return [null, fail(e.issues[0]?.message ?? "Invalid input", 422)];
    return [null, fail("Invalid request body", 400)];
  }
}

/** Auth guard for API routes. */
export async function authed(role?: Role): Promise<[SessionUser, null] | [null, NextResponse]> {
  const user = await getUser();
  if (!user) return [null, fail("Please sign in", 401)];
  if (role && user.role !== role) return [null, fail("Not allowed", 403)];
  return [user, null];
}
