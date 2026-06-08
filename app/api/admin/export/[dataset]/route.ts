import { isSystemAdminEmail } from "@/lib/admin";
import { getAdminAnalytics } from "@/lib/admin-analytics";
import { getCurrentUser } from "@/lib/auth";
import { buildCsv, type CsvCell } from "@/lib/csv";
import { readStore } from "@/lib/store";

const datasets = new Set([
  "users",
  "managers",
  "properties",
  "units",
  "leases",
  "payments",
  "applications",
  "summary"
]);

function csvResponse(dataset: string, rows: CsvCell[][]) {
  return new Response(buildCsv(rows), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="nexus-${dataset}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSystemAdminEmail(admin.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { dataset } = await params;
  if (!datasets.has(dataset)) {
    return Response.json({ error: "Unknown admin export." }, { status: 404 });
  }

  const [data, store] = await Promise.all([getAdminAnalytics("all"), readStore()]);

  if (dataset === "users") {
    return csvResponse(dataset, [
      ["id", "name", "email", "role", "status", "organization", "createdAt", "lastLoginAt", "properties", "units", "leases", "payments", "stripeStatus", "inviteStatus"],
      ...data.users.map((item) => [
        item.id,
        item.name,
        item.email,
        item.role,
        item.status,
        item.organization,
        item.createdAt,
        item.lastLoginAt,
        item.propertyCount,
        item.unitCount,
        item.leaseCount,
        item.paymentCount,
        item.stripeStatus,
        item.inviteStatus
      ])
    ]);
  }

  if (dataset === "managers") {
    return csvResponse(dataset, [
      ["id", "name", "email", "organization", "active", "properties", "units", "tenants", "leases", "payments", "rentVolume", "paymentVolume", "openBalance", "stripeStatus", "setupProgress", "lastLoginAt"],
      ...data.managers.map((item) => [
        item.id,
        item.name,
        item.email,
        item.organization,
        item.isActive ? "active" : "suspended",
        item.propertyCount,
        item.unitCount,
        item.tenantCount,
        item.leaseCount,
        item.paymentCount,
        item.rentVolume,
        item.paymentVolume,
        item.openBalance,
        item.stripeStatus,
        item.setupProgress,
        item.lastLoginAt
      ])
    ]);
  }

  if (dataset === "properties") {
    return csvResponse(dataset, [
      ["id", "name", "address", "organization", "manager", "status", "units", "occupiedUnits", "activeLeases", "rentRoll", "openBalance", "overdueBalance", "createdAt"],
      ...data.properties.map((item) => [
        item.id,
        item.name,
        item.address,
        item.organization,
        item.manager,
        item.status,
        item.units,
        item.occupiedUnits,
        item.activeLeases,
        item.rentRoll,
        item.openBalance,
        item.overdueBalance,
        item.createdAt
      ])
    ]);
  }

  if (dataset === "units") {
    return csvResponse(dataset, [
      ["id", "propertyId", "unitNumber", "unitType", "bedrooms", "bathrooms", "monthlyRent", "depositAmount", "leaseStatus", "occupancyStatus", "createdAt", "updatedAt"],
      ...store.units.map((item) => [
        item.id,
        item.propertyId,
        item.unitNumber,
        item.unitType,
        item.bedrooms,
        item.bathrooms,
        item.monthlyRent,
        item.depositAmount,
        item.leaseStatus,
        item.occupancyStatus,
        item.createdAt,
        item.updatedAt
      ])
    ]);
  }

  if (dataset === "leases") {
    return csvResponse(dataset, [
      ["id", "nexusLeaseId", "managerId", "property", "unit", "tenants", "status", "monthlyRent", "startDate", "endDate", "moveInDate", "createdAt"],
      ...data.leases.map((item) => [
        item.id,
        item.nexusLeaseId,
        item.managerId,
        item.property,
        item.unit,
        item.tenants,
        item.status,
        item.monthlyRent,
        item.startDate,
        item.endDate,
        item.moveInDate,
        item.createdAt
      ])
    ]);
  }

  if (dataset === "payments") {
    return csvResponse(dataset, [
      ["id", "managerId", "description", "property", "unit", "tenant", "lease", "status", "amount", "amountPaid", "balanceDue", "dueDate", "paidDate", "source", "stripeSessionId", "stripePaymentIntentId", "platformFee", "warnings"],
      ...data.payments.rows.map((item) => [
        item.id,
        item.managerId,
        item.description,
        item.property,
        item.unit,
        item.tenant,
        item.lease,
        item.status,
        item.amount,
        item.amountPaid,
        item.balanceDue,
        item.dueDate,
        item.paidDate,
        item.source,
        item.stripeSessionId,
        item.stripePaymentIntentId,
        item.platformFee,
        item.warnings.join("; ")
      ])
    ]);
  }

  if (dataset === "applications") {
    return csvResponse(dataset, [
      ["id", "applicant", "email", "application", "property", "unit", "manager", "managerId", "status", "feeStatus", "submittedAt"],
      ...data.applications.rows.map((item) => [
        item.id,
        item.applicant,
        item.email,
        item.application,
        item.property,
        item.unit,
        item.manager,
        item.managerId,
        item.status,
        item.feeStatus,
        item.submittedAt
      ])
    ]);
  }

  return csvResponse(dataset, [
    ["metric", "value"],
    ["generatedAt", data.generatedAt],
    ["managers", data.overview.managers],
    ["tenants", data.overview.tenants],
    ["properties", data.overview.properties],
    ["units", data.overview.units],
    ["leases", data.overview.leases],
    ["applications", data.overview.applications],
    ["paymentsCreated", data.overview.paymentsCreated],
    ["paymentsCollected", data.overview.paymentsCollected],
    ["rentVolumeTracked", data.overview.rentVolumeTracked],
    ["stripePaymentVolume", data.overview.stripePaymentVolume],
    ["platformRevenue", data.overview.platformRevenue],
    ["openBalance", data.overview.openBalance],
    ["overdueBalance", data.overview.overdueBalance],
    ["criticalIntegrityIssues", data.operations.critical],
    ["warningIntegrityIssues", data.operations.warnings]
  ]);
}
