import type { z } from 'zod';
import type { TenantContext } from '@/shared/types/tenant-context';
import { CreateCustomerSchema, CustomerAppointmentsQuerySchema } from '@/shared/schemas/customers';
import { ERROR_CODES } from '@/shared/error-codes';
import { AppError, NotFoundError } from '../http/errors';
import { normalizePhone } from '../domain/phone';
import { CustomerRepository } from '../repositories/customer-repository';
import { assertPermission } from '../domain/permissions';

const repository = new CustomerRepository();
type CustomerInput = z.infer<typeof CreateCustomerSchema>;
type CustomerAppointmentsQuery = z.infer<typeof CustomerAppointmentsQuerySchema>;
type CustomerPatch = { [Key in keyof CustomerInput]?: CustomerInput[Key] | undefined };

function searchTokens(firstName: string, lastName: string | undefined, phoneNormalized: string): string[] {
  return [...new Set([...`${firstName} ${lastName ?? ''}`.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean), phoneNormalized.replace(/\D/g, '')])];
}

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function toIsoDate(value: unknown): string | undefined {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function toDto(value: Record<string, unknown>) {
  const { _id, firstName, lastName, phone, email, contacts, notes, source, createdAt } = value;
  const createdAtIso = toIsoDate(createdAt);
  return { id: String(_id), firstName, ...(typeof lastName === 'string' ? { lastName } : {}), phone, ...(typeof email === 'string' ? { email } : {}), ...(Array.isArray(contacts) ? { contacts } : {}), ...(typeof notes === 'string' ? { notes } : {}), source, ...(createdAtIso ? { createdAt: createdAtIso } : {}) };
}

export class CustomerService {
  list(ctx: TenantContext, query: Parameters<CustomerRepository['list']>[1]) {
    return repository.list(ctx, query);
  }

  async get(ctx: TenantContext, id: string) {
    const customer = await repository.findById(ctx, id);
    if (!customer) throw new NotFoundError();
    if (ctx.role === 'master') {
      if (!ctx.staffId || !(await repository.hasCustomerAppointmentsForStaff(ctx, id, ctx.staffId))) throw new NotFoundError();
      const seesPhone = await repository.masterPhoneVisibility(ctx);
      return { customer: { id: customer._id.toString(), firstName: customer.firstName, ...(customer.lastName ? { lastName: customer.lastName } : {}), ...(seesPhone ? { phone: customer.phone } : {}) } };
    }
    const summary = await repository.customerSummary(ctx, id);
    if (!summary.currency) throw new NotFoundError();
    return { customer: toDto(customer as unknown as Record<string, unknown>), summary };
  }

  async appointments(ctx: TenantContext, id: string, query: CustomerAppointmentsQuery) {
    assertPermission(ctx.role, 'appointments:read');
    const customer = await repository.findById(ctx, id);
    if (!customer) throw new NotFoundError();
    if (ctx.role === 'master' && (!ctx.staffId || !(await repository.hasCustomerAppointmentsForStaff(ctx, id, ctx.staffId)))) throw new NotFoundError();
    const result = await repository.appointments(ctx, customer, query);
    return { data: result.data, meta: { page: query.page, limit: query.limit, total: result.total } };
  }

  async create(ctx: TenantContext, input: CustomerInput) {
    const business = await repository.businessCountry(ctx);
    if (!business) throw new NotFoundError();
    const phoneNormalized = normalizePhone(input.phone, business.countryCode);
    const data: Record<string, unknown> = { firstName: input.firstName, phone: input.phone, phoneNormalized, searchTokens: searchTokens(input.firstName, input.lastName, phoneNormalized) };
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.email !== undefined) { data.email = input.email; data.emailNormalized = input.email.toLocaleLowerCase('en'); }
    if (input.contacts !== undefined) data.contacts = input.contacts;
    if (input.notes !== undefined) data.notes = input.notes;
    try {
      const customer = await repository.create(ctx, data);
      return toDto(customer as unknown as Record<string, unknown>);
    } catch (error: unknown) {
      if (!isDuplicate(error)) throw error;
      const existing = await repository.findByPhone(ctx, phoneNormalized);
      throw new AppError(ERROR_CODES.CUSTOMER_PHONE_EXISTS, 409, 'Клиент с таким телефоном уже существует', existing ? [{ existingCustomerId: existing._id.toString() }] : []);
    }
  }

  async update(ctx: TenantContext, id: string, patch: CustomerPatch) {
    const data: Record<string, unknown> = { ...patch };
    if (patch.phone !== undefined) {
      const business = await repository.businessCountry(ctx);
      if (!business) throw new NotFoundError();
      const phoneNormalized = normalizePhone(patch.phone, business.countryCode);
      data.phoneNormalized = phoneNormalized;
      data.searchTokens = searchTokens(patch.firstName ?? '', patch.lastName, phoneNormalized);
    }
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      const current = await repository.findById(ctx, id);
      if (!current) throw new NotFoundError();
      const phoneNormalized = typeof data.phoneNormalized === 'string' ? data.phoneNormalized : current.phoneNormalized;
      data.searchTokens = searchTokens(patch.firstName ?? current.firstName, patch.lastName ?? current.lastName, phoneNormalized);
    }
    if (patch.email !== undefined) data.emailNormalized = patch.email.toLocaleLowerCase('en');
    const updated = await repository.update(ctx, id, data);
    if (!updated) throw new NotFoundError();
    return toDto(updated as unknown as Record<string, unknown>);
  }
}
