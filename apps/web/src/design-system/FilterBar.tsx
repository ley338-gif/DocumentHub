import type { ReactNode } from "react";
import { Input } from "./Input";
import styles from "./FilterBar.module.css";

export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
}

/** Search input plus a slot for arbitrary filter controls (selects, chips,
 * date pickers, ...) supplied by the caller. */
export function FilterBar({ searchValue, onSearchChange, searchPlaceholder = "Suchen…", children }: FilterBarProps) {
  return (
    <div className={styles.bar}>
      {onSearchChange && (
        <div className={styles.search}>
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      {children && <div className={styles.slot}>{children}</div>}
    </div>
  );
}
