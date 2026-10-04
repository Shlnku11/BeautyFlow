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

## Структура

- `packages/client/` — Vite, React Router, UI, хуки и клиентские утилиты.
- `packages/server/` — Express API, Mongoose, auth, domain, services и repositories.
- `packages/shared/` — общие Zod-схемы, типы, DTO, константы и error codes.
- `packages/server/migrations/`, `packages/server/scripts/`, `tests/` — миграции, worker и тесты.
- `docs/` — спецификации; контракты находятся в `DATA_MODEL_MONGODB.md`, `API_CONTRACTS.md` и `PERMISSIONS_MATRIX.md`.

См. архитектуру в `docs/MASTER_ARCHITECTURE.md`; проектные решения и объём MVP — в остальных документах `docs/`.
