import type { ReactNode } from "react";
import styles from "./DescriptionList.module.css";

export interface DescriptionItemProps {
  label: ReactNode;
  value: ReactNode;
}

/** One label/value row inside a DescriptionList. */
export function DescriptionItem({ label, value }: DescriptionItemProps) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

export interface DescriptionListProps {
  children: ReactNode;
}

/** The one shared key-value display pattern for a tab's read-only "Übersicht"
 * view (Product Detail, Document Detail, ...) — a semantic `<dl>` styled as
 * a bold-label/plain-value stack, replacing the ad hoc `<div><span
 * style={{fontWeight:600}}>Label: </span>value</div>` rows that had drifted
 * slightly apart between ProductDetailPage's and DocumentDetailPage's
 * Übersicht tabs. Use `<DescriptionList><DescriptionItem label="…"
 * value="…" />…</DescriptionList>`. */
export function DescriptionList({ children }: DescriptionListProps) {
  return <dl className={styles.list}>{children}</dl>;
}
