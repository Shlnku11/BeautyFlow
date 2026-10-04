if (!process.env.NODE_ENV) Reflect.set(process.env, 'NODE_ENV', 'test');
process.env.APP_BASE_URL ??= 'http://localhost:3000';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/nextappointments_test?replicaSet=rs0';
process.env.MONGODB_DB_NAME ??= 'nextappointments_test';
process.env.TOKEN_PEPPER ??= 'unit-test-token-pepper-with-at-least-32-characters';
process.env.CRON_SECRET ??= 'unit-test-cron-secret-with-at-least-32-characters';
process.env.EMAIL_PROVIDER ??= 'console';
process.env.EMAIL_FROM_ADDRESS ??= 'test@example.test';
process.env.EMAIL_FROM_NAME ??= 'NextAppointments Test';
