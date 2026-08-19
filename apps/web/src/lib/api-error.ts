// Mirrors apps/api/src/common/errors/app-error.ts's AppErrorCode union and
// the { error: { code, message, details } } shape emitted by
// AllExceptionsFilter, so the frontend never has to guess.
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "TENANT_VIOLATION"
  | "INVALID_STATE_TRANSITION"
  | "APPLICABILITY_CONFLICT"
  | "PUBLICATION_CONFLICT"
  | "FILE_VALIDATION_FAILED"
  | "IMPORT_VALIDATION_FAILED"
  | "TENANT_SUSPENDED"
  | "TENANT_CLOSED"
  | "INVITATION_LOGIN_REQUIRED"
  | "LAST_ADMIN_PROTECTED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export interface ApiErrorDetails {
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** A message safe to show directly to an end user, in German, tailored by
   * error code rather than the raw backend message (which may be an
   * internal/English string not meant for display). */
  get userMessage(): string {
    switch (this.code) {
      case "NOT_FOUND":
        return "Nicht gefunden.";
      case "VALIDATION_ERROR":
        return this.fieldSummary() ?? "Die Eingaben sind ungültig. Bitte prüfen Sie Ihre Angaben.";
      case "FORBIDDEN":
      case "TENANT_VIOLATION":
        return "Zugriff verweigert. Sie haben keine Berechtigung für diese Aktion.";
      case "INVALID_STATE_TRANSITION":
        return "Diese Aktion ist im aktuellen Status nicht möglich.";
      case "APPLICABILITY_CONFLICT":
        return "Es besteht ein Konflikt in den Anwendbarkeitsregeln.";
      case "PUBLICATION_CONFLICT":
        return "Es besteht ein Konflikt bei der Veröffentlichung.";
      case "FILE_VALIDATION_FAILED":
        return "Die Datei konnte nicht validiert werden.";
      case "IMPORT_VALIDATION_FAILED":
        return "Der Import enthält ungültige Daten.";
      case "TENANT_SUSPENDED":
        return "Diese Organisation ist gesperrt. Änderungen sind derzeit nicht möglich.";
      case "TENANT_CLOSED":
        return "Diese Organisation wurde geschlossen.";
      case "INVITATION_LOGIN_REQUIRED":
        return "Bitte melden Sie sich an, um diese Einladung anzunehmen.";
      case "LAST_ADMIN_PROTECTED":
        return "Diese Organisation benötigt mindestens einen aktiven Administrator.";
      case "NETWORK_ERROR":
        return "Die Verbindung zum Server ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung.";
      default:
        return "Es ist ein unerwarteter Fehler aufgetreten.";
    }
  }

  private fieldSummary(): string | undefined {
    const details = this.details;
    if (!details || typeof details !== "object") return undefined;
    // class-validator style: array of { property, constraints } or a plain
    // array of strings. Render the first couple, whatever shape shows up.
    const entries = Array.isArray(details) ? details : Object.values(details as Record<string, unknown>);
    const messages = entries
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const constraints = (entry as { constraints?: Record<string, string> }).constraints;
          if (constraints) return Object.values(constraints).join(", ");
        }
        return undefined;
      })
      .filter((v): v is string => Boolean(v));
    return messages.length > 0 ? messages.join(" ") : undefined;
  }
}
