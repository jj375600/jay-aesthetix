import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Cheap first gate: no valid cookie -> /login. Pages and API routes still check
// the user and role themselves (defense in depth).
const PROTECTED = ["/dashboard", "/onboarding", "/book", "/progress", "/invoices", "/clients", "/availability"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const token = req.cookies.get("jx_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/book/:path*", "/progress/:path*", "/invoices/:path*", "/clients/:path*", "/availability/:path*"],
};
