import { getTenantLeaseRows } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in before viewing leases." }, { status: 401 });
  if (user.role !== UserRole.TENANT) return Response.json({ error: "Only tenants can view tenant leases." }, { status: 403 });

  const leases = await getTenantLeaseRows(user);

  return Response.json({ leases }, { headers: { "Cache-Control": "no-store" } });
}
