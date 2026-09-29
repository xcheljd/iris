import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });

  if (!token) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // The app icons (app/icon.*, app/favicon.*) must load for signed-out
  // visitors too — the login page's own tab icon — so they skip the gate.
  matcher: ["/((?!login|api/auth|api/recover|_next/static|_next/image|favicon\\.(?:ico|svg)$|icon\\.(?:svg|png)$).*)"],
};
