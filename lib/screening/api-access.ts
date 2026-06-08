import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { assertManagerScreeningAccess, resolveScreeningApplication } from "@/lib/screening/service";

export async function requireManagerScreeningApiAccess(id: string) {
  const user = await getCurrentUser();
  if (!user) throw Object.assign(new Error("Authentication required."), { status: 401 });
  const application = await resolveScreeningApplication(id);
  try {
    await assertManagerScreeningAccess(application, user);
  } catch {
    throw Object.assign(new Error("Forbidden."), { status: 403 });
  }
  return { user, application };
}

export function screeningApiError(error: unknown) {
  const status = Number((error as { status?: number })?.status) || 400;
  return {
    status,
    message: error instanceof Error ? error.message : "Screening request failed."
  };
}
