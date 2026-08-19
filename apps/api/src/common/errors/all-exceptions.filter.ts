import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { Request, Response } from "express";
import { AppError } from "./app-error";
import { logJson } from "../structured-logger";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req?.requestId;

    if (exception instanceof AppError) {
      res.status(exception.httpStatus).json({
        error: { code: exception.code, message: exception.message, details: exception.details, requestId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string" ? body : ((body as any)?.message ?? exception.message);
      res.status(status).json({
        error: { code: httpStatusToCode(status), message, requestId },
      });
      return;
    }

    // Never leak a stack trace, SQL error, Prisma detail, or filesystem
    // path to the client (spec §33) — those go to the structured log only,
    // correlated by requestId, which the client DOES get so they can
    // report it to support.
    logJson("error", {
      requestId,
      message: "Unhandled exception",
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId } });
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "INVALID_STATE_TRANSITION";
    case 413:
      // Multer's own fileSize limit throws a plain HttpException (not an
      // AppError), so it lands here rather than in the FILE_VALIDATION_FAILED
      // branch RevisionsService uses for its own (redundant, defense-in-depth)
      // size check.
      return "FILE_VALIDATION_FAILED";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}
