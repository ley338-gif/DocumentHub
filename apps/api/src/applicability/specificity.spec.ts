import { specificity, ruleMatchesUnitContext } from "./specificity";
import { AppliedRuleSnapshot, UnitContext } from "./applicability.types";

function rule(overrides: Partial<AppliedRuleSnapshot> = {}): AppliedRuleSnapshot {
  return {
    id: "rule-1",
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

function context(overrides: Partial<UnitContext> = {}): UnitContext {
  return {
    unitId: "unit-1",
    productId: "product-1",
    productFamilyId: "family-1",
    variantId: "variant-1",
    batchId: "batch-1",
    parsedSerial: { prefix: "", sequence: 1843n },
    ...overrides,
  };
}

describe("specificity", () => {
  it("is 0 for a fully unscoped rule", () => {
    expect(specificity(rule())).toBe(0);
  });

  it("is 100 for a family-only rule", () => {
    expect(specificity(rule({ productFamilyId: "f1" }))).toBe(100);
  });

  it("is 200 for a product-only rule", () => {
    expect(specificity(rule({ productId: "p1" }))).toBe(200);
  });

  it("is 300 for a variant-only rule", () => {
    expect(specificity(rule({ variantId: "v1" }))).toBe(300);
  });

  it("is 400 for a batch-only rule", () => {
    expect(specificity(rule({ batchId: "b1" }))).toBe(400);
  });

  it("is 500 for a serial-range-only rule (serialFrom)", () => {
    expect(specificity(rule({ serialFrom: "1" }))).toBe(500);
  });

  it("is 500 for a serial-range-only rule (serialTo)", () => {
    expect(specificity(rule({ serialTo: "1" }))).toBe(500);
  });

  it("is 600 for a unit-only rule", () => {
    expect(specificity(rule({ unitId: "u1" }))).toBe(600);
  });

  it("takes the MAX across combined fields, not a sum (spec §63 example)", () => {
    const combined = rule({ productId: "p1", variantId: "v1", serialFrom: "1" });
    expect(specificity(combined)).toBe(500);
  });

  it("unit scope dominates even when combined with lower-specificity fields", () => {
    const combined = rule({ productId: "p1", batchId: "b1", unitId: "u1" });
    expect(specificity(combined)).toBe(600);
  });
});

describe("ruleMatchesUnitContext", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("an unscoped rule matches every context", () => {
    expect(ruleMatchesUnitContext(rule(), context(), now)).toBe(true);
  });

  it("matches on productFamilyId when equal", () => {
    expect(ruleMatchesUnitContext(rule({ productFamilyId: "family-1" }), context(), now)).toBe(true);
  });

  it("rejects on productFamilyId mismatch", () => {
    expect(ruleMatchesUnitContext(rule({ productFamilyId: "other" }), context(), now)).toBe(false);
  });

  it("matches on productId when equal", () => {
    expect(ruleMatchesUnitContext(rule({ productId: "product-1" }), context(), now)).toBe(true);
  });

  it("rejects on productId mismatch", () => {
    expect(ruleMatchesUnitContext(rule({ productId: "other" }), context(), now)).toBe(false);
  });

  it("matches on variantId when equal", () => {
    expect(ruleMatchesUnitContext(rule({ variantId: "variant-1" }), context(), now)).toBe(true);
  });

  it("rejects on variantId mismatch", () => {
    expect(ruleMatchesUnitContext(rule({ variantId: "other" }), context(), now)).toBe(false);
  });

  it("matches on batchId when equal", () => {
    expect(ruleMatchesUnitContext(rule({ batchId: "batch-1" }), context(), now)).toBe(true);
  });

  it("rejects on batchId mismatch", () => {
    expect(ruleMatchesUnitContext(rule({ batchId: "other" }), context(), now)).toBe(false);
  });

  it("matches on unitId when equal", () => {
    expect(ruleMatchesUnitContext(rule({ unitId: "unit-1" }), context(), now)).toBe(true);
  });

  it("rejects on unitId mismatch", () => {
    expect(ruleMatchesUnitContext(rule({ unitId: "other" }), context(), now)).toBe(false);
  });

  it("requires ALL non-null scope fields to match (AND semantics)", () => {
    const r = rule({ productId: "product-1", variantId: "wrong-variant" });
    expect(ruleMatchesUnitContext(r, context(), now)).toBe(false);
  });

  it("matches when all combined scope fields match", () => {
    const r = rule({ productId: "product-1", variantId: "variant-1", batchId: "batch-1" });
    expect(ruleMatchesUnitContext(r, context(), now)).toBe(true);
  });

  describe("serial ranges", () => {
    it("matches within an inclusive closed range, same prefix", () => {
      const r = rule({
        serialFrom: "1000",
        serialFromPrefix: "",
        serialFromSequence: "1000",
        serialTo: "1999",
        serialToPrefix: "",
        serialToSequence: "1999",
      });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 1843n } }), now)).toBe(true);
    });

    it("rejects outside a closed range", () => {
      const r = rule({
        serialFrom: "1000",
        serialFromPrefix: "",
        serialFromSequence: "1000",
        serialTo: "1999",
        serialToPrefix: "",
        serialToSequence: "1999",
      });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 2187n } }), now)).toBe(false);
    });

    it("rejects on prefix mismatch even if the number is in range", () => {
      const r = rule({
        serialFrom: "PM400-1000",
        serialFromPrefix: "PM400-",
        serialFromSequence: "1000",
        serialTo: "PM400-1999",
        serialToPrefix: "PM400-",
        serialToSequence: "1999",
      });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 1500n } }), now)).toBe(false);
    });

    it("open-ended range: serialFrom only matches everything >= from", () => {
      const r = rule({ serialFrom: "2000", serialFromPrefix: "", serialFromSequence: "2000" });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 2000n } }), now)).toBe(true);
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 999999n } }), now)).toBe(true);
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 1999n } }), now)).toBe(false);
    });

    it("open-ended range: serialTo only matches everything <= to", () => {
      const r = rule({ serialTo: "1999", serialToPrefix: "", serialToSequence: "1999" });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 0n } }), now)).toBe(true);
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 1999n } }), now)).toBe(true);
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: { prefix: "", sequence: 2000n } }), now)).toBe(false);
    });

    it("a serial-scoped rule rejects a context with no parsed serial", () => {
      const r = rule({ serialFrom: "1", serialFromPrefix: "", serialFromSequence: "1" });
      expect(ruleMatchesUnitContext(r, context({ parsedSerial: null }), now)).toBe(false);
    });
  });

  describe("validFrom / validUntil boundaries", () => {
    it("matches exactly at validFrom (inclusive)", () => {
      const r = rule({ validFrom: "2026-01-01T00:00:00Z" });
      expect(ruleMatchesUnitContext(r, context(), new Date("2026-01-01T00:00:00Z"))).toBe(true);
    });

    it("rejects before validFrom", () => {
      const r = rule({ validFrom: "2026-01-01T00:00:00Z" });
      expect(ruleMatchesUnitContext(r, context(), new Date("2025-12-31T23:59:59Z"))).toBe(false);
    });

    it("matches exactly at validUntil (inclusive)", () => {
      const r = rule({ validUntil: "2026-01-01T00:00:00Z" });
      expect(ruleMatchesUnitContext(r, context(), new Date("2026-01-01T00:00:00Z"))).toBe(true);
    });

    it("rejects after validUntil", () => {
      const r = rule({ validUntil: "2026-01-01T00:00:00Z" });
      expect(ruleMatchesUnitContext(r, context(), new Date("2026-01-01T00:00:01Z"))).toBe(false);
    });

    it("matches within an open validFrom/validUntil window", () => {
      const r = rule({ validFrom: "2026-01-01T00:00:00Z", validUntil: "2026-12-31T00:00:00Z" });
      expect(ruleMatchesUnitContext(r, context(), new Date("2026-06-01T00:00:00Z"))).toBe(true);
    });
  });

  describe("explicitExclusion", () => {
    it("an exclusion rule never matches, even with a matching scope", () => {
      const r = rule({ productId: "product-1", explicitExclusion: true });
      expect(ruleMatchesUnitContext(r, context(), now)).toBe(false);
    });

    it("an unscoped exclusion rule never matches", () => {
      const r = rule({ explicitExclusion: true });
      expect(ruleMatchesUnitContext(r, context(), now)).toBe(false);
    });
  });
});
