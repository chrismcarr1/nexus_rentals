import { z } from "zod";

import { createConnectedLease, toSafeLeaseRow } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { readStore, UserRole } from "@/lib/store";

const createLeaseSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional().or(z.literal("")),
  tenantEmail: z.string().email(),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  monthlyRent: z.coerce.number().min(0).optional(),
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
      securityDeposit: result.data.securityDeposit
    });
    const store = await readStore();

    return Response.json({ lease: toSafeLeaseRow(store, lease) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create lease." }, { status: 400 });
  }
}
