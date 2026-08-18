// Serial number normalization.
//
// Decision (documented in docs/applicability-resolution.md, spec §15):
// serial numbers are treated as [free-form prefix] + [trailing numeric run].
// The trailing run of digits (if any) becomes a comparable BigInt sequence;
// everything before it is the prefix. Two serials are only range-comparable
// when their prefixes are identical (case-sensitive, exact match) — this
// avoids comparing across unrelated serial-number families
// ("PM400-002183" vs "002000") by accident.
//
// A serial with no trailing digits at all has sequence 0 and can only ever
// be matched by exact prefix equality with an empty range (from === to).

export interface ParsedSerial {
  prefix: string;
  sequence: bigint;
  sequenceLength: number;
}

const TRAILING_DIGITS = /(\d+)$/;

export function parseSerial(raw: string): ParsedSerial {
  const value = raw.trim();
  const match = TRAILING_DIGITS.exec(value);

  if (!match) {
    return { prefix: value, sequence: 0n, sequenceLength: 0 };
  }

  const digits = match[1];
  const prefix = value.slice(0, value.length - digits.length);

  return {
    prefix,
    sequence: BigInt(digits),
    sequenceLength: digits.length,
  };
}

/**
 * Whether `serial` falls within [from, to] (inclusive bounds, either may be
 * omitted for an open range). Range and serial must share the same prefix,
 * otherwise they are considered non-comparable and this returns false.
 */
export function serialInRange(
  serial: ParsedSerial,
  from: ParsedSerial | null,
  to: ParsedSerial | null,
): boolean {
  if (from && from.prefix !== serial.prefix) return false;
  if (to && to.prefix !== serial.prefix) return false;
  if (from && serial.sequence < from.sequence) return false;
  if (to && serial.sequence > to.sequence) return false;
  return true;
}
