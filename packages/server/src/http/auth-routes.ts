import type { Express } from 'express';
import { AuthService } from '../services/auth-service';
import { AcceptInviteSchema, EmptyBodySchema, LoginSchema, RegisterBusinessSchema } from '@/shared/schemas';
import { getEnv } from '../config/env';
import { defineExpressRoute } from './define-express-route';
import { AppError } from './errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { noContent } from './responses';
import { removeCurrentSession } from '../auth/route-runtime';

const authService = new AuthService();
export const IMPLEMENTED_AUTH_ROUTE_IDS = new Set(['AUTH-01','AUTH-02','AUTH-03','AUTH-04','AUTH-06']);

export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth/accept-invite', defineExpressRoute({
    id: 'AUTH-06', method: 'POST', path: '/api/auth/accept-invite', auth: 'none', contextSource: 'NONE', bodySchema: AcceptInviteSchema, rateLimit: 'RL-RESET',
    handler: async ({ body, request }) => {
      const result = await authService.acceptInvite(body, request);
      return Response.json({ data: result.data }, { headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/register-business', defineExpressRoute({
    id: 'AUTH-01', method: 'POST', path: '/api/auth/register-business', auth: 'none', contextSource: 'NONE', bodySchema: RegisterBusinessSchema, rateLimit: 'RL-REGISTER',
    handler: async ({ body, request }) => {
      if (body.website !== '') throw new AppError(ERROR_CODES.VALIDATION_ERROR, 422, 'Проверьте корректность введённых данных');
      const result = await authService.registerBusiness(body, request);
      return Response.json({ data: result.data }, { status: 201, headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/login', defineExpressRoute({
    id: 'AUTH-02', method: 'POST', path: '/api/auth/login', auth: 'none', contextSource: 'NONE', bodySchema: LoginSchema, rateLimit: 'RL-LOGIN',
    handler: async ({ body, request }) => {
      const result = await authService.login(body.email, body.password, request);
      return Response.json({ data: result.data }, { headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/logout', defineExpressRoute({
    id: 'AUTH-03', method: 'POST', path: '/api/auth/logout', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: EmptyBodySchema, rateLimit: 'RL-API',
    handler: async ({ request, requestId }) => {
      await removeCurrentSession(request);
      return noContent(requestId, { 'Set-Cookie': `${getEnv().SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${getEnv().NODE_ENV === 'production' ? '; Secure' : ''}` });
    },
  }));
  app.get('/api/auth/me', defineExpressRoute({
    id: 'AUTH-04', method: 'GET', path: '/api/auth/me', auth: 'session', permission: 'account:self', contextSource: 'SESSION', rateLimit: 'RL-API',
    handler: async ({ context }) => {
      if (!context || !('userId' in context)) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Требуется вход в систему');
      const data = await authService.getCurrentUser(context.userId, context.businessId, context.role, context.staffId);
      return Response.json({ data });
    },
  }));
}
