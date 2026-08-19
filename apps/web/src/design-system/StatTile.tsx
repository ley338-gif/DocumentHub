import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";
import styles from "./StatTile.module.css";

export interface StatTileProps {
  label: ReactNode;
  /** A number is formatted with de-DE grouping; pass a string for anything
   * that isn't a plain count. */
  value: number | string;
  tone?: BadgeTone;
  /** Optional icon slot — an emoji is enough to match the reference
   * mockup's KPI cards, no icon library dependency needed. */
  icon?: ReactNode;
}

/** Shared "big number + labeled pill" summary tile. Originally a
 * page-local component in the CSV Import wizard's Prüfen step
 * (`ImportWizardPage.tsx`); extracted here so the Dashboard's KPI cards
 * reuse the exact same pattern instead of a second hand-rolled version. */
export function StatTile({ label, value, tone = "neutral", icon }: StatTileProps) {
  return (
    <div className={styles.tile}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.value}>{typeof value === "number" ? value.toLocaleString("de-DE") : value}</div>
        <div>
          <Badge tone={tone}>{label}</Badge>
        </div>
      </div>
    </div>
  );
}
