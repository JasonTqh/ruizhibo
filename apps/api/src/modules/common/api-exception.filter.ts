import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

type ExceptionResponseBody =
  | string
  | {
      code?: string;
      message?: string | string[];
    };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: {
        code: this.resolveCode(status, exception),
        message: this.resolveMessage(exception),
      },
    });
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
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }

  private resolveMessage(exception: unknown) {
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
