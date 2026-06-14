// Lease-level $1 payment-charge billing.
//
// Managers can absorb the fixed $1 payment charge on a lease. When they do,
// the tenant-facing rent is exactly $1 lower than the base monthly rent while
// the base rent stored on the lease never changes. All math runs in integer
// cents so dollar-denominated store values never pick up float drift. This
// module is pure and safe to import from client components for previews; the
// server always recomputes billing itself and never trusts client amounts.

export const PAYMENT_CHARGE_CENTS = 100;

export const MANAGER_ABSORB_MIN_RENT_MESSAGE =
  "Rent must be greater than $1 for the manager to absorb the payment charge.";

export type PaymentChargeResponsibility = "TENANT" | "MANAGER";

export type PaymentChargeBilling = {
  paymentChargeResponsibility: PaymentChargeResponsibility;
  managerAbsorbsPaymentCharge: boolean;
  managerAbsorbedPaymentChargeCents: number;
  baseMonthlyRentCents: number;
  tenantFacingRentCents: number;
  baseMonthlyRent: number;
  tenantFacingRent: number;
};

export function dollarsToCents(amount: number) {
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

export function canManagerAbsorbPaymentCharge(monthlyRent: number) {
  return Number.isFinite(monthlyRent) && dollarsToCents(monthlyRent) > PAYMENT_CHARGE_CENTS;
}

export function computePaymentChargeBilling(monthlyRent: number, managerAbsorbsPaymentCharge: boolean): PaymentChargeBilling {
  const baseCents = dollarsToCents(monthlyRent);
  if (!managerAbsorbsPaymentCharge) {
    return {
      paymentChargeResponsibility: "TENANT",
      managerAbsorbsPaymentCharge: false,
      managerAbsorbedPaymentChargeCents: 0,
      baseMonthlyRentCents: baseCents,
      tenantFacingRentCents: baseCents,
      baseMonthlyRent: centsToDollars(baseCents),
      tenantFacingRent: centsToDollars(baseCents)
    };
  }
  if (baseCents <= PAYMENT_CHARGE_CENTS) {
    throw new Error(MANAGER_ABSORB_MIN_RENT_MESSAGE);
  }
  return {
    paymentChargeResponsibility: "MANAGER",
    managerAbsorbsPaymentCharge: true,
    managerAbsorbedPaymentChargeCents: PAYMENT_CHARGE_CENTS,
    baseMonthlyRentCents: baseCents,
    tenantFacingRentCents: baseCents - PAYMENT_CHARGE_CENTS,
    baseMonthlyRent: centsToDollars(baseCents),
    tenantFacingRent: centsToDollars(baseCents - PAYMENT_CHARGE_CENTS)
  };
}

export type LeaseBillingSource = {
  monthlyRent: number;
  managerAbsorbsPaymentCharge?: boolean;
  paymentChargeResponsibility?: string;
  managerAbsorbedPaymentChargeCents?: number;
};

// Derives billing for any lease. Legacy leases without the absorption fields
// default to tenant responsibility, and a lease whose rent no longer supports
// absorption falls back to tenant responsibility instead of producing a $0 or
// negative tenant-facing rent.
export function getLeaseBilling(lease: LeaseBillingSource): PaymentChargeBilling {
  const absorbs =
    lease.managerAbsorbsPaymentCharge === true || lease.paymentChargeResponsibility === "MANAGER";
  if (!absorbs || !canManagerAbsorbPaymentCharge(lease.monthlyRent)) {
    return computePaymentChargeBilling(lease.monthlyRent, false);
  }
  return computePaymentChargeBilling(lease.monthlyRent, true);
}
