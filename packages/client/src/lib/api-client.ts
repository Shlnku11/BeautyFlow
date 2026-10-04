import type { ApiErrorBody } from '@/shared/types/dto';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
  redirectOnUnauthorized?: boolean;
}

const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  const error = value.error;
  return (
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.requestId === 'string' &&
    (error.details === undefined || Array.isArray(error.details))
  );
}

function shouldRedirectToLogin(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return ![...PUBLIC_PATHS].some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`));
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, redirectOnUnauthorized, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  const fetchOptions: RequestInit = {
    ...requestOptions,
    credentials: 'same-origin',
    headers,
  };
  if (body !== undefined) fetchOptions.body = JSON.stringify(body);

  const response = await fetch(path, fetchOptions);

  if (response.status === 204) return undefined as T; // A 204 contract intentionally has no payload.

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = isApiErrorBody(payload) ? payload : undefined;
    const error = errorPayload?.error;
    if (
      response.status === 401 &&
      redirectOnUnauthorized !== false &&
      shouldRedirectToLogin()
    ) {
      window.location.assign('/login');
    }
    throw new ApiClientError(
      error?.code ?? 'INTERNAL',
      response.status,
      error?.message ?? 'Не удалось выполнить запрос',
      error?.details,
      error?.requestId ?? response.headers.get('X-Request-Id') ?? undefined,
    );
  }

  if (!isRecord(payload) || !('data' in payload)) {
    throw new ApiClientError(
      'INVALID_RESPONSE',
      response.status,
      'Сервер вернул ответ в неизвестном формате',
      undefined,
      response.headers.get('X-Request-Id') ?? undefined,
    );
  }
  // The API envelope is validated here; the caller supplies the expected DTO type for its route.
  return payload.data as T;
}
