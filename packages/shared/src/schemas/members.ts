import { z } from 'zod';
export const MemberListQuerySchema = z.object({ status: z.enum(['invited','active','disabled']).optional(), role: z.enum(['owner','admin','master']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const InviteMemberSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), role: z.enum(['admin','master']), staffId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();
export const MemberStatusSchema = z.object({ status: z.enum(['active','disabled']) }).strict();
