import { getEnv } from '@/server/config/env';
import { ForbiddenError, UnsupportedMediaTypeError } from '@/server/http/errors';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function assertJsonContentType(request: Request): void {
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('application/json')) {
    throw new UnsupportedMediaTypeError();
  }
}

export function assertMutationOrigin(request: Request, required = true): void {
  if (!required) return;
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const source = origin ?? referer;
  if (!source) throw new ForbiddenError('Источник запроса не подтверждён');

  let sourceOrigin: string;
  try {
    sourceOrigin = new URL(source).origin;
  } catch {
    throw new ForbiddenError('Источник запроса не подтверждён');
  }

  if (sourceOrigin !== new URL(getEnv().APP_BASE_URL).origin) {
    throw new ForbiddenError('Источник запроса не совпадает с origin приложения');
  }
}

export function isMutationMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}
