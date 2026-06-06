import { addMonthsToDateKey, appDateIsBefore, appDateKeyFromValue, getAppDateKey, monthKeyFromValue } from "@/lib/app-time";
import { db } from "@/lib/db";
import { ensureLeaseConnectionIntegrity } from "@/lib/lease-connections";

function leaseCountsAsCurrent(status: string) {
  return status === "ACTIVE" || status === "UPCOMING" || status === "active" || status === "invited";
}

function leaseCountsAsActive(status: string) {
  return status === "ACTIVE" || status === "active";
}

export async function getDashboardSnapshot(organizationId: string) {
  await ensureLeaseConnectionIntegrity(organizationId);
  const todayKey = getAppDateKey();
  const currentMonthKey = todayKey.slice(0, 7);

  const [properties, units, leases, payments, expenses, assessments, maintenance, notifications] = await Promise.all([
    db.property.findMany({ where: { organizationId }, include: { units: true } }),
    db.unit.findMany({
      where: { property: { organizationId } },
      include: { property: true }
    }),
    db.lease.findMany({
      where: { unit: { property: { organizationId } } },
      include: {
        unit: { include: { property: true } },
        tenants: { include: { tenant: true } }
      }
    }),
    db.payment.findMany({
      where: { unit: { property: { organizationId } } },
      include: { unit: { include: { property: true } } },
      orderBy: { dueDate: "desc" }
    }),
    db.expense.findMany({
      where: { property: { organizationId } },
      include: { property: true, unit: true },
      orderBy: { incurredAt: "desc" }
    }),
    db.damageAssessment.findMany({
      where: { inspection: { unit: { property: { organizationId } } } },
      include: {
        inspection: { include: { unit: { include: { property: true } } } }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.maintenanceRequest.findMany({
      where: { property: { organizationId } },
      include: { property: true, unit: true },
      orderBy: { requestedAt: "desc" }
    }),
    db.notification.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6
    })
  ]);

  const totalUnits = units.length;
  const occupiedUnits = units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
  const vacantUnits = units.filter((unit) => unit.occupancyStatus === "VACANT").length;
  const monthlyRecurringRent = units.reduce((sum, unit) => sum + unit.monthlyRent, 0);
  const rentCollectedThisMonth = payments
    .filter((payment) => payment.paidDate && monthKeyFromValue(payment.paidDate) === currentMonthKey)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = payments
    .filter((payment) => payment.status !== "PAID")
    .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const overdue = payments
    .filter((payment) => payment.status === "LATE" || (payment.status !== "PAID" && appDateIsBefore(payment.dueDate, todayKey)))
    .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const monthExpenses = expenses
    .filter((expense) => monthKeyFromValue(expense.incurredAt) === currentMonthKey)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const depositsHeld = leases
    .filter((lease) => leaseCountsAsCurrent(lease.status))
    .reduce((sum, lease) => sum + lease.securityDeposit, 0);
  const upcomingLeaseExpirations = leases
    .filter((lease) => leaseCountsAsActive(lease.status) && lease.endDate)
    .sort((a, b) => appDateKeyFromValue(a.endDate).localeCompare(appDateKeyFromValue(b.endDate)))
    .slice(0, 5);
  const netOperatingCashFlow = rentCollectedThisMonth - monthExpenses;

  const trendMap = new Map<string, { rent: number; expenses: number }>();
  for (let index = 5; index >= 0; index -= 1) {
    const cursorKey = addMonthsToDateKey(`${currentMonthKey}-01`, -index);
    trendMap.set(monthLabel(cursorKey), { rent: 0, expenses: 0 });
  }

  for (const payment of payments) {
    const key = monthLabel(payment.dueDate);
    if (trendMap.has(key)) {
      trendMap.get(key)!.rent += payment.status === "PAID" ? payment.amount : 0;
    }
  }

  for (const expense of expenses) {
    const key = monthLabel(expense.incurredAt);
    if (trendMap.has(key)) {
      trendMap.get(key)!.expenses += expense.amount;
    }
  }

  return {
    properties,
    units,
    leases,
    payments,
    expenses,
    assessments,
    maintenance,
    notifications,
    metrics: {
      totalProperties: properties.length,
      totalUnits,
      occupiedUnits,
      vacantUnits,
      monthlyRecurringRent,
      rentCollectedThisMonth,
      outstanding,
      overdue,
      monthExpenses,
      netOperatingCashFlow,
      depositsHeld
    },
    charts: {
      cashFlowTrend: Array.from(trendMap.entries()).map(([label, values]) => ({ label, ...values }))
    },
    recentPayments: payments.slice(0, 6),
    recentExpenses: expenses.slice(0, 6),
    recentAssessments: assessments.slice(0, 4),
    upcomingLeaseExpirations
  };
}

function monthLabel(value: string | Date) {
  const key = appDateKeyFromValue(value);
  if (!key) return "Unset";
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export async function getReportsSnapshot(organizationId: string) {
  const snapshot = await getDashboardSnapshot(organizationId);

  const byProperty = snapshot.properties.map((property) => {
    const units = snapshot.units.filter((unit) => unit.propertyId === property.id);
    const payments = snapshot.payments.filter((payment) => payment.unit.propertyId === property.id);
    const expenses = snapshot.expenses.filter((expense) => expense.propertyId === property.id);

    const recurringRent = units.reduce((sum, unit) => sum + unit.monthlyRent, 0);
    const collected = payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + payment.amount, 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
      propertyId: property.id,
      name: property.name,
      units: units.length,
      recurringRent,
      collected,
      totalExpenses,
      net: collected - totalExpenses,
      occupancyRate: units.length ? units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length / units.length : 0
    };
  });

  return {
    ...snapshot,
    byProperty
  };
}
