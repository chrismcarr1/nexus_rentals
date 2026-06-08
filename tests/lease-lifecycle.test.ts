import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getUnitAvailableStartDate,
  leaseBlocksNewMoveIn,
  leaseCanResumeMoveIn,
  leaseDrivenUnitState,
  leaseStartIsAvailable,
  normalizeLeaseLifecycleStatus
} from "../lib/lease-connections";
import type { Lease } from "../lib/store";

function lease(overrides: Partial<Lease>): Lease {
  return {
    id: "lease_1",
    propertyId: "property_1",
    unitId: "unit_1",
    tenantIds: [],
    monthlyRent: 1500,
    dueDay: 1,
    securityDeposit: 1500,
    recurringCharges: "",
    status: "ACTIVE",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides
  };
}

describe("lease lifecycle availability", () => {
  it("expires a lease after its end date", () => {
    expect(
      normalizeLeaseLifecycleStatus(
        lease({ endDate: "2026-06-05T12:00:00.000Z" }),
        "2026-06-06"
      )
    ).toBe("EXPIRED");
  });

  it("keeps a future lease upcoming and the unit vacant but reserved", () => {
    const status = normalizeLeaseLifecycleStatus(
      lease({ startDate: "2026-07-01T12:00:00.000Z", endDate: "2027-06-30T12:00:00.000Z" }),
      "2026-06-06"
    );

    expect(status).toBe("UPCOMING");
    expect(leaseDrivenUnitState([{ status }])).toEqual({
      leaseStatus: "UPCOMING",
      occupancyStatus: "VACANT"
    });
  });

  it("makes a unit vacant when all leases are expired or terminated", () => {
    expect(
      leaseDrivenUnitState([{ status: "EXPIRED" }, { status: "TERMINATED" }])
    ).toEqual({
      leaseStatus: "TERMINATED",
      occupancyStatus: "VACANT"
    });
  });

  it("keeps a unit occupied while any active lease remains", () => {
    expect(
      leaseDrivenUnitState([{ status: "EXPIRED" }, { status: "ACTIVE" }])
    ).toEqual({
      leaseStatus: "ACTIVE",
      occupancyStatus: "OCCUPIED"
    });
  });

  it("allows vacant units with draft or invited leases to resume move-in setup", () => {
    expect(leaseCanResumeMoveIn("draft")).toBe(true);
    expect(leaseCanResumeMoveIn("invited")).toBe(true);
    expect(leaseBlocksNewMoveIn("draft")).toBe(false);
    expect(leaseBlocksNewMoveIn("invited")).toBe(false);
  });

  it("treats active and upcoming leases as date constraints", () => {
    expect(leaseBlocksNewMoveIn("ACTIVE")).toBe(true);
    expect(leaseBlocksNewMoveIn("UPCOMING")).toBe(true);
    expect(leaseCanResumeMoveIn("ACTIVE")).toBe(false);
  });

  it("makes a unit available the day after its latest scheduled lease ends", () => {
    const leases = [
      { id: "current", status: "ACTIVE" as const, endDate: "2026-06-30T12:00:00.000Z" },
      { id: "future", status: "UPCOMING" as const, endDate: "2027-06-30T12:00:00.000Z" }
    ];

    expect(getUnitAvailableStartDate(leases)).toBe("2027-07-01");
    expect(leaseStartIsAvailable(leases, "2027-06-30")).toBe(false);
    expect(leaseStartIsAvailable(leases, "2027-07-01")).toBe(true);
  });

  it("does not schedule another move-in behind an open-ended active lease", () => {
    const leases = [{ id: "current", status: "ACTIVE" as const }];

    expect(getUnitAvailableStartDate(leases)).toBeNull();
    expect(leaseStartIsAvailable(leases, "2027-07-01")).toBe(false);
  });

  it("ignores the resumable draft while checking the current lease handoff date", () => {
    const leases = [
      { id: "current", status: "ACTIVE" as const, endDate: "2026-09-17T12:00:00.000Z" },
      { id: "draft", status: "draft" as const, endDate: "2027-09-17T12:00:00.000Z" }
    ];

    expect(getUnitAvailableStartDate(leases, "draft")).toBe("2026-09-18");
  });
});
