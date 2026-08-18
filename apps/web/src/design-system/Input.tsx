import { useId, type InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[styles.input, error ? styles.error : "", className].filter(Boolean).join(" ")}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
