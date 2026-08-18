import {
  extractRow,
  findDuplicateSerialsInFile,
  isBlankRow,
  mapHeaders,
  parseCsvText,
  parseOptionalDate,
  validateRowShape,
} from "./csv-parser";

describe("parseCsvText", () => {
  it("parses a simple comma-separated file", () => {
    const rows = parseCsvText("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsvText('a,b\n"1,000",normal\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["1,000", "normal"],
    ]);
  });

  it("handles escaped double quotes inside a quoted field", () => {
    const rows = parseCsvText('a\n"He said ""hi"""\n');
    expect(rows).toEqual([["a"], ['He said "hi"']]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsvText("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    const rows = parseCsvText("a,b\n1,2");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves blank lines as empty rows so line numbers stay aligned", () => {
    const rows = parseCsvText("a,b\n1,2\n\n3,4\n");
    expect(rows).toHaveLength(4);
    expect(isBlankRow(rows[2])).toBe(true);
  });
});

describe("mapHeaders", () => {
  it("maps canonical and aliased header names, case/punctuation-insensitively", () => {
    const { columnByField, unknownColumns } = mapHeaders([
      "Serial Number",
      "product_reference",
      "Variant",
      "batchReference",
      "manufacturedAt",
      "delivered_at",
      "Internal Reference",
      "Some Other Column",
    ]);
    expect(columnByField).toEqual({
      serialNumber: 0,
      productReference: 1,
      variantReference: 2,
      batchReference: 3,
      manufacturedAt: 4,
      deliveredAt: 5,
      internalReference: 6,
    });
    expect(unknownColumns).toEqual(["Some Other Column"]);
  });

  it("does not report unknown columns for blank header cells", () => {
    const { unknownColumns } = mapHeaders(["serialNumber", "", "productReference"]);
    expect(unknownColumns).toEqual([]);
  });
});

describe("extractRow", () => {
  it("extracts fields by mapped column and treats blanks as null for optional fields", () => {
    const headers = mapHeaders(["serialNumber", "productReference", "variantReference"]);
    const row = extractRow(["SN001", "PROD1", "  "], headers, 2);
    expect(row).toEqual({
      line: 2,
      serialNumber: "SN001",
      productReference: "PROD1",
      variantReference: null,
      batchReference: null,
      manufacturedAtRaw: null,
      deliveredAtRaw: null,
      internalReference: null,
    });
  });
});

describe("parseOptionalDate", () => {
  it("returns null for blank input", () => {
    expect(parseOptionalDate(null)).toBeNull();
  });

  it("parses a valid ISO date", () => {
    const result = parseOptionalDate("2024-01-15");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getUTCFullYear()).toBe(2024);
  });

  it("returns undefined for an unparseable date", () => {
    expect(parseOptionalDate("not-a-date")).toBeUndefined();
  });
});

describe("validateRowShape", () => {
  it("requires serialNumber and productReference", () => {
    const { errors } = validateRowShape({
      line: 2,
      serialNumber: "",
      productReference: "",
      variantReference: null,
      batchReference: null,
      manufacturedAtRaw: null,
      deliveredAtRaw: null,
      internalReference: null,
    });
    expect(errors).toContain("serialNumber is required");
    expect(errors).toContain("productReference is required");
  });

  it("flags unparseable dates", () => {
    const { errors } = validateRowShape({
      line: 2,
      serialNumber: "SN1",
      productReference: "P1",
      variantReference: null,
      batchReference: null,
      manufacturedAtRaw: "not-a-date",
      deliveredAtRaw: null,
      internalReference: null,
    });
    expect(errors.some((e) => e.includes("manufacturedAt"))).toBe(true);
  });

  it("passes a fully valid row with no errors", () => {
    const { errors, manufacturedAt } = validateRowShape({
      line: 2,
      serialNumber: "SN1",
      productReference: "P1",
      variantReference: null,
      batchReference: null,
      manufacturedAtRaw: "2024-01-01",
      deliveredAtRaw: null,
      internalReference: null,
    });
    expect(errors).toEqual([]);
    expect(manufacturedAt).toBeInstanceOf(Date);
  });
});

describe("findDuplicateSerialsInFile", () => {
  it("detects serial numbers that repeat, case-sensitively", () => {
    const rows = [
      { line: 2, serialNumber: "SN1", productReference: "P", variantReference: null, batchReference: null, manufacturedAtRaw: null, deliveredAtRaw: null, internalReference: null },
      { line: 3, serialNumber: "sn1", productReference: "P", variantReference: null, batchReference: null, manufacturedAtRaw: null, deliveredAtRaw: null, internalReference: null },
      { line: 4, serialNumber: "SN1", productReference: "P", variantReference: null, batchReference: null, manufacturedAtRaw: null, deliveredAtRaw: null, internalReference: null },
      { line: 5, serialNumber: "SN2", productReference: "P", variantReference: null, batchReference: null, manufacturedAtRaw: null, deliveredAtRaw: null, internalReference: null },
    ];
    const dupes = findDuplicateSerialsInFile(rows);
    expect(dupes.has("SN1")).toBe(true);
    expect(dupes.has("sn1")).toBe(false);
    expect(dupes.has("SN2")).toBe(false);
  });
});
