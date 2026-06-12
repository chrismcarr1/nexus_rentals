import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { getEffectiveUserRole, isSystemAdminEmail } from "@/lib/admin";
import { canAccessPath } from "@/lib/rbac";

const protectedPaths = [
  "/admin",
  "/api/admin",
  "/api/export",
  "/api/leases",
  "/api/maintenance",
  "/api/stripe/connect",
  "/api/tenant-invites/accept",
  "/api/tenant-invites/revoke",
  "/api/tenant-invites/send",
  "/api/upload",
  "/dashboard",
  "/legal",
  "/properties",
  "/tenants",
  "/leases",
  "/applications",
  "/move-ins",
  "/operations",
  "/transactions",
  "/expenses",
  "/maintenance",
  "/documents",
  "/messages",
  "/ai-assessments",
  "/reports",
  "/settings",
  "/units",
  "/manager-guide",
  "/renter-guide"
];

function getSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    return new TextEncoder().encode(secret);
  }
  // Must match lib/auth.ts: the known fallback only signs/verifies sessions in
  // genuine local development; any other environment requires a real secret.
  if (process.env.NODE_ENV === "development") {
    return new TextEncoder().encode("dev-secret-change-me");
  }
  throw new Error("Missing AUTH_SECRET. Set a long random secret in Vercel.");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");
  const isApi = pathname.startsWith("/api/");

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("rentroll_session")?.value;
  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = String(payload.email ?? "");
    const role = getEffectiveUserRole(String(payload.role ?? "") as any, email);

    // The legal acceptance gate must stay reachable for every authenticated
    // role (including system admins) or the requireUser() redirect to
    // /legal/accept would loop against the role-based redirects below.
    if (pathname.startsWith("/legal")) {
      return NextResponse.next();
    }

    if (isAdminPage || isAdminApi) {
      if (!isSystemAdminEmail(email)) {
        if (isAdminApi) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    }

    if (isSystemAdminEmail(email)) {
      if (isApi) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    // Protected API routes enforce their own role and resource-level access.
    // Let them return JSON instead of redirecting fetch requests to an HTML page.
    if (isApi) {
      return NextResponse.next();
    }

    if (!canAccessPath(role, pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
