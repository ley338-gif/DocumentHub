import type { CSSProperties } from "react";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
  size?: number;
  centered?: boolean;
  label?: string;
}

export function Spinner({ size = 24, centered = false, label = "Lädt…" }: SpinnerProps) {
  const spinner = (
    <span
      className={styles.spinner}
      style={{ "--size": `${size}px` } as CSSProperties}
      role="status"
      aria-label={label}
    />
  );
  return centered ? <div className={styles.center}>{spinner}</div> : spinner;
}
