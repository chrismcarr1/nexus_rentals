import { isSystemAdminEmail } from "@/lib/admin";
import { getAdminDashboardData } from "@/lib/admin-dashboard";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!isSystemAdminEmail(user.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await getAdminDashboardData();

  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
