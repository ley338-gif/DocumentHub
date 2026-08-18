import { useId, type SelectHTMLAttributes } from "react";
import styles from "./Input.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({ label, error, id, options, className, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={[styles.input, error ? styles.error : "", className].filter(Boolean).join(" ")}
        aria-invalid={Boolean(error)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
