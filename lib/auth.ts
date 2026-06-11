import "server-only";

import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getEffectiveUserRole, isSystemAdminEmail } from "@/lib/admin";
import { LEGAL_ACCEPT_PATH, requiresLegalAcceptance } from "@/lib/legal";
import { getOrganizationById, getUserById, type UserRole } from "@/lib/store";
import { canAccessPath } from "@/lib/rbac";
import { isRetiredAccountEmail } from "@/lib/retired-accounts";

const SESSION_COOKIE = "rentroll_session";
const encoder = new TextEncoder();

type SessionPayload = {
  sub: string;
  organizationId: string;
  role: UserRole;
  email: string;
  // Session-revocation version captured when the token was issued. Compared
  // against the user's current sessionVersion on every authenticated request.
  sessionVersion: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
    return secret;
  }
  // The fallback is a publicly-known string, so it must never sign real sessions.
  // Only the explicit local development mode may use it; preview/staging/test
  // deployments must provide a real secret or sessions cannot be issued.
  if (process.env.NODE_ENV === "development") {
    return "dev-secret-change-me";
  }
  throw new Error("Missing AUTH_SECRET. Set a long random secret in the environment.");
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

// Request-scoped: the layout and the page each call requireUser(), and
// getPortalContext() memoizes by user object identity. Deduplicating here means
// both receive the same instance, so the portal context is computed once per
// request instead of twice (and the user/org store reads run once).
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  try {
    const user = await getUserById(session.sub);
    if (!user) return null;
    if (user.isActive === false) return null;
    if (isRetiredAccountEmail(user.email)) return null;
    // Reject tokens issued before the user's session version was last advanced
    // (logout, password reset, account disable, role/email change).
    if ((user.sessionVersion ?? 0) !== (session.sessionVersion ?? 0)) return null;
    const organization = await getOrganizationById(user.organizationId);
    if (!organization) return null;
    return { ...user, role: getEffectiveUserRole(user.role, user.email), organization };
  } catch (error) {
    console.error("[auth] Failed to load current user from database", error);
    return null;
  }
});

// Mandatory account-level legal gate: every protected page and server action
// that calls requireUser() (directly or via requireRoles/requireSystemAdmin)
// is blocked until the user has accepted the current Terms of Service and
// Privacy Policy and verified they are 18+. The /legal/accept page and its
// actions must use getCurrentUser() directly to avoid a redirect loop.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (requiresLegalAcceptance(user)) {
    redirect(LEGAL_ACCEPT_PATH);
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

export async function requireSystemAdmin() {
  const user = await requireUser();
  if (!isSystemAdminEmail(user.email)) {
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
