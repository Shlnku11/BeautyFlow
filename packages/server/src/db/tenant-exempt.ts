/** Global collections without businessId; each exemption has a documented reason. */
export const TENANT_EXEMPT_COLLECTIONS = new Set([
  'users', // Global human accounts.
  'sessions', // Session lookup begins from a secret cookie token.
  'businesses', // Tenant directory, reached by slug or session businessId.
  'rateLimits', // Global abuse-control counters.
  'schemaMigrations', // Database migration history.
]);

export function isTenantExemptCollection(collectionName: string): boolean {
  return TENANT_EXEMPT_COLLECTIONS.has(collectionName);
}
