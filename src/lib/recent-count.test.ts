import { describe, expect, it } from "vitest";
import { DEFAULT_RECENT_COUNT, resolveRecentCount } from "./recent-count";

describe("resolveRecentCount", () => {
  it("accepts every dropdown preset", () => {
    for (const value of ["5", "10", "25", "50", "100"]) {
      expect(resolveRecentCount(value)).toBe(Number(value));
    }
  });

  it("falls back to the default when the value is missing", () => {
    expect(resolveRecentCount(undefined)).toBe(DEFAULT_RECENT_COUNT);
    expect(resolveRecentCount(null)).toBe(DEFAULT_RECENT_COUNT);
    expect(resolveRecentCount("")).toBe(DEFAULT_RECENT_COUNT);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(resolveRecentCount("lots")).toBe(DEFAULT_RECENT_COUNT);
  });

  it("rejects zero and negative values that would break history slicing", () => {
    expect(resolveRecentCount("0")).toBe(DEFAULT_RECENT_COUNT);
    expect(resolveRecentCount("-10")).toBe(DEFAULT_RECENT_COUNT);
  });

  it("keeps a positive value stored by the old textfield preference", () => {
    expect(resolveRecentCount("20")).toBe(20);
  });

  it("parses a leading number and ignores trailing text", () => {
    expect(resolveRecentCount("25 items")).toBe(25);
  });

  it("defaults to 50", () => {
    expect(DEFAULT_RECENT_COUNT).toBe(50);
  });
});
