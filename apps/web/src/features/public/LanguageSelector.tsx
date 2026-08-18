import { languageLabel } from "../../lib/format";
import styles from "./PublicPage.module.css";

export interface LanguageSelectorProps {
  languages: string[];
  selected: string;
  onSelect: (language: string) => void;
}

/** Only rendered when the resolved publications span more than one
 * language (derived from the response, never hardcoded). */
export function LanguageSelector({ languages, selected, onSelect }: LanguageSelectorProps) {
  if (languages.length <= 1) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Sprache wählen</div>
      <p className={styles.sectionHint}>Die Dokumente sind in folgenden Sprachen verfügbar.</p>
      <div className={styles.languageGrid}>
        {languages.map((lang) => (
          <button
            key={lang}
            type="button"
            className={[styles.languageChip, lang === selected ? styles.languageChipActive : ""].join(" ")}
            onClick={() => onSelect(lang)}
            aria-pressed={lang === selected}
          >
            {languageLabel(lang)}
          </button>
        ))}
      </div>
    </div>
  );
}
