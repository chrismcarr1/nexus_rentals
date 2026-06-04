import { getManagerLeaseRows } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { UserRole } from "@/lib/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in before viewing leases." }, { status: 401 });
  if (user.role !== UserRole.MANAGER) return Response.json({ error: "Only managers can view manager leases." }, { status: 403 });

  const leases = await getManagerLeaseRows(user);

  return Response.json({ leases }, { headers: { "Cache-Control": "no-store" } });
}
