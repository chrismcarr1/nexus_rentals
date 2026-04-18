import { describe, expect, it } from "vitest";

import { formatCurrency, parseTags } from "../lib/utils";

describe("utility helpers", () => {
  it("formats usd currency cleanly", () => {
    expect(formatCurrency(4250)).toBe("$4,250");
  });

  it("parses comma separated tags", () => {
    expect(parseTags("repair, turnover, paint ")).toEqual(["repair", "turnover", "paint"]);
  });
});
