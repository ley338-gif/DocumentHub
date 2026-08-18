import { rulesCouldOverlap } from "./rules-overlap";
import { AppliedRuleSnapshot } from "../applicability/applicability.types";

function rule(overrides: Partial<AppliedRuleSnapshot> = {}): AppliedRuleSnapshot {
  return {
    id: "r",
    productFamilyId: null,
    productId: null,
    variantId: null,
    batchId: null,
    unitId: null,
    serialFrom: null,
    serialFromPrefix: null,
    serialFromSequence: null,
    serialTo: null,
    serialToPrefix: null,
    serialToSequence: null,
    validFrom: null,
    validUntil: null,
    explicitExclusion: false,
    ...overrides,
  };
}

describe("rulesCouldOverlap", () => {
  it("flags overlapping serial ranges as a conflict (spec §75: 1000-1999 vs 1800-2500)", () => {
    const a = rule({ serialFrom: "1000", serialFromPrefix: "", serialFromSequence: "1000", serialTo: "1999", serialToPrefix: "", serialToSequence: "1999" });
    const b = rule({ serialFrom: "1800", serialFromPrefix: "", serialFromSequence: "1800", serialTo: "2500", serialToPrefix: "", serialToSequence: "2500" });
    expect(rulesCouldOverlap(a, b)).toBe(true);
  });

  it("does not flag non-overlapping ranges (1-1999 vs >=2000)", () => {
    const a = rule({ serialFrom: "1", serialFromPrefix: "", serialFromSequence: "1", serialTo: "1999", serialToPrefix: "", serialToSequence: "1999" });
    const b = rule({ serialFrom: "2000", serialFromPrefix: "", serialFromSequence: "2000" });
    expect(rulesCouldOverlap(a, b)).toBe(false);
  });

  it("flags two fully unscoped rules as overlapping", () => {
    expect(rulesCouldOverlap(rule(), rule())).toBe(true);
  });

  it("does not flag rules scoped to different products", () => {
    const a = rule({ productId: "p1" });
    const b = rule({ productId: "p2" });
    expect(rulesCouldOverlap(a, b)).toBe(false);
  });

  it("flags rules scoped to the same product", () => {
    const a = rule({ productId: "p1" });
    const b = rule({ productId: "p1" });
    expect(rulesCouldOverlap(a, b)).toBe(true);
  });

  it("does not flag ranges with different serial prefixes", () => {
    const a = rule({ serialFrom: "1", serialFromPrefix: "A-", serialFromSequence: "1" });
    const b = rule({ serialFrom: "1", serialFromPrefix: "B-", serialFromSequence: "1" });
    expect(rulesCouldOverlap(a, b)).toBe(false);
  });

  it("treats an unscoped serial dimension as a wildcard (overlap possible)", () => {
    const a = rule({ serialFrom: "1000", serialFromPrefix: "", serialFromSequence: "1000" });
    const b = rule({});
    expect(rulesCouldOverlap(a, b)).toBe(true);
  });
});
