import type { Express } from 'express';
import { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { MemberListQuerySchema, MemberStatusSchema } from '@/shared/schemas/members';
import { defineExpressRoute } from './define-express-route';
import { MemberService } from '../services/member-service';

const service = new MemberService();
const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const IMPLEMENTED_MEMBER_ROUTE_IDS = new Set(['MEM-01', 'MEM-03', 'MEM-04']);

export function registerMemberRoutes(app: Express): void {
  app.get('/api/members', defineExpressRoute({
    id: 'MEM-01', method: 'GET', path: '/api/members', auth: 'session', permission: 'members:read', contextSource: 'SESSION', querySchema: MemberListQuerySchema,
    handler: async ({ context, query }) => {
      const result = await service.list(context as TenantContext, query);
      return Response.json({ data: result.data, meta: result.meta });
    },
  }));
  app.patch('/api/members/:id', defineExpressRoute({
    id: 'MEM-03', method: 'PATCH', path: '/api/members/:id', auth: 'session', permission: 'members:manage_role', contextSource: 'SESSION', paramsSchema: idParams, bodySchema: MemberStatusSchema,
    handler: ({ context, params, body }) => service.updateStatus(context as TenantContext, params.id, body),
  }));
  app.post('/api/members/:id/resend-invite', defineExpressRoute({
    id: 'MEM-04', method: 'POST', path: '/api/members/:id/resend-invite', auth: 'session', permission: 'members:invite', contextSource: 'SESSION', paramsSchema: idParams,
    handler: async ({ context, params }) => Response.json({ data: await service.resendInvite(context as TenantContext, params.id) }, { status: 202 }),
  }));
}
