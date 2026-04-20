import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { canAccessPath } from "@/lib/rbac";

const protectedPaths = [
  "/dashboard",
  "/properties",
  "/tenants",
  "/leases",
  "/transactions",
  "/expenses",
  "/maintenance",
  "/ai-assessments",
  "/reports",
  "/settings",
  "/units"
];

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("rentroll_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = String(payload.role ?? "") as any;
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
