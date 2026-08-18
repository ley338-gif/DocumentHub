// Prisma models use BigInt for serial sequences (Unit.serialSequence,
// ApplicabilityRule.serialFrom/ToSequence). Node's JSON.stringify throws on
// BigInt by default ("Do not know how to serialize a BigInt"), and that's
// exactly what Express's res.json() uses under the hood. Rather than
// manually stringifying every BigInt field on every DTO, we patch
// BigInt.prototype.toJSON once, at process start, so any BigInt anywhere in
// a response body serializes to its decimal string form automatically.
// Imported for its side effect only — see main.ts and the e2e test
// bootstrap (Nest's TestingModule doesn't go through main.ts).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (this: bigint) {
  return this.toString();
};

export {};
