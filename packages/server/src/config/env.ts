import { z } from 'zod';

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.url().optional());
const optionalPort = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().min(1).max(65_535).optional(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_BASE_URL: z.url(),
    MONGODB_URI: z.url().refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), {
      message: 'Ожидается MongoDB connection string',
    }),
    MONGODB_DB_NAME: z.string().min(1),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(20),
    SESSION_COOKIE_NAME: z.string().min(1).default('na_sid'),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
    SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().int().positive().default(90),
    TOKEN_PEPPER: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    EMAIL_PROVIDER: z.enum(['smtp', 'console']).default('console'),
    EMAIL_FROM_ADDRESS: z.email(),
    EMAIL_FROM_NAME: z.string().min(1),
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_SECURE: z
      .preprocess(blankToUndefined, z.enum(['true', 'false']).optional())
      .transform((value) => value === 'true'),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    WORKER_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
    WORKER_BATCH_LIMIT: z.coerce.number().int().min(1).max(500).default(50),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    APP_DEFAULT_COUNTRY_CODE: z.enum(['RU', 'KZ', 'KG', 'US', 'OTHER']).default('RU'),
    SMS_PROVIDER: optionalString,
    PUSH_PROVIDER: optionalString,
    TEST_MONGODB_URI: optionalUrl,
  })
  .superRefine((env, context) => {
    if (env.EMAIL_PROVIDER === 'console' && env.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        message: 'EMAIL_PROVIDER=console запрещён в production',
        path: ['EMAIL_PROVIDER'],
      });
    }

    if (env.EMAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            message: `${key} обязателен при EMAIL_PROVIDER=smtp`,
            path: [key],
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | undefined;

export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }
  return result.data;
}

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  cachedEnv = parseEnv(process.env);
  return cachedEnv;
}
