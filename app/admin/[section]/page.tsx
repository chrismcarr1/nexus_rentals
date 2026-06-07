import { notFound } from "next/navigation";

import { AdminSectionView, type AdminSectionKey } from "@/components/admin/admin-section-view";
import { getAdminAnalytics, parseAdminTimeRange } from "@/lib/admin-analytics";
import { requireSystemAdmin } from "@/lib/auth";
import { probeEmailWorker } from "@/lib/email";

const sections = new Set<AdminSectionKey>([
  "growth",
  "users",
  "managers",
  "tenants",
  "properties",
  "payments",
  "applications",
  "stripe",
  "email",
  "operations",
  "product-analytics",
  "reports",
  "system-health",
  "settings"
]);

export default async function AdminSectionPage({
  params,
  searchParams
}: {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSystemAdmin();
  const { section } = await params;
  if (!sections.has(section as AdminSectionKey)) notFound();

  const queryParams = (await searchParams) ?? {};
  const range = parseAdminTimeRange(typeof queryParams.range === "string" ? queryParams.range : null);
  const query = typeof queryParams.q === "string" ? queryParams.q.trim() : "";
  const [data, emailProbe] = await Promise.all([
    getAdminAnalytics(range),
    section === "email" || section === "system-health" ? probeEmailWorker() : Promise.resolve(null)
  ]);

  return (
    <AdminSectionView
      section={section as AdminSectionKey}
      data={data}
      query={query}
      params={queryParams}
      emailProbe={emailProbe}
    />
  );
}
