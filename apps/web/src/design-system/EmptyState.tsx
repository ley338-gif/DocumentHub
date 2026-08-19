import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** Optional icon/illustration slot — pass an emoji, inline SVG, or leave
   * empty for a text-only empty state. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** e.g. a primary Button like "Neues Produkt" to act on the empty state. */
  action?: ReactNode;
}

/** The one shared "nothing here" pattern for lists/tables, replacing the
 * hand-rolled "Keine ... vorhanden" strings that were scattered across
 * feature pages as bare Table `emptyMessage` text. Pass this as a Table's
 * `emptyMessage` (it renders fine inside the table's empty `<td>`) or use it
 * standalone wherever a list of any kind can be empty. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.wrapper}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
