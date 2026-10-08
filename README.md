# BeautyFlow

BeautyFlow — CRM для салонов красоты: онлайн-запись, расписание команды, клиенты, оплаты и уведомления.

## Стек

- Node.js 24 LTS, React + Vite SPA, React Router v7, Express 5 API и TypeScript strict.
- MongoDB 8.0 в режиме replica set `rs0`, Mongoose и миграции индексов.
- Tailwind CSS 3 с цветовыми, типографическими и поверхностными токенами из `DESIGN_SYSTEM.md`.

## Локальный запуск

1. Установите Node.js 24 и выполните `npm install`.
2. Скопируйте `.env.example` в `.env`; замените тестовые `TOKEN_PEPPER` и `CRON_SECRET` собственными случайными секретами длиной не менее 32 символов.
3. Убедитесь, что локальный replica set доступен на `localhost:27018`. В текущей рабочей среде используйте существующий контейнер `docs-master-architecture-md-1-3-mongo-1`; не запускайте второй Mongo, если порт 27018 уже занят. В новой среде, где порт свободен, можно создать локальную БД командой `docker compose up -d mongo`.
4. Примените индексы: `npm run migrate`.
5. Запустите приложение: `npm run dev`.

Для локального демо наполните базу командой `npm run seed` (работает только при `NODE_ENV=development`). Войти: `owner@demo.local` / `demo-password-123`; мастер: `master@demo.local` / `demo-password-123`. Публичная форма: `/b/demo-salon`.

В `.env.example` используется `directConnection=true`: это позволяет локальному приложению подключаться к replica set, имя узла которого внутри Docker-сети — `mongo`. Для контейнерного приложения используйте адрес MongoDB `mongo:27017` без `directConnection=true`.

Проверка доступности приложения и базы: `GET http://localhost:3000/api/health`.

## Команды

| Команда | Назначение |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Проверка TypeScript без генерации файлов |
| `npm test` | Unit/integration/API-тесты Vitest |
| `npm run test:unit` | Unit-тесты |
| `npm run test:integration` | Integration-тесты; требует MongoDB replica set |
| `npm run test:api` | API/security/route matrix-тесты |
| `npm run test:race` | Параллельные race-тесты |
| `npm run test:e2e` | Браузерные тесты Playwright |
| `npm run test:a11y` | axe, адаптивность и keyboard-only проверки |
| `npm run check:contrast` | Проверка контраста токенов и glass whitelist |
| `npm run migrate` | Идемпотентное создание коллекционных индексов |
| `npm run build` | Production-сборки Vite SPA и Express API |

## Настройка Google OAuth

Google — дополнительный способ входа и регистрации. Без credentials кнопка показывает «Вход через Google скоро появится», а вход по email и паролю и подтверждение email работают как обычно.

1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com/), откройте **APIs & Services → Credentials** и создайте **OAuth 2.0 Client ID** типа **Web application**.
2. Добавьте `http://localhost:5173` и URL production-приложения в **Authorized JavaScript origins**. Для redirect flow также укажите эти URL в **Authorized redirect URIs**.
3. Скопируйте Client ID и Client Secret в `.env` как `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`, перезапустите сервер. Секрет используется только сервером и не попадает в клиентскую сборку.
4. Разрешённые origin/redirect URI должны совпадать с адресами, на которых открывается приложение. Тесты проверяют OAuth с мокированным Google token verifier и не требуют настоящих credentials.

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

Production deployment runbook находится в [docs/DEPLOY.md](docs/DEPLOY.md). Он описывает целевое VPS-развёртывание; фактический production deploy должен быть проверен отдельно.
