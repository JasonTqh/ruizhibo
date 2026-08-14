import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../auth/auth.types";
import { writeOperationalLog } from "./operational-logger";

export const REQUEST_ID_HEADER = "x-request-id";

export interface RequestWithContext extends Request {
  requestId?: string;
  user?: AuthUser;
}

function isSafeRequestId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function resolveRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isSafeRequestId(candidate) ? candidate : randomUUID();
}

export function requestContextMiddleware(
  request: RequestWithContext,
  response: Response,
  next: NextFunction,
) {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  const startedAt = process.hrtime.bigint();
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  response.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = response.statusCode;
    const level =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    writeOperationalLog(level, "http_request", {
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: request.user?.id,
      userRole: request.user?.role,
    });
  });

  next();
}
