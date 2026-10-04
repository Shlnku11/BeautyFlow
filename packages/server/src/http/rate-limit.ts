import { AppError, RateLimitError } from '@/server/http/errors';
import { ERROR_CODES } from '@/shared/error-codes';

export type RateLimitPolicy =
  | 'RL-LOGIN'
  | 'RL-REGISTER'
  | 'RL-RESET'
  | 'RL-PUBLIC-READ'
  | 'RL-PUBLIC-BOOK'
  | 'RL-MANAGE'
  | 'RL-API'
  | 'RL-JOB';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export type RateLimitAdapter = (
  request: Request,
  policy: RateLimitPolicy,
) => Promise<RateLimitResult>;

let adapter: RateLimitAdapter | undefined;

/** Connect the persistent rateLimits repository when it is available. */
export function configureRateLimitAdapter(nextAdapter: RateLimitAdapter): void {
  adapter = nextAdapter;
}

export async function enforceRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): Promise<void> {
  if (!adapter) {
    throw new AppError(ERROR_CODES.INTERNAL, 500, 'Внутренняя ошибка сервера');
  }

  const result = await adapter(request, policy);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds ?? 60);
}
