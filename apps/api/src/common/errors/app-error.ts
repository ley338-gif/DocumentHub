export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "TENANT_VIOLATION"
  | "INVALID_STATE_TRANSITION"
  | "APPLICABILITY_CONFLICT"
  | "PUBLICATION_CONFLICT"
  | "FILE_VALIDATION_FAILED"
  | "IMPORT_VALIDATION_FAILED";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  TENANT_VIOLATION: 403,
  INVALID_STATE_TRANSITION: 409,
  APPLICABILITY_CONFLICT: 409,
  PUBLICATION_CONFLICT: 409,
  FILE_VALIDATION_FAILED: 400,
  IMPORT_VALIDATION_FAILED: 400,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    this.details = details;
  }
}
