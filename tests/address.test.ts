import { describe, expect, it } from "vitest";

import { formatAddress, formatUnitAddress, parseAddressText, validateAddress, validateOptionalAddress } from "../lib/address";

describe("address helpers", () => {
  it("normalizes, validates, and formats a US address", () => {
    const result = validateAddress({
      addressLine1: " 240 Valencia Street ",
      addressLine2: "Suite 500",
      city: "San Francisco",
      state: "ca",
      postalCode: "94103",
      country: "United States"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.address.state).toBe("CA");
      expect(result.address.country).toBe("US");
      expect(result.formattedAddress).toBe("240 Valencia Street, Suite 500, San Francisco, CA 94103, United States");
    }
  });

  it("returns field errors for incomplete addresses", () => {
    const result = validateAddress({ city: "San Francisco", state: "CA", postalCode: "94103", country: "US" });

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.errors.addressLine1).toBe("Street address is required.");
    }
  });

  it("treats a blank optional mailing address as empty", () => {
    const result = validateOptionalAddress({ country: "US" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.formattedAddress).toBeUndefined();
    }
  });

  it("parses legacy text and composes unit mailing addresses", () => {
    const parsed = parseAddressText("240 Valencia Street, Suite 500, San Francisco, CA 94103");

    expect(formatAddress(parsed)).toBe("240 Valencia Street, Suite 500, San Francisco, CA 94103, United States");
    expect(formatUnitAddress(parsed, { unitNumber: "7B" })).toBe(
      "240 Valencia Street, Suite 500, Unit 7B, San Francisco, CA 94103, United States"
    );
  });
});
