import { z } from "zod";

import { DEFAULT_RENT_DUE_TIME } from "@/lib/app-time";
import { createConnectedLease, toSafeLeaseRow } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { ensureScheduledLeasePayments } from "@/lib/lease-payment-scheduler";
import { readStore, UserRole } from "@/lib/store";

const createLeaseSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional().or(z.literal("")),
  tenantEmail: z.string().email(),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  monthlyRent: z.coerce.number().min(0).optional(),
  dueDay: z.coerce.number().min(1).max(28).optional(),
  rentDueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().default(DEFAULT_RENT_DUE_TIME),
  securityDeposit: z.coerce.number().min(0).optional()
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in before creating a lease." }, { status: 401 });
  if (user.role !== UserRole.MANAGER) return Response.json({ error: "Only managers can create leases." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const result = createLeaseSchema.safeParse(payload);

  if (!result.success) {
    return Response.json({ error: "Review the lease details and tenant email." }, { status: 400 });
  }

  try {
    const lease = await createConnectedLease({
      manager: user,
      propertyId: result.data.propertyId,
      unitId: result.data.unitId || undefined,
      tenantEmail: result.data.tenantEmail,
      startDate: result.data.startDate || undefined,
      endDate: result.data.endDate || undefined,
      monthlyRent: result.data.monthlyRent,
      dueDay: result.data.dueDay,
      rentDueTime: result.data.rentDueTime,
      securityDeposit: result.data.securityDeposit
    });
    await ensureScheduledLeasePayments(user.organizationId);
    const store = await readStore();

    return Response.json({ lease: toSafeLeaseRow(store, lease) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create lease." }, { status: 400 });
  }
}
