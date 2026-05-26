type UserRole = "ADMIN" | "MANAGER" | "TENANT";

export const SYSTEM_ADMIN_EMAIL = "chriscarr4433@gmail.com";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isSystemAdminEmail(email?: string | null) {
  return Boolean(email && normalizeEmail(email) === SYSTEM_ADMIN_EMAIL);
}

export function getEffectiveUserRole(role: UserRole, email: string): UserRole {
  if (isSystemAdminEmail(email)) return "ADMIN";
  return role === "ADMIN" ? "MANAGER" : role;
}
