import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hashPassword, verifyPassword } from "@/lib/password";
import { getOrganizationById, getUserById, type UserRole } from "@/lib/store";
import { canAccessPath } from "@/lib/rbac";

const SESSION_COOKIE = "rentroll_session";
const encoder = new TextEncoder();

type SessionPayload = {
  sub: string;
  organizationId: string;
  role: UserRole;
  email: string;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? "dev-secret-change-me";
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encoder.encode(getAuthSecret()));

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, encoder.encode(getAuthSecret()));
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await getUserById(session.sub);
  if (!user) return null;
  const organization = await getOrganizationById(user.organizationId);
  if (!organization) return null;
  return { ...user, organization };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRoles(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}

export async function requireRouteAccess(pathname: string) {
  const user = await requireUser();
  if (!canAccessPath(user.role, pathname)) {
    redirect("/dashboard");
  }
  return user;
}
