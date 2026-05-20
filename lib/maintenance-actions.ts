"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRoles } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function resolveMaintenanceAction(formData: FormData) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const maintenanceId = getString(formData, "maintenanceId");
  const portal = await getPortalContext(user);
  const item = portal.scope.maintenance.find((request) => request.id === maintenanceId);

  if (!item || item.status === "RESOLVED" || item.status === "CLOSED") {
    redirect("/maintenance");
  }

  const resolvedAt = new Date();
  const resolutionLine = `Resolved ${resolvedAt.toISOString().slice(0, 10)}.`;
  const timeline = [item.timeline, resolutionLine].filter(Boolean).join("\n");

  await db.maintenanceRequest.update({
    where: { id: maintenanceId },
    data: {
      status: "RESOLVED",
      resolvedAt,
      actualCost: item.actualCost ?? item.estimatedCost ?? null,
      timeline
    }
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  redirect("/maintenance");
}
