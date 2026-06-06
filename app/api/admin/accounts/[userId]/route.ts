import { z } from "zod";

import { getEffectiveUserRole, getSystemAdminEmail, isSystemAdminEmail, normalizeEmail } from "@/lib/admin";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { getCurrentUser } from "@/lib/auth";
import { formatPhoneNumber } from "@/lib/phone";
import { createId, nowIso, updateStore } from "@/lib/store";

const accountUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(180),
  role: z.enum(["MANAGER", "TENANT"]),
  isActive: z.boolean(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  title: z.string().trim().max(120).optional().or(z.literal(""))
});

function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await getCurrentUser();

  if (!admin) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!isSystemAdminEmail(admin.email)) {
    return forbidden();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = accountUpdateSchema.safeParse(body);
  if (!result.success) {
    return Response.json({ error: "Review the account fields and try again." }, { status: 400 });
  }

  const { userId } = await params;
  const parsed = result.data;
  const nextEmail = normalizeEmail(parsed.email);
  const systemAdminEmail = getSystemAdminEmail();
  const isReservedAdminEmail = Boolean(systemAdminEmail && nextEmail === systemAdminEmail);
  let targetExists = false;
  let updatedAdminAccount = false;

  try {
    await updateStore((store) => {
      const target = store.users.find((user) => user.id === userId);
      if (!target) return store;

      targetExists = true;
      const currentTargetIsAdmin = isSystemAdminEmail(target.email);

      if (currentTargetIsAdmin && nextEmail !== systemAdminEmail) {
        throw new Error("The system admin email cannot be changed.");
      }

      if (!currentTargetIsAdmin && isReservedAdminEmail) {
        throw new Error("That email is reserved for the system admin account.");
      }

      const duplicateEmail = store.users.some((user) => user.id !== userId && normalizeEmail(user.email) === nextEmail);
      if (duplicateEmail) {
        throw new Error("Another account already uses that email.");
      }

      if (currentTargetIsAdmin && !parsed.isActive) {
        throw new Error("The system admin account cannot be deactivated.");
      }

      const updatedAt = nowIso();
      const role = currentTargetIsAdmin ? "ADMIN" : getEffectiveUserRole(parsed.role, nextEmail);
      const phone = formatPhoneNumber(parsed.phone) || undefined;
      const title = parsed.title || undefined;
      const previousEmail = target.email;

      const users = store.users.map((user) =>
        user.id === userId
          ? {
              ...user,
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              email: nextEmail,
              role,
              isActive: currentTargetIsAdmin ? true : parsed.isActive,
              phone,
              title,
              updatedAt
            }
          : user
      );

      let tenants = store.tenants;
      if (role === "TENANT") {
        const tenantIndex = tenants.findIndex(
          (tenant) =>
            tenant.organizationId === target.organizationId &&
            tenant.email &&
            (normalizeEmail(tenant.email) === normalizeEmail(previousEmail) || normalizeEmail(tenant.email) === nextEmail)
        );

        if (tenantIndex >= 0) {
          tenants = tenants.map((tenant, index) =>
            index === tenantIndex
              ? {
                  ...tenant,
                  firstName: parsed.firstName,
                  lastName: parsed.lastName,
                  email: nextEmail,
                  phone,
                  updatedAt
                }
              : tenant
          );
        } else {
          tenants = [
            ...tenants,
            {
              id: createId("tenant"),
              organizationId: target.organizationId,
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              email: nextEmail,
              phone,
              createdAt: updatedAt,
              updatedAt
            }
          ];
        }
      }

      const properties =
        role === "MANAGER"
          ? store.properties
          : store.properties.map((property) => (property.managerId === userId ? { ...property, managerId: undefined, updatedAt } : property));

      updatedAdminAccount = currentTargetIsAdmin;

      return {
        ...store,
        users,
        tenants,
        properties
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account update failed.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (!targetExists) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  const data = await getAdminDashboardData();

  return Response.json(
    {
      message: updatedAdminAccount ? "Admin account updated." : "Account updated.",
      data
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
