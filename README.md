# NextAppointments

CRM для салонов красоты: онлайн-запись, расписание команды, клиенты, оплаты и уведомления.

## Стек

- Node.js 24 LTS, React + Vite SPA, React Router v7, Express 5 API и TypeScript strict.
- MongoDB 8.0 в режиме replica set `rs0`, Mongoose и миграции индексов.
- Tailwind CSS 3 с цветовыми, типографическими и поверхностными токенами из `DESIGN_SYSTEM.md`.

## Локальный запуск

1. Установите Node.js 24 и выполните `npm install`.
2. Скопируйте `.env.example` в `.env`; замените тестовые `TOKEN_PEPPER` и `CRON_SECRET` собственными случайными секретами длиной не менее 32 символов.
3. Запустите локальный replica set MongoDB: `docker compose up -d mongo`.
4. Примените индексы: `npm run migrate`.
5. Запустите приложение: `npm run dev`.

В `.env.example` используется `directConnection=true`: это позволяет локальному приложению подключаться к replica set, имя узла которого внутри Docker-сети — `mongo`. Для контейнерного приложения используйте адрес MongoDB `mongo:27017` без `directConnection=true`.

Проверка доступности приложения и базы: `GET http://localhost:3000/api/health`.

## Команды

| Команда | Назначение |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Проверка TypeScript без генерации файлов |
| `npm test` | Unit/integration/API-тесты Vitest |
| `npm run test:e2e` | Браузерные тесты Playwright |
| `npm run migrate` | Идемпотентное создание коллекционных индексов |
| `npm run build` | Production-сборки Vite SPA и Express API |

Тесты интеграции и API требуют MongoDB replica set. `TEST_MONGODB_URI` можно указать для отдельной тестовой базы.

## Подготовка production deployment

Текущий `docker-compose.yml` предназначен только для локальной MongoDB: он не включает API, worker, reverse proxy или TLS. Production deployment в этой репозитории не развёрнут и не проверен.

Перед выпуском подготовьте MongoDB 8 replica set с включённой аутентификацией, TLS на внешнем соединении и закрытым сетевым доступом. Создайте отдельные учётные записи приложения и миграций; у роли приложения должны быть только нужные права, а коллекция `transactions` должна запрещать update/delete. Проверьте восстановление резервной копии на отдельном экземпляре.

Соберите приложение командой `npm ci && npm run build`. Запустите API через `npm run start` (порт 3000), а worker отдельным процессом через `npm run worker`. Раздавайте `dist/client` как статические файлы за reverse proxy; проксируйте `/api/*` на API и включите HTTPS. Установите точное число доверенных proxy hops в `TRUSTED_PROXY_HOPS`, чтобы корректно работали secure cookies и rate limiting.

Настройте production environment вне репозитория: `NODE_ENV=production`, публичный `APP_BASE_URL`, replica-set `MONGODB_URI`, имя БД, уникальные `TOKEN_PEPPER` и `CRON_SECRET` (не менее 32 символов), и SMTP параметры с `EMAIL_PROVIDER=smtp`. Не используйте `EMAIL_PROVIDER=console` в production. Запускайте `npm run migrate` как отдельный release шаг до запуска API/worker. Планировщик может вызывать `POST /api/internal/jobs/notifications/run` с `CRON_SECRET`; при этом отдельный worker обычно предпочтительнее. Настройте мониторинг `/api/health`, задержки/ошибки worker, SMTP, диска и БД.

Эти шаги описывают целевую схему, но не заменяют фактический staging deploy, TLS-проверку, проверку восстановления backup и эксплуатационное подтверждение мониторинга.

## Структура

- `packages/client/` — Vite, React Router, UI, хуки и клиентские утилиты.
- `packages/server/` — Express API, Mongoose, auth, domain, services и repositories.
- `packages/shared/` — общие Zod-схемы, типы, DTO, константы и error codes.
- `packages/server/migrations/`, `packages/server/scripts/`, `tests/` — миграции, worker и тесты.
- `docs/` — спецификации; контракты находятся в `DATA_MODEL_MONGODB.md`, `API_CONTRACTS.md` и `PERMISSIONS_MATRIX.md`.

См. архитектуру в `docs/MASTER_ARCHITECTURE.md`; проектные решения и объём MVP — в остальных документах `docs/`.
