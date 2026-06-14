import { describe, expect, it } from "vitest";

import {
  buildOperationsTimeline,
  classifyOperationsGroup,
  filterOperationsEvents,
  normalizeOperationsFilter
} from "@/lib/operations-timeline";

const todayKey = "2026-06-12";

function input() {
  return {
    organizationId: "org-1",
    todayKey,
    properties: [
      { id: "property-1", organizationId: "org-1", name: "Juniper House" },
      { id: "property-2", organizationId: "org-2", name: "Other Portfolio" }
    ],
    units: [
      { id: "unit-1", propertyId: "property-1", unitNumber: "2A" },
      { id: "unit-2", propertyId: "property-2", unitNumber: "9Z" }
    ],
    tenants: [
      { id: "tenant-1", firstName: "Sarah", lastName: "Martinez" },
      { id: "tenant-2", firstName: "Other", lastName: "Tenant" }
    ],
    leases: [
      {
        id: "lease-1",
        status: "ACTIVE",
        propertyId: "property-1",
        unitId: "unit-1",
        tenantIds: ["tenant-1"],
        startDate: "2026-01-01",
        endDate: "2026-06-16",
        moveInDate: "2026-01-01",
        monthlyRent: 1800,
        managerAbsorbsPaymentCharge: true
      }
    ],
    payments: [
      {
        id: "payment-overdue",
        unitId: "unit-1",
        leaseId: "lease-1",
        tenantId: "tenant-1",
        description: "June rent",
        amount: 1799,
        balanceDue: 1799,
        dueDate: "2026-06-10",
        status: "PENDING",
        categoryTag: "Rent"
      },
      {
        id: "payment-today",
        unitId: "unit-1",
        leaseId: "lease-1",
        tenantId: "tenant-1",
        description: "Charge due today",
        amount: 75,
        balanceDue: 75,
        dueDate: todayKey,
        status: "PENDING",
        categoryTag: "Rent"
      },
      {
        id: "cross-org-payment",
        unitId: "unit-2",
        tenantId: "tenant-2",
        description: "Must stay hidden",
        amount: 5000,
        balanceDue: 5000,
        dueDate: "2026-06-10",
        status: "LATE",
        categoryTag: "Rent"
      }
    ],
    maintenance: [
      {
        id: "maintenance-1",
        propertyId: "property-1",
        unitId: "unit-1",
        title: "AC not cooling",
        status: "OPEN",
        priority: "URGENT",
        requestedAt: "2026-06-01"
      }
    ],
    paymentSetup: null
  };
}

describe("operations timeline", () => {
  it("generates overdue rent, due-today, lease expiration, and maintenance events", () => {
    const events = buildOperationsTimeline(input());

    expect(events.find((event) => event.id === "payment-payment-overdue")).toMatchObject({
      type: "RENT_OVERDUE",
      group: "overdue",
      amountCents: 179900,
      href: "/transactions?status=overdue&tenantId=tenant-1"
    });
    expect(events.find((event) => event.id === "payment-payment-today")).toMatchObject({
      type: "RENT_DUE",
      group: "today"
    });
    expect(events.find((event) => event.id === "lease-end-lease-1")).toMatchObject({
      type: "LEASE_EXPIRATION",
      group: "week",
      href: "/leases/lease-1"
    });
    expect(events.find((event) => event.id === "maintenance-maintenance-1")).toMatchObject({
      type: "MAINTENANCE_DUE",
      group: "today",
      priority: "high",
      href: "/maintenance?status=active"
    });
  });

  it("drops records that cannot be traced to the current organization", () => {
    const events = buildOperationsTimeline(input());
    expect(events.some((event) => event.id.includes("cross-org"))).toBe(false);
    expect(events.every((event) => event.organizationId === "org-1")).toBe(true);
  });

  it("classifies urgency windows at exact boundaries", () => {
    expect(classifyOperationsGroup("2026-06-11", todayKey)).toBe("overdue");
    expect(classifyOperationsGroup(todayKey, todayKey)).toBe("today");
    expect(classifyOperationsGroup("2026-06-19", todayKey)).toBe("week");
    expect(classifyOperationsGroup("2026-07-12", todayKey)).toBe("month");
    expect(classifyOperationsGroup("2026-07-13", todayKey)).toBe("later");
  });

  it("filters by event type and search text", () => {
    const events = buildOperationsTimeline(input());
    expect(filterOperationsEvents(events, "rent").every((event) => event.type.startsWith("RENT_"))).toBe(true);
    expect(filterOperationsEvents(events, "leases").map((event) => event.type)).toContain("LEASE_EXPIRATION");
    expect(filterOperationsEvents(events, "all", "Juniper")).toHaveLength(events.length);
    expect(filterOperationsEvents(events, "all", "Sarah").length).toBeGreaterThan(0);
    expect(normalizeOperationsFilter("not-real")).toBe("all");
  });

  it("uses only safe internal routes and supports an empty state", () => {
    const events = buildOperationsTimeline(input());
    expect(events.every((event) => event.href.startsWith("/") && !event.href.startsWith("//"))).toBe(true);

    const empty = buildOperationsTimeline({
      ...input(),
      properties: [],
      units: [],
      tenants: [],
      leases: [],
      payments: [],
      maintenance: []
    });
    expect(empty).toEqual([]);
  });
});
