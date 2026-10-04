import { ERROR_CODES, type ErrorCode } from '@/shared/error-codes';
import type { ApiErrorBody } from '@/shared/types/dto';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: unknown[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Некорректный запрос') {
    super(ERROR_CODES.BAD_REQUEST, 400, message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Требуется вход в систему') {
    super(ERROR_CODES.UNAUTHENTICATED, 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Действие запрещено') {
    super(ERROR_CODES.FORBIDDEN, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не найдено') {
    super(ERROR_CODES.NOT_FOUND, 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode = ERROR_CODES.CONFLICT, message = 'Конфликт данных') {
    super(code, 409, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Ожидается Content-Type: application/json') {
    super(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 415, message);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown[], message = 'Проверьте корректность введённых данных') {
    super(ERROR_CODES.VALIDATION_ERROR, 422, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(
    public readonly retryAfterSeconds: number,
    message = 'Слишком много запросов. Попробуйте позже',
  ) {
    super(ERROR_CODES.RATE_LIMITED, 429, message);
  }
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(ERROR_CODES.INTERNAL, 500, 'Внутренняя ошибка сервера');

  const body: ApiErrorBody = {
    error: {
      code: appError.httpStatus === 500 ? ERROR_CODES.INTERNAL : appError.code,
      message: appError.httpStatus === 500 ? 'Внутренняя ошибка сервера' : appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      requestId,
    },
  };

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Request-Id': requestId,
  });
  if (appError instanceof RateLimitError) {
    headers.set('Retry-After', String(appError.retryAfterSeconds));
  }

  return Response.json(body, { status: appError.httpStatus, headers });
}
