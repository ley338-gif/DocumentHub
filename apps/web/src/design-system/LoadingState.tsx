import { Spinner } from "./Spinner";
import styles from "./LoadingState.module.css";

export interface LoadingStateProps {
  /** Optional text shown under the spinner (e.g. "Produkt wird geladen…").
   * Omit for a bare centered spinner. */
  label?: string;
  size?: number;
}

/** One consistent convention for "this whole view/section is loading",
 * wrapping the existing Spinner with the same centered spacing everywhere
 * instead of each page sizing/centering `<Spinner />` ad hoc. Use this for
 * full-page or full-section loading; keep a bare inline `<Spinner size={..}
 * />` only for small in-context indicators (e.g. next to a button). */
export function LoadingState({ label, size = 32 }: LoadingStateProps) {
  return (
    <div className={styles.wrapper}>
      <Spinner size={size} label={label ?? "Lädt…"} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
