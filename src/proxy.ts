import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Cheap first gate: no valid cookie -> /login. Pages and API routes still check
// the user and role themselves (defense in depth).
const PROTECTED = ["/dashboard", "/onboarding", "/book", "/progress", "/invoices", "/clients", "/availability", "/emails"];

function sameHost(origin: string, host: string | null) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // includes the literal "null" origin sent by sandboxed or cross-origin redirected requests
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defense on top of the SameSite=Lax cookie: a state-changing API request that a browser says
  // came from a different site (Origin header) is refused. Non-browser clients send no Origin and pass.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin !== null && !sameHost(origin, req.headers.get("host"))) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    return NextResponse.next();
  }

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
  matcher: ["/api/:path*", "/dashboard/:path*", "/onboarding/:path*", "/book/:path*", "/progress/:path*", "/invoices/:path*", "/clients/:path*", "/availability/:path*", "/emails/:path*"],
};
