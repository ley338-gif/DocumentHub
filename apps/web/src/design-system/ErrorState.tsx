import type { ReactNode } from "react";
import { ApiError } from "../lib/api-error";
import { Button } from "./Button";
import styles from "./ErrorState.module.css";

export interface ErrorStateProps {
  /** The caught error, or a plain string if the caller already extracted a
   * message. When it's an ApiError, `.userMessage` (the German,
   * user-safe message) is rendered — never the raw code or an English
   * backend message. */
  error: unknown;
  /** Fallback message used when `error` is neither an ApiError nor a
   * string with useful content (e.g. a NETWORK_ERROR-shaped unknown). */
  fallback?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** The one correct pattern for rendering a failed request: always shows
 * ApiError.userMessage (German, human), never a raw error code or English
 * message, with an optional retry action. Replaces the bare
 * `<p role="alert">{error}</p>` scattered across feature pages. */
export function ErrorState({ error, fallback = "Es ist ein unerwarteter Fehler aufgetreten.", onRetry, retryLabel = "Erneut versuchen" }: ErrorStateProps) {
  const message = resolveMessage(error, fallback);
  return (
    <div className={styles.wrapper} role="alert">
      <span className={styles.message}>{message}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

function resolveMessage(error: unknown, fallback: string): ReactNode {
  if (error instanceof ApiError) return error.userMessage;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
