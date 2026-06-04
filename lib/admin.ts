type UserRole = "ADMIN" | "MANAGER" | "TENANT";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getSystemAdminEmail() {
  return process.env.SYSTEM_ADMIN_EMAIL ? normalizeEmail(process.env.SYSTEM_ADMIN_EMAIL) : "";
}

export function isSystemAdminEmail(email?: string | null) {
  const systemAdminEmail = getSystemAdminEmail();
  return Boolean(email && systemAdminEmail && normalizeEmail(email) === systemAdminEmail);
}

export function getEffectiveUserRole(role: UserRole, email: string): UserRole {
  if (isSystemAdminEmail(email)) return "ADMIN";
  return role === "ADMIN" ? "MANAGER" : role;
}
