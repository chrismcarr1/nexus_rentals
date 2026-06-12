import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  computePaymentChargeBilling,
  getLeaseBilling,
  MANAGER_ABSORB_MIN_RENT_MESSAGE
} from "@/lib/payment-charge";
import { newMoveInSchema } from "@/lib/validations";

const ROOT = path.join(__dirname, "..");

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function validMoveIn(overrides: Record<string, unknown> = {}) {
  return {
    propertyId: "property-1",
    unitId: "unit-1",
    existingLeaseId: "",
    applicationSubmissionId: "",
    tenantFirstName: "Taylor",
    tenantLastName: "Reed",
    tenantEmail: "taylor@example.com",
    tenantPhone: "",
    employer: "",
    emergencyName: "",
    emergencyPhone: "",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    moveInDate: "2026-07-01",
    monthlyRent: 1800,
    securityDeposit: 1800,
    dueDay: 1,
    rentDueTime: "09:00",
    firstRentDueDate: "2026-07-01",
    securityDepositDueDate: "2026-07-01",
    managerAbsorbsPaymentCharge: false,
    createFirstRentCharge: true,
    createSecurityDepositCharge: true,
    additionalChargeDescription: "",
    additionalChargeAmount: 0,
    additionalChargeDueDate: "",
    recurringCharges: "",
    lateFeePolicy: "",
    notes: "",
    documentPath: "",
    documentName: "",
    tenantIdPath: "",
    tenantIdName: "",
    tenantIdOriginalName: "",
    sendInvite: false,
    ...overrides
  };
}

describe("manager-absorbed payment charge", () => {
  it("defaults to tenant responsibility without changing base rent", () => {
    expect(computePaymentChargeBilling(1800, false)).toMatchObject({
      paymentChargeResponsibility: "TENANT",
      managerAbsorbsPaymentCharge: false,
      managerAbsorbedPaymentChargeCents: 0,
      baseMonthlyRentCents: 180000,
      tenantFacingRentCents: 180000,
      baseMonthlyRent: 1800,
      tenantFacingRent: 1800
    });
  });

  it("reduces tenant-facing rent by exactly $1 while preserving base rent", () => {
    expect(computePaymentChargeBilling(1800, true)).toMatchObject({
      paymentChargeResponsibility: "MANAGER",
      managerAbsorbsPaymentCharge: true,
      managerAbsorbedPaymentChargeCents: 100,
      baseMonthlyRentCents: 180000,
      tenantFacingRentCents: 179900,
      baseMonthlyRent: 1800,
      tenantFacingRent: 1799
    });
  });

  it("rejects absorption when rent is $1 or less", () => {
    expect(() => computePaymentChargeBilling(1, true)).toThrow(MANAGER_ABSORB_MIN_RENT_MESSAGE);
    expect(newMoveInSchema.safeParse(validMoveIn({ monthlyRent: 1, managerAbsorbsPaymentCharge: true })).success).toBe(false);
  });

  it("defaults legacy leases safely to tenant responsibility", () => {
    expect(getLeaseBilling({ monthlyRent: 1425 })).toMatchObject({
      paymentChargeResponsibility: "TENANT",
      managerAbsorbsPaymentCharge: false,
      tenantFacingRent: 1425
    });
  });

  it("wires server-derived billing into lease and payment creation", async () => {
    const actions = await read("lib/actions.ts");
    const scheduler = await read("lib/lease-payment-scheduler.ts");
    const wizard = await read("components/new-move-in-wizard.tsx");

    expect(wizard).toContain("managerAbsorbsPaymentCharge ?? false");
    expect(actions).toContain("computePaymentChargeBilling(parsed.monthlyRent, parsed.managerAbsorbsPaymentCharge)");
    expect(actions).toContain("amount: billing.tenantFacingRent");
    expect(actions).toContain("baseRentAmount: billing.baseMonthlyRent");
    expect(actions).toContain("tenantFacingRentCents: billing.tenantFacingRentCents");
    expect(scheduler).toContain("const billing = getLeaseBilling(lease)");
    expect(scheduler).toContain("paymentChargeResponsibility: billing.paymentChargeResponsibility");
  });

  it("does not expose a tenant-facing amount input for the server to trust", async () => {
    const actions = await read("lib/actions.ts");
    const wizard = await read("components/new-move-in-wizard.tsx");

    expect(actions).not.toContain('getString(formData, "tenantFacingRent")');
    expect(wizard).not.toContain('name="tenantFacingRent"');
    expect(actions).toContain("requireRoles([UserRole.MANAGER])");
  });
});
