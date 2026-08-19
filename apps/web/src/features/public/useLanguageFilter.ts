import { useEffect, useMemo, useState } from "react";
import type { PublicPublicationDto } from "../../lib/api-types";

/** Derives the set of languages actually present across the resolved
 * publications (never a hardcoded list) and tracks which one is selected,
 * defaulting to the first alphabetically. */
export function useLanguageFilter(publications: PublicPublicationDto[]) {
  const languages = useMemo(
    () => Array.from(new Set(publications.map((p) => p.language))).sort(),
    [publications],
  );
  const [selected, setSelected] = useState<string | undefined>(languages[0]);

  useEffect(() => {
    if (languages.length > 0 && (!selected || !languages.includes(selected))) {
      setSelected(languages[0]);
    }
  }, [languages, selected]);

  const filtered = useMemo(
    () => (selected ? publications.filter((p) => p.language === selected) : publications),
    [publications, selected],
  );

  return { languages, selected: selected ?? languages[0] ?? "", setSelected, filtered };
}
