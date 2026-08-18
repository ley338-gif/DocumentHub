import { customAlphabet } from "nanoid";

// Opaque, URL-safe, non-sequential public identifiers (spec §9).
// Unambiguous alphabet: no 0/O/1/I/l.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const nanoid = customAlphabet(ALPHABET, 10);

export function generateStableId(): string {
  return nanoid();
}
