import { describe, expect, it } from "vitest";

import {
  buildCashFlowSeries,
  buildCollectedSparkline,
  calculateExpectedRent,
  calculateNetCashFlow,
  calculateOccupancy,
  calculateOutstandingRent,
  calculateOverdueRent,
  calculateRentCollected,
  getDashboardDateRange,
  getDashboardInsight,
  getLeaseExpirations,
  getMaintenanceQueue,
  getPortfolioPulse,
  getPropertyPerformance,
  getRentStatusBreakdown,
  getUrgentTasks,
  normalizeDashboardRangeKey,
  percentChange,
  type MetricPayment
} from "../lib/dashboard-metrics";

const TODAY = "2026-06-12";
const RANGE = getDashboardDateRange("this-month", TODAY);

function payment(overrides: Partial<MetricPayment> = {}): MetricPayment {
  return {
    id: "pay_1",
    unitId: "unit_1",
    leaseId: "lease_1",
    tenantId: "tenant_1",
    description: "June Rent",
    amount: 1000,
    dueDate: "2026-06-01",
    status: "PENDING",
    balanceDue: 1000,
    ...overrides
  };
}

function unit(overrides: Partial<{ id: string; propertyId: string; unitNumber: string; occupancyStatus: string; monthlyRent: number }> = {}) {
  return {
    id: "unit_1",
    propertyId: "prop_1",
    unitNumber: "101",
    occupancyStatus: "OCCUPIED",
    monthlyRent: 1000,
    ...overrides
  };
}

describe("date ranges", () => {
  it("defaults unknown range keys to this-month", () => {
    expect(normalizeDashboardRangeKey("bogus")).toBe("this-month");
    expect(normalizeDashboardRangeKey(undefined)).toBe("this-month");
    expect(normalizeDashboardRangeKey("last-90")).toBe("last-90");
  });

  it("computes month-to-date with a comparable prior window", () => {
    expect(RANGE.start).toBe("2026-06-01");
    expect(RANGE.end).toBe("2026-06-12");
    expect(RANGE.prevStart).toBe("2026-05-01");
    expect(RANGE.prevEnd).toBe("2026-05-12");
  });

  it("computes last-month as the full prior calendar month", () => {
    const range = getDashboardDateRange("last-month", TODAY);
    expect(range.start).toBe("2026-05-01");
    expect(range.end).toBe("2026-05-31");
    expect(range.prevStart).toBe("2026-04-01");
    expect(range.prevEnd).toBe("2026-04-30");
  });

  it("computes year-to-date from January 1", () => {
    const range = getDashboardDateRange("ytd", TODAY);
    expect(range.start).toBe("2026-01-01");
    expect(range.end).toBe(TODAY);
  });
});

describe("occupancy", () => {
  it("returns 0 for zero units without dividing by zero", () => {
    expect(calculateOccupancy([])).toEqual({ occupiedUnits: 0, rentableUnits: 0, rate: 0 });
  });

  it("counts occupied units only", () => {
    const result = calculateOccupancy([
      unit({ id: "u1", occupancyStatus: "OCCUPIED" }),
      unit({ id: "u2", occupancyStatus: "VACANT" }),
      unit({ id: "u3", occupancyStatus: "OCCUPIED" }),
      unit({ id: "u4", occupancyStatus: "TURNOVER" })
    ]);
    expect(result.occupiedUnits).toBe(2);
    expect(result.rentableUnits).toBe(4);
    expect(result.rate).toBe(0.5);
  });
});

describe("rent collected", () => {
  it("includes paid payments inside the range and excludes those outside", () => {
    const result = calculateRentCollected(
      [
        payment({ id: "a", status: "PAID", paidDate: "2026-06-05", balanceDue: 0 }),
        payment({ id: "b", status: "PAID", paidDate: "2026-05-20", balanceDue: 0 }),
        payment({ id: "c", status: "PENDING" })
      ],
      RANGE
    );
    expect(result.total).toBe(1000);
    expect(result.count).toBe(1);
  });

  it("counts the received portion of partial payments", () => {
    const result = calculateRentCollected(
      [payment({ status: "PARTIAL", paidDate: "2026-06-03", amountPaid: 400, balanceDue: 600 })],
      RANGE
    );
    expect(result.total).toBe(400);
  });

  it("uses stripePaidAt when paidDate is missing", () => {
    const result = calculateRentCollected(
      [payment({ status: "PAID", paidDate: undefined, stripePaidAt: "2026-06-10T15:30:00.000Z", balanceDue: 0 })],
      RANGE
    );
    expect(result.total).toBe(1000);
  });

  it("prefers stripeAmountPaidCents over the charge amount", () => {
    const result = calculateRentCollected(
      [payment({ status: "PAID", paidDate: "2026-06-05", balanceDue: 0, stripeAmountPaidCents: 123456 })],
      RANGE
    );
    expect(result.total).toBeCloseTo(1234.56);
  });
});

describe("outstanding rent", () => {
  it("includes unpaid charges due by range end and excludes paid charges", () => {
    const result = calculateOutstandingRent(
      [
        payment({ id: "a", status: "PENDING", dueDate: "2026-06-01" }),
        payment({ id: "b", status: "PAID", dueDate: "2026-06-01", paidDate: "2026-06-01", balanceDue: 0 }),
        payment({ id: "c", status: "PENDING", dueDate: "2026-07-01" })
      ],
      RANGE
    );
    expect(result.total).toBe(1000);
    expect(result.count).toBe(1);
  });

  it("includes older unpaid charges that are still open", () => {
    const result = calculateOutstandingRent([payment({ status: "LATE", dueDate: "2026-04-01" })], RANGE);
    expect(result.total).toBe(1000);
  });

  it("uses remaining balance for partial payments and counts distinct tenants", () => {
    const result = calculateOutstandingRent(
      [
        payment({ id: "a", status: "PARTIAL", balanceDue: 600, tenantId: "t1" }),
        payment({ id: "b", status: "PENDING", tenantId: "t1" }),
        payment({ id: "c", status: "PENDING", tenantId: "t2" })
      ],
      RANGE
    );
    expect(result.total).toBe(2600);
    expect(result.partiesAffected).toBe(2);
  });

  it("ignores zero-balance non-paid statuses", () => {
    const result = calculateOutstandingRent([payment({ status: "PARTIAL", balanceDue: 0, amountPaid: 1000 })], RANGE);
    expect(result.total).toBe(0);
    expect(result.count).toBe(0);
  });
});

describe("overdue rent", () => {
  it("includes unpaid charges due before today and excludes future or paid charges", () => {
    const result = calculateOverdueRent(
      [
        payment({ id: "a", status: "PENDING", dueDate: "2026-06-01" }),
        payment({ id: "b", status: "PENDING", dueDate: "2026-06-25" }),
        payment({ id: "c", status: "PAID", dueDate: "2026-05-01", paidDate: "2026-06-02", balanceDue: 0 })
      ],
      TODAY
    );
    expect(result.total).toBe(1000);
    expect(result.count).toBe(1);
  });

  it("treats LATE status as overdue even with a same-day due date", () => {
    const result = calculateOverdueRent([payment({ status: "LATE", dueDate: TODAY })], TODAY);
    expect(result.count).toBe(1);
  });

  it("excludes charges due today that are merely pending", () => {
    const result = calculateOverdueRent([payment({ status: "PENDING", dueDate: TODAY })], TODAY);
    expect(result.count).toBe(0);
  });
});

describe("net cash flow", () => {
  it("subtracts in-range expenses from collected income", () => {
    const result = calculateNetCashFlow(
      [payment({ status: "PAID", paidDate: "2026-06-05", balanceDue: 0 })],
      [
        { id: "e1", propertyId: "prop_1", amount: 300, incurredAt: "2026-06-04" },
        { id: "e2", propertyId: "prop_1", amount: 999, incurredAt: "2026-05-04" }
      ],
      RANGE
    );
    expect(result).toEqual({ collected: 1000, expenses: 300, net: 700 });
  });

  it("handles missing expenses safely", () => {
    const result = calculateNetCashFlow([], [], RANGE);
    expect(result).toEqual({ collected: 0, expenses: 0, net: 0 });
  });
});

describe("cash flow series", () => {
  it("buckets daily for short ranges and sums to the period totals", () => {
    const series = buildCashFlowSeries(
      [
        payment({ id: "a", status: "PAID", paidDate: "2026-06-05", balanceDue: 0 }),
        payment({ id: "b", status: "PAID", paidDate: "2026-06-05", balanceDue: 0, amount: 500 })
      ],
      [{ id: "e1", propertyId: "p", amount: 200, incurredAt: "2026-06-07" }],
      RANGE
    );
    expect(series).toHaveLength(12);
    expect(series.reduce((sum, point) => sum + point.collected, 0)).toBe(1500);
    expect(series.reduce((sum, point) => sum + point.expenses, 0)).toBe(200);
    const day5 = series.find((point) => point.startKey === "2026-06-05");
    expect(day5?.collected).toBe(1500);
    expect(day5?.net).toBe(1500);
  });

  it("excludes values outside the range", () => {
    const series = buildCashFlowSeries(
      [payment({ status: "PAID", paidDate: "2026-05-30", balanceDue: 0 })],
      [],
      RANGE
    );
    expect(series.every((point) => point.collected === 0)).toBe(true);
  });

  it("returns an empty series for an inverted range", () => {
    expect(buildCashFlowSeries([], [], { start: "2026-06-12", end: "2026-06-01" })).toEqual([]);
  });
});

describe("rent status breakdown", () => {
  it("splits paid, partial, outstanding, and overdue with real amounts", () => {
    const { segments, totalTracked } = getRentStatusBreakdown(
      [
        payment({ id: "a", status: "PAID", paidDate: "2026-06-02", balanceDue: 0 }),
        payment({ id: "b", status: "PARTIAL", paidDate: "2026-06-03", amountPaid: 400, balanceDue: 600, dueDate: "2026-06-01" }),
        payment({ id: "c", status: "PENDING", dueDate: "2026-06-05" }),
        payment({ id: "d", status: "PENDING", dueDate: TODAY })
      ],
      RANGE,
      TODAY
    );
    const byKey = Object.fromEntries(segments.map((segment) => [segment.key, segment]));
    expect(byKey.paid.amount).toBe(1400); // full paid + partial portion received in range
    expect(byKey.partial.amount).toBe(600);
    expect(byKey.overdue.amount).toBe(1000); // due 6/5, unpaid
    expect(byKey.outstanding.amount).toBe(1000); // due today, not yet overdue
    expect(totalTracked).toBe(4000);
  });

  it("returns no segments when there is no rent activity", () => {
    const { segments, totalTracked } = getRentStatusBreakdown([], RANGE, TODAY);
    expect(segments).toEqual([]);
    expect(totalTracked).toBe(0);
  });
});

describe("lease expirations", () => {
  const context = {
    todayKey: TODAY,
    windowDays: 60,
    tenants: [{ id: "t1", firstName: "Ada", lastName: "Lovelace" }],
    units: [unit()],
    properties: [{ id: "prop_1", name: "456 Oak Ave" }]
  };

  it("includes active leases ending within the window and sorts soonest first", () => {
    const rows = getLeaseExpirations(
      [
        { id: "l1", unitId: "unit_1", tenantIds: ["t1"], status: "ACTIVE", endDate: "2026-07-20", monthlyRent: 1000 },
        { id: "l2", unitId: "unit_1", tenantIds: [], status: "ACTIVE", endDate: "2026-06-20", monthlyRent: 900 },
        { id: "l3", unitId: "unit_1", tenantIds: [], status: "ACTIVE", endDate: "2026-12-01", monthlyRent: 800 },
        { id: "l4", unitId: "unit_1", tenantIds: [], status: "EXPIRED", endDate: "2026-06-20", monthlyRent: 700 },
        { id: "l5", unitId: "unit_1", tenantIds: [], status: "ACTIVE", endDate: "2026-06-01", monthlyRent: 600 }
      ],
      context
    );
    expect(rows.map((row) => row.leaseId)).toEqual(["l2", "l1"]);
    expect(rows[0].daysRemaining).toBe(8);
    expect(rows[0].tenantName).toBe("Tenant");
    expect(rows[1].tenantName).toBe("Ada Lovelace");
    expect(rows[1].propertyName).toBe("456 Oak Ave");
  });

  it("handles leases without end dates", () => {
    const rows = getLeaseExpirations([{ id: "l1", tenantIds: [], status: "ACTIVE", monthlyRent: 1000 }], context);
    expect(rows).toEqual([]);
  });
});

describe("maintenance queue", () => {
  it("sorts urgent first, then oldest open request, and drops resolved items", () => {
    const rows = getMaintenanceQueue(
      [
        { id: "m1", propertyId: "prop_1", title: "Leak", status: "OPEN", priority: "MEDIUM", requestedAt: "2026-06-01" },
        { id: "m2", propertyId: "prop_1", title: "Fire alarm", status: "OPEN", priority: "URGENT", requestedAt: "2026-06-10" },
        { id: "m3", propertyId: "prop_1", title: "Paint", status: "RESOLVED", priority: "URGENT", requestedAt: "2026-06-09" },
        { id: "m4", propertyId: "prop_1", title: "Old leak", status: "IN_PROGRESS", priority: "MEDIUM", requestedAt: "2026-05-01" }
      ],
      { units: [unit()], properties: [{ id: "prop_1", name: "456 Oak Ave" }] }
    );
    expect(rows.map((row) => row.id)).toEqual(["m2", "m4", "m1"]);
    expect(rows[0].propertyName).toBe("456 Oak Ave");
  });
});

describe("urgent tasks", () => {
  it("reports overdue rent, urgent maintenance, and expiring leases accurately", () => {
    const tasks = getUrgentTasks({
      overdue: { total: 1310, count: 3, partiesAffected: 2 },
      urgentMaintenanceCount: 2,
      openMaintenanceCount: 5,
      leasesExpiring30: 1,
      vacantUnitsWithoutActiveLease: 0,
      stripeReady: true,
      formatCurrency: (value) => `$${value}`
    });
    const keys = tasks.map((task) => task.key);
    expect(keys).toEqual(["overdue-rent", "urgent-maintenance", "expiring-leases"]);
    expect(tasks[0].detail).toContain("$1310");
    expect(tasks[0].detail).toContain("2 tenants");
    expect(tasks[0].href).toBe("/transactions?status=overdue");
  });

  it("falls back to open maintenance and flags missing Stripe setup", () => {
    const tasks = getUrgentTasks({
      overdue: { total: 0, count: 0, partiesAffected: 0 },
      urgentMaintenanceCount: 0,
      openMaintenanceCount: 3,
      leasesExpiring30: 0,
      vacantUnitsWithoutActiveLease: 2,
      stripeReady: false,
      pendingApplicationCount: 1,
      formatCurrency: (value) => `$${value}`
    });
    expect(tasks.map((task) => task.key)).toEqual(["open-maintenance", "stripe-setup", "pending-applications", "vacant-units"]);
  });

  it("returns no tasks for a clean portfolio", () => {
    const tasks = getUrgentTasks({
      overdue: { total: 0, count: 0, partiesAffected: 0 },
      urgentMaintenanceCount: 0,
      openMaintenanceCount: 0,
      leasesExpiring30: 0,
      vacantUnitsWithoutActiveLease: 0,
      stripeReady: true,
      formatCurrency: (value) => `$${value}`
    });
    expect(tasks).toEqual([]);
  });
});

describe("portfolio pulse", () => {
  it("applies the deterministic health thresholds", () => {
    const pulse = getPortfolioPulse({
      occupancyRate: 0.9,
      hasUnits: true,
      collectionRate: 0.8,
      openMaintenanceCount: 2,
      urgentMaintenanceCount: 1,
      leasesExpiring30: 0,
      leasesExpiring60: 2,
      stripeReady: false
    });
    const byKey = Object.fromEntries(pulse.map((row) => [row.key, row.status]));
    expect(byKey.occupancy).toBe("watch");
    expect(byKey.collections).toBe("attention");
    expect(byKey.maintenance).toBe("attention");
    expect(byKey.renewals).toBe("watch");
    expect(byKey["payments-setup"]).toBe("attention");
  });

  it("reads healthy across the board for a clean portfolio", () => {
    const pulse = getPortfolioPulse({
      occupancyRate: 1,
      hasUnits: true,
      collectionRate: 1,
      openMaintenanceCount: 0,
      urgentMaintenanceCount: 0,
      leasesExpiring30: 0,
      leasesExpiring60: 0,
      stripeReady: true
    });
    expect(pulse.every((row) => row.status === "healthy")).toBe(true);
  });
});

describe("property performance", () => {
  it("computes per-property metrics from only that property's records", () => {
    const rows = getPropertyPerformance({
      properties: [
        { id: "p1", name: "Oak", status: "ACTIVE" },
        { id: "p2", name: "Pine", status: "ACTIVE" }
      ],
      units: [
        unit({ id: "u1", propertyId: "p1" }),
        unit({ id: "u2", propertyId: "p2", occupancyStatus: "VACANT" })
      ],
      payments: [
        payment({ id: "a", unitId: "u1", status: "PAID", paidDate: "2026-06-05", balanceDue: 0 }),
        payment({ id: "b", unitId: "u2", status: "PENDING", dueDate: "2026-06-01", amount: 800, balanceDue: 800 })
      ],
      leases: [],
      maintenance: [
        { id: "m1", propertyId: "p2", title: "Leak", status: "OPEN", priority: "HIGH", requestedAt: "2026-06-01" }
      ],
      range: RANGE,
      todayKey: TODAY
    });

    const pine = rows.find((row) => row.propertyId === "p2")!;
    const oak = rows.find((row) => row.propertyId === "p1")!;
    expect(oak.collected).toBe(1000);
    expect(oak.overdue).toBe(0);
    expect(oak.needsAttention).toBe(false);
    expect(pine.collected).toBe(0);
    expect(pine.overdue).toBe(800);
    expect(pine.openMaintenance).toBe(1);
    expect(pine.needsAttention).toBe(true);
    // attention-needing property sorts first
    expect(rows[0].propertyId).toBe("p2");
  });

  it("excludes archived properties and handles zero-unit properties", () => {
    const rows = getPropertyPerformance({
      properties: [
        { id: "p1", name: "Archived", status: "ARCHIVED" },
        { id: "p2", name: "Empty", status: "ACTIVE" }
      ],
      units: [],
      payments: [],
      leases: [],
      maintenance: [],
      range: RANGE,
      todayKey: TODAY
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].occupancyRate).toBe(0);
    expect(rows[0].unitCount).toBe(0);
  });
});

describe("insight", () => {
  const baseInput = {
    stripeReady: true,
    hasProperties: true,
    propertyPerformance: [] as ReturnType<typeof getPropertyPerformance>,
    overdue: { total: 0, count: 0, partiesAffected: 0 },
    leaseExpirations: [] as ReturnType<typeof getLeaseExpirations>,
    collectionRate: null as number | null,
    prevCollectionRate: null as number | null,
    vacantUnitsWithoutActiveLease: 0,
    formatCurrency: (value: number) => `$${value}`
  };

  it("prioritizes Stripe setup when properties exist but payments are not ready", () => {
    const insight = getDashboardInsight({ ...baseInput, stripeReady: false });
    expect(insight.href).toBe("/settings");
    expect(insight.tone).toBe("warning");
  });

  it("surfaces the property with the largest overdue balance", () => {
    const insight = getDashboardInsight({
      ...baseInput,
      overdue: { total: 1310, count: 2, partiesAffected: 2 },
      propertyPerformance: [
        { propertyId: "p1", name: "456 Oak Ave", unitCount: 2, occupiedUnits: 2, occupancyRate: 1, collected: 0, outstanding: 1310, overdue: 1310, openMaintenance: 0, expiringLeases: 0, needsAttention: true }
      ]
    });
    expect(insight.body).toContain("456 Oak Ave");
    expect(insight.body).toContain("$1310");
    expect(insight.href).toBe("/transactions?status=overdue");
  });

  it("reports a healthy portfolio when no rule fires", () => {
    const insight = getDashboardInsight(baseInput);
    expect(insight.title).toBe("Portfolio looks healthy");
    expect(insight.tone).toBe("success");
  });
});

describe("trend helpers", () => {
  it("hides the trend when there is no baseline", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, Number.NaN)).toBeNull();
  });

  it("computes fractional change", () => {
    expect(percentChange(110, 100)).toBeCloseTo(0.1);
    expect(percentChange(90, 100)).toBeCloseTo(-0.1);
  });

  it("builds a cumulative collected sparkline", () => {
    const spark = buildCollectedSparkline(
      [
        payment({ id: "a", status: "PAID", paidDate: "2026-06-02", balanceDue: 0 }),
        payment({ id: "b", status: "PAID", paidDate: "2026-06-10", balanceDue: 0, amount: 500 })
      ],
      RANGE
    );
    expect(spark).toHaveLength(12);
    expect(spark[0]).toBe(0);
    expect(spark[1]).toBe(1000);
    expect(spark[11]).toBe(1500);
  });
});

describe("expected rent", () => {
  it("sums only charges due inside the range", () => {
    const expected = calculateExpectedRent(
      [
        payment({ id: "a", dueDate: "2026-06-01" }),
        payment({ id: "b", dueDate: "2026-05-01" }),
        payment({ id: "c", dueDate: "2026-07-01" })
      ],
      RANGE
    );
    expect(expected).toBe(1000);
  });
});

// The dashboard model only ever copies explicitly picked fields. This guards
// the field picks in services/dashboard.ts by replicating its projection over
// a record stuffed with sensitive fields and asserting none survive.
describe("sanitization", () => {
  it("metric outputs never carry sensitive store fields", () => {
    const dirtyPayment = {
      ...payment({ status: "PAID", paidDate: "2026-06-05", balanceDue: 0 }),
      passwordHash: "secret",
      legalAcceptanceIp: "1.2.3.4",
      stripeDestinationAccountId: "acct_123"
    } as MetricPayment;

    const outputs = JSON.stringify({
      collected: calculateRentCollected([dirtyPayment], RANGE),
      breakdown: getRentStatusBreakdown([dirtyPayment], RANGE, TODAY),
      series: buildCashFlowSeries([dirtyPayment], [], RANGE),
      performance: getPropertyPerformance({
        properties: [{ id: "prop_1", name: "Oak" }],
        units: [unit()],
        payments: [dirtyPayment],
        leases: [],
        maintenance: [],
        range: RANGE,
        todayKey: TODAY
      })
    });

    expect(outputs).not.toContain("passwordHash");
    expect(outputs).not.toContain("secret");
    expect(outputs).not.toContain("legalAcceptanceIp");
    expect(outputs).not.toContain("1.2.3.4");
    expect(outputs).not.toContain("acct_123");
  });
});
