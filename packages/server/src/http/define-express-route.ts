import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { defineRoute, type DefineRouteOptions, type RouteParams } from './define-route';

export function defineExpressRoute<
  TBodySchema extends ZodType = ZodType<undefined>,
  TQuerySchema extends ZodType = ZodType<Record<string, never>>,
  TParamsSchema extends ZodType = ZodType<RouteParams>,
>(options: DefineRouteOptions<TBodySchema, TQuerySchema, TParamsSchema>): RequestHandler {
  const pipeline = defineRoute(options);

  return async (req, res, next) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(', '));
      }
      headers.set('x-client-ip', req.ip ?? 'unknown');
      const host = req.get('host') ?? 'localhost';
      const request = new Request(`${req.protocol}://${host}${req.originalUrl}`, {
        method: req.method,
        headers,
        ...(!['GET', 'HEAD'].includes(req.method.toUpperCase())
          ? { body: JSON.stringify(req.body ?? {}) }
          : {}),
      });
      const routeParams: RouteParams = Object.fromEntries(
        Object.entries(req.params).flatMap(([key, value]) =>
          typeof value === 'string' ? [[key, value]] : [],
        ),
      );
      const response = await pipeline(request, { params: routeParams });
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error: unknown) {
      next(error);
    }
  };
}
