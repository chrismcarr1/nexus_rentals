"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSystemAdmin } from "@/lib/auth";
import { sendAdminTestEmail } from "@/lib/email";
import { syncStripeConnectedAccount } from "@/lib/stripe-connect";
import { getUserById } from "@/lib/store";

export async function sendAdminTestEmailAction() {
  const admin = await requireSystemAdmin();
  let failureMessage: string | null = null;

  try {
    const result = await sendAdminTestEmail(admin.email, admin.organizationId, admin.id);
    if (!result.sent) {
      failureMessage = result.error ?? "Email was not accepted.";
    }
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : "Email delivery failed.";
  }

  if (failureMessage) {
    redirect(`/admin/email?test=failed&message=${encodeURIComponent(failureMessage)}`);
  }

  revalidatePath("/admin/email");
  redirect("/admin/email?test=sent");
}

export async function refreshManagerStripeAction(formData: FormData) {
  await requireSystemAdmin();
  const managerId = String(formData.get("managerId") ?? "");
  const manager = managerId ? await getUserById(managerId) : null;

  if (!manager) {
    redirect("/admin/stripe?refresh=missing");
  }

  try {
    await syncStripeConnectedAccount(manager);
  } catch (error) {
    redirect(
      `/admin/stripe?refresh=failed&message=${encodeURIComponent(
        error instanceof Error ? error.message : "Stripe refresh failed."
      )}`
    );
  }

  revalidatePath("/admin/stripe");
  revalidatePath(`/admin/managers/${manager.id}`);
  redirect(`/admin/stripe?refresh=success&manager=${encodeURIComponent(manager.id)}`);
}
