/** Human-readable file size, e.g. 8.4 MB. The public API returns raw bytes
 * (PublicPublicationDto.fileSize); formatting is a frontend concern. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
};

/** Best-effort display label for a language code the backend returns
 * (free-form string, not a fixed enum) — falls back to the raw code
 * uppercased so an unrecognized code still renders sensibly. */
export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}
