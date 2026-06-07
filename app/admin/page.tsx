import { AdminOverview } from "@/components/admin/admin-overview";
import { getAdminAnalytics, parseAdminTimeRange } from "@/lib/admin-analytics";
import { requireSystemAdmin } from "@/lib/auth";

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSystemAdmin();
  const params = (await searchParams) ?? {};
  const range = parseAdminTimeRange(typeof params.range === "string" ? params.range : null);
  const data = await getAdminAnalytics(range);

  return <AdminOverview data={data} />;
}
