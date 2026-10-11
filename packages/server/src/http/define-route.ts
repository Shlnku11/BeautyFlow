import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { ZodType } from 'zod';

import type { PublicContext, TenantContext } from '@/shared/types/tenant-context';
import { getEnv } from '@/server/config/env';
import { logger } from '@/server/http/logger';
import {
  AppError,
  NotFoundError,
  UnauthenticatedError,
  toErrorResponse,
  ValidationError,
} from '@/server/http/errors';
import { assertJsonContentType, assertMutationOrigin } from '@/server/http/csrf';
import { enforceRateLimit, type RateLimitPolicy } from '@/server/http/rate-limit';
import { assertPermission, type PermissionKey } from '@/server/domain/permissions';
import { AuditLog } from '@/server/db/models';
import { Types } from 'mongoose';
import { ERROR_CODES } from '@/shared/error-codes';

export type RouteAuth = 'none' | 'session' | 'cron';
export type ContextSource = 'NONE' | 'SESSION' | 'SLUG' | 'TOKEN' | 'CRON';
export type RouteContext = TenantContext | PublicContext | { actor: 'system' } | undefined;

export interface RouteParams {
  [key: string]: string;
}

export interface RouteHandlerInput<TBody, TQuery, TParams> {
  request: Request;
  requestId: string;
  body: TBody;
  query: TQuery;
  params: TParams;
  context: RouteContext;
}

export interface DefineRouteOptions<
  TBodySchema extends ZodType = ZodType<undefined>,
  TQuerySchema extends ZodType = ZodType<Record<string, never>>,
  TParamsSchema extends ZodType = ZodType<RouteParams>,
> {
  id: string;
  method: string;
  path: string;
  auth: RouteAuth;
  permission?: PermissionKey;
  contextSource: ContextSource;
  bodySchema?: TBodySchema;
  querySchema?: TQuerySchema;
  paramsSchema?: TParamsSchema;
  rateLimit?: RateLimitPolicy;
  handler: (
    input: RouteHandlerInput<
      TBodySchema extends ZodType ? ReturnType<TBodySchema['parse']> : undefined,
      TQuerySchema extends ZodType ? ReturnType<TQuerySchema['parse']> : Record<string, never>,
      TParamsSchema extends ZodType ? ReturnType<TParamsSchema['parse']> : RouteParams
    >,
  ) => Promise<Response | unknown> | Response | unknown;
}

export interface RouteRuntime {
  resolveTenantContext(request: Request): Promise<TenantContext | null>;
  hasActiveShift?(context: TenantContext): Promise<boolean>;
  resolvePublicContext(
    request: Request,
    source: 'SLUG' | 'TOKEN',
    params: RouteParams,
  ): Promise<PublicContext | null>;
}

let routeRuntime: RouteRuntime | undefined;

export function configureRouteRuntime(runtime: RouteRuntime): void {
  routeRuntime = runtime;
}

function queryRecord(searchParams: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    result[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  return result;
}

function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}

function parseJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new AppError('BAD_REQUEST', 400, 'Некорректный JSON');
  });
}

function isTenantContext(context: RouteContext): context is TenantContext {
  return context !== undefined && 'userId' in context && 'role' in context;
}

function addRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  if (response.headers.get('cache-control') === null) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function defineRoute<
  TBodySchema extends ZodType = ZodType<undefined>,
  TQuerySchema extends ZodType = ZodType<Record<string, never>>,
  TParamsSchema extends ZodType = ZodType<RouteParams>,
>(options: DefineRouteOptions<TBodySchema, TQuerySchema, TParamsSchema>) {
  return async function routeHandler(
    request: Request,
    routeContext?: { params?: Promise<RouteParams> | RouteParams },
  ): Promise<Response> {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      if (options.rateLimit) await enforceRateLimit(request, options.rateLimit);
      assertMutationOrigin(request, options.auth === 'session' || options.contextSource === 'SESSION');

      const rawParams = await routeContext?.params;
      const params = options.paramsSchema
        ? parseOrThrow(options.paramsSchema, rawParams ?? {})
        : ((rawParams ?? {}) as RouteParams); // Next route params are a string map when no schema is provided.

      let context: RouteContext = undefined;
      if (options.auth === 'cron' || options.contextSource === 'CRON') {
        const expected = Buffer.from(getEnv().CRON_SECRET);
        const authorization = request.headers.get('authorization') ?? '';
        const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ''));
        const matches =
          authorization.toLowerCase().startsWith('bearer ') &&
          supplied.length === expected.length &&
          timingSafeEqual(supplied, expected);
        if (!matches) throw new UnauthenticatedError();
        context = { actor: 'system' };
      } else if (options.contextSource === 'SESSION' || options.auth === 'session') {
        context = (await routeRuntime?.resolveTenantContext(request)) ?? undefined;
        if (!context) throw new UnauthenticatedError();
      } else if (options.contextSource === 'SLUG' || options.contextSource === 'TOKEN') {
        const source = options.contextSource;
        context =
          (await routeRuntime?.resolvePublicContext(
            request,
            source,
            params as RouteParams, // Public resolvers only read the route's slug or token parameter.
          )) ??
          undefined;
        if (!context) {
          throw new NotFoundError();
        }
      }

      if (options.permission) {
        if (!isTenantContext(context)) throw new UnauthenticatedError();
        assertPermission(context.role, options.permission);
      }

      if (isTenantContext(context) && context.role === 'master' && options.permission !== 'account:self' && routeRuntime?.hasActiveShift) {
        if (!(await routeRuntime.hasActiveShift(context))) {
          throw new AppError(ERROR_CODES.SHIFT_REQUIRED, 423, 'Чтобы пользоваться кабинетом, сначала начните смену');
        }
      }

      const url = new URL(request.url);
      const rawQuery = queryRecord(url.searchParams);
      const query = options.querySchema ? parseOrThrow(options.querySchema, rawQuery) : rawQuery;

      let body: unknown;
      if (options.bodySchema) {
        assertJsonContentType(request);
        body = parseOrThrow(options.bodySchema, await parseJsonBody(request));
      }

      const response = await options.handler({
        request,
        requestId,
        body: body as TBodySchema extends ZodType ? ReturnType<TBodySchema['parse']> : undefined, // Parsed by the supplied schema above.
        query: query as TQuerySchema extends ZodType
          ? ReturnType<TQuerySchema['parse']>
          : Record<string, never>, // Parsed by the supplied schema above.
        params: params as TParamsSchema extends ZodType
          ? ReturnType<TParamsSchema['parse']>
          : RouteParams, // Parsed by the supplied schema above.
        context,
      });

      const result =
        response instanceof Response
          ? response
          : Response.json({ data: response }, { status: 200 });
      if (isTenantContext(context) && options.permission !== 'account:self' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase()) && result.status < 400) {
        const bodyFields = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body as Record<string, unknown>).filter((key) => !/token|password|email|phone/i.test(key)) : [];
        const entityId = typeof params === 'object' && params !== null && 'id' in params && typeof (params as { id?: unknown }).id === 'string' ? (params as { id: string }).id : `route:${options.id}`;
        try {
          await AuditLog.create([{ businessId: new Types.ObjectId(context.businessId), actorUserId: new Types.ObjectId(context.userId), actorRole: context.role, action: 'request.activity', entityType: options.path.split('/')[2] ?? 'request', entityId, metadata: { routeId: options.id, method: request.method.toUpperCase(), path: options.path, fieldNames: bodyFields, requestId } }]);
        } catch (error: unknown) {
          logger.error({ requestId, routeId: options.id, err: error }, 'request activity audit failed');
        }
      }
      logger.info(
        { requestId, routeId: options.id, method: request.method, statusCode: result.status, durationMs: Date.now() - startedAt },
        'request completed',
      );
      return addRequestId(result, requestId);
    } catch (error: unknown) {
      const statusCode = error instanceof AppError ? error.httpStatus : 500;
      if (statusCode >= 500) {
        logger.error({ requestId, routeId: options.id, err: error }, 'request failed');
      } else {
        logger.warn({ requestId, routeId: options.id, code: error instanceof AppError ? error.code : 'REQUEST_ERROR' }, 'request rejected');
      }
      return addRequestId(toErrorResponse(error, requestId), requestId);
    }
  };
}
