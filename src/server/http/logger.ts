import pino from 'pino';

import { getEnv } from '@/server/config/env';

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'tokenHash',
      'manageTokenHash',
      'inviteTokenHash',
      'passwordResetTokenHash',
      'headers.cookie',
      'headers.authorization',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  base: null,
});
