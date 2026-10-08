import type { Express } from 'express';
import { AuthService } from '../services/auth-service';
import { AcceptInviteSchema, ChangePasswordSchema, EmailSchema, EmptyBodySchema, GoogleLoginSchema, GoogleRegisterBusinessSchema, LoginSchema, LoginVerificationResendSchema, LoginVerificationSchema, RegisterBusinessSchema, ResetPasswordSchema, VerifyEmailSchema } from '@/shared/schemas';
import { getEnv } from '../config/env';
import { defineExpressRoute } from './define-express-route';
import { AppError } from './errors';
import { ERROR_CODES } from '@/shared/error-codes';
import { noContent } from './responses';
import { removeCurrentSession } from '../auth/route-runtime';

const authService = new AuthService();
export const IMPLEMENTED_AUTH_ROUTE_IDS = new Set(['AUTH-01','AUTH-02','AUTH-03','AUTH-04','AUTH-06','AUTH-07','AUTH-08','AUTH-09','AUTH-11','AUTH-12','AUTH-16','AUTH-17']);
export const OPTIONAL_AUTH_ROUTE_IDS = new Set(['AUTH-13','AUTH-14','AUTH-15']);

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/google/config', defineExpressRoute({
    id: 'AUTH-14', method: 'GET', path: '/api/auth/google/config', auth: 'none', contextSource: 'NONE',
    handler: async () => Response.json({ data: authService.googleOAuthConfig() }),
  }));
  app.post('/api/auth/google', defineExpressRoute({
    id: 'AUTH-13', method: 'POST', path: '/api/auth/google', auth: 'none', contextSource: 'NONE', bodySchema: GoogleLoginSchema, rateLimit: 'RL-LOGIN',
    handler: async ({ body, request }) => {
      const result = await authService.loginWithGoogle(body.idToken, request);
      return Response.json({ data: result.data }, { headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/google/register-business', defineExpressRoute({
    id: 'AUTH-15', method: 'POST', path: '/api/auth/google/register-business', auth: 'none', contextSource: 'NONE', bodySchema: GoogleRegisterBusinessSchema, rateLimit: 'RL-REGISTER',
    handler: async ({ body, request }) => {
      const result = await authService.registerBusinessWithGoogle(body, request);
      return Response.json({ data: result.data }, { status: 201, headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/verify-email', defineExpressRoute({
    id: 'AUTH-11', method: 'POST', path: '/api/auth/verify-email', auth: 'none', contextSource: 'NONE', bodySchema: VerifyEmailSchema, rateLimit: 'RL-RESET',
    handler: async ({ body }) => {
      await authService.verifyEmail(body.email, body.code);
      return Response.json({ data: { emailVerified: true } });
    },
  }));
  app.post('/api/auth/resend-verification', defineExpressRoute({
    id: 'AUTH-12', method: 'POST', path: '/api/auth/resend-verification', auth: 'none', contextSource: 'NONE', bodySchema: EmailSchema, rateLimit: 'RL-RESET',
    handler: async ({ body }) => {
      await authService.resendEmailVerification(body.email);
      return Response.json({ data: { message: 'Если аккаунт требует подтверждения, мы отправили письмо' } }, { status: 202 });
    },
  }));
  app.post('/api/auth/forgot-password', defineExpressRoute({
    id: 'AUTH-07', method: 'POST', path: '/api/auth/forgot-password', auth: 'none', contextSource: 'NONE', bodySchema: EmailSchema, rateLimit: 'RL-RESET',
    handler: async ({ body }) => {
      await authService.requestPasswordReset(body.email);
      return Response.json({ data: { message: 'Если аккаунт существует, мы отправили письмо' } }, { status: 202 });
    },
  }));
  app.post('/api/auth/reset-password', defineExpressRoute({
    id: 'AUTH-08', method: 'POST', path: '/api/auth/reset-password', auth: 'none', contextSource: 'NONE', bodySchema: ResetPasswordSchema, rateLimit: 'RL-RESET',
    handler: async ({ body }) => {
      await authService.resetPassword(body.token, body.password);
      return Response.json({ data: { message: 'Пароль обновлён' } });
    },
  }));
  app.post('/api/auth/change-password', defineExpressRoute({
    id: 'AUTH-09', method: 'POST', path: '/api/auth/change-password', auth: 'session', permission: 'account:self', contextSource: 'SESSION', bodySchema: ChangePasswordSchema, rateLimit: 'RL-API',
    handler: async ({ body, context, request, requestId }) => {
      if (!context || !('userId' in context)) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 401, 'Требуется вход в систему');
      await authService.changePassword(context.userId, context.businessId, request, body.currentPassword, body.newPassword);
      return noContent(requestId);
    },
  }));
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
    handler: async ({ body }) => {
      const result = await authService.login(body.email, body.password);
      return Response.json({ data: result.data });
    },
  }));
  app.post('/api/auth/login/verify', defineExpressRoute({
    id: 'AUTH-16', method: 'POST', path: '/api/auth/login/verify', auth: 'none', contextSource: 'NONE', bodySchema: LoginVerificationSchema,
    ...(getEnv().NODE_ENV === 'development' ? {} : { rateLimit: 'RL-RESET' as const }),
    handler: async ({ body, request }) => {
      const result = await authService.verifyLogin(body.loginToken, body.code, request);
      return Response.json({ data: result.data }, { headers: { 'Set-Cookie': result.cookie } });
    },
  }));
  app.post('/api/auth/login/resend', defineExpressRoute({
    id: 'AUTH-17', method: 'POST', path: '/api/auth/login/resend', auth: 'none', contextSource: 'NONE', bodySchema: LoginVerificationResendSchema, rateLimit: 'RL-RESET',
    handler: async ({ body }) => Response.json({ data: await authService.resendLoginVerification(body.loginToken) }),
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
