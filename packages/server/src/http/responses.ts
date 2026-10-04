import type { ApiSuccess } from '@/shared/types/dto';

export type ResponseMeta = Record<string, number | string | boolean>;

function jsonResponse<T>(body: T, status: number, requestId: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('X-Request-Id', requestId);
  return Response.json(body, { status, headers: responseHeaders });
}

export function ok<T>(data: T, requestId: string, meta?: ResponseMeta): Response {
  const body: ApiSuccess<T> = {
    data,
    ...(meta ? { meta } : {}),
  };
  return jsonResponse(body, 200, requestId);
}

export function created<T>(data: T, requestId: string, headers?: HeadersInit): Response {
  return jsonResponse<ApiSuccess<T>>({ data }, 201, requestId, headers);
}

export function accepted<T>(data: T, requestId: string): Response {
  return jsonResponse<ApiSuccess<T>>({ data }, 202, requestId);
}

export function noContent(requestId: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('X-Request-Id', requestId);
  return new Response(null, { status: 204, headers: responseHeaders });
}
