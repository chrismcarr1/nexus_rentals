import { describe, expect, it } from "vitest";

import { isRetiredAccountEmail } from "@/lib/retired-accounts";

describe("isRetiredAccountEmail", () => {
  it("blocks legacy shared-account domains regardless of casing or whitespace", () => {
    expect(isRetiredAccountEmail(" manager@NEXUSRENTALS.LOCAL ")).toBe(true);
    expect(isRetiredAccountEmail("tenant@northstar.local")).toBe(true);
  });

  it("allows normal customer addresses", () => {
    expect(isRetiredAccountEmail("owner@example.com")).toBe(false);
    expect(isRetiredAccountEmail("owner@nexusrentals.co")).toBe(false);
  });
});
