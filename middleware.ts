import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { getEffectiveUserRole, isSystemAdminEmail } from "@/lib/admin";
import { canAccessPath } from "@/lib/rbac";

const protectedPaths = [
  "/admin",
  "/api/admin",
  "/dashboard",
  "/properties",
  "/tenants",
  "/leases",
  "/transactions",
  "/expenses",
  "/maintenance",
  "/messages",
  "/ai-assessments",
  "/reports",
  "/settings",
  "/units",
  "/manager-guide",
  "/renter-guide"
];

function getSecret() {
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("Missing AUTH_SECRET. Set a long random secret in Vercel.");
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));
  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("rentroll_session")?.value;
  if (!token) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = String(payload.email ?? "");
    const role = getEffectiveUserRole(String(payload.role ?? "") as any, email);

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
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (!canAccessPath(role, pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
