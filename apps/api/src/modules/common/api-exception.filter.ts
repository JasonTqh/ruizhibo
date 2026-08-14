import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { writeOperationalLog } from "./operational-logger";
import { RequestWithContext } from "./request-context";

type ExceptionResponseBody =
  | string
  | {
      code?: string;
      message?: string | string[];
    };

type StatusError = Error & {
  status?: number;
  statusCode?: number;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const status = this.resolveStatus(exception);
    const code = this.resolveCode(status, exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      writeOperationalLog("error", "http_exception", {
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        statusCode: status,
        code,
        errorType:
          exception instanceof Error
            ? exception.constructor.name
            : typeof exception,
      });
    }

    response.status(status).json({
      error: {
        code,
        message: this.resolveMessage(exception, status),
        requestId: request.requestId,
      },
    });
  }

  private resolveStatus(exception: unknown) {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    const statusError = exception as StatusError;
    const candidate = statusError?.status ?? statusError?.statusCode;
    return typeof candidate === "number" && candidate >= 400 && candidate < 600
      ? candidate
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveCode(status: number, exception: unknown) {
    if (exception instanceof HttpException) {
      const body = exception.getResponse() as ExceptionResponseBody;
      if (typeof body === "object" && body.code) {
        return body.code;
      }
    }

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return "PAYLOAD_TOO_LARGE";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }

  private resolveMessage(exception: unknown, status: number) {
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return "请求内容过大，请压缩图片或减少文件数量";
    }

    if (!(exception instanceof HttpException)) {
      return "Internal server error";
    }

    const body = exception.getResponse() as ExceptionResponseBody;
    if (typeof body === "string") {
      return body;
    }

    if (Array.isArray(body.message)) {
      return body.message.join("; ");
    }

    if (body.message) {
      return body.message;
    }

    return exception.message;
  }
}
