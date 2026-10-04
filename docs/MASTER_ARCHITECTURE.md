# MASTER_ARCHITECTURE.md — Главная архитектура SaaS CRM

Входные документы: PROJECT_AUDIT.md, MIGRATION_PLAN.md (технологические части заменены, см. ADR-000), ТЗ владельца. Связанные документы: PRODUCT_SPEC, DATA_MODEL_MONGODB, API_CONTRACTS, PERMISSIONS_MATRIX, BOOKING_ENGINE_SPEC, PAYMENTS_SPEC, NOTIFICATIONS_SPEC, DASHBOARD_SPEC, DESIGN_SYSTEM, UI_UX_SPEC, CODING_STANDARDS, TESTING_STRATEGY, DEEPSEEK_HANDOFF_RULES, ARCHITECTURE_DECISIONS.

Статус: проект на момент документа — UI-прототип без backend (PROJECT_AUDIT). Всё ниже — целевая архитектура; код этапа 1 создан, см. `src/`. <!-- CHANGED: after stage 1 -->

## 1. Принципы

1. Monorepo: React SPA на Vite и отдельный Express 5 API на Node.js.
2. Данные — MongoDB + Mongoose (replica set для транзакций).
3. Изоляция бизнесов обязательна на каждом слое (§9).
4. Единые контракты (DATA_MODEL, API_CONTRACTS, PERMISSIONS) — первичны, код им следует.
5. Бизнес-правила — в чистом домене (`src/server/domain`), I/O — в сервисах/репозиториях.
6. Reference-проект (PHP) не используется в runtime и не копируется (ADR-012).
7. UI — только через API (ADR-014); mock-данных в завершённых функциях нет.
8. Простое надёжное решение предпочтительнее сложного; компромиссы фиксируются (ADR).

## 2. Текстовая схема архитектуры

```
packages/client (Vite SPA, React Router v7) → /api/** → packages/server (Express 5)
  defineExpressRoute → requestId → rate limit → CSRF → session → TenantContext
  → RBAC → Zod(strict) → handler → Service → Repository(ctx) → Mongoose → MongoDB rs0
                                   коллекции: users, sessions, businesses, businessMembers,
                                   staff, staffSchedules, staffExceptions, blockedPeriods,
                                   services, staffServices, customers, appointments,
                                   payments, transactions, notifications, settings,
                                   auditLogs, rateLimits, schemaMigrations
 Worker (scripts/worker.ts ИЛИ POST /api/internal/jobs/notifications/run + CRON_SECRET)
   claim notifications ─► NotificationService ─► EmailProvider (smtp|console) / Sms,Push adapters
```

## 3. Структура репозитория (целевая)

```
NextAppointments/
├─ docs/                       спецификации и план разработки
├─ packages/
│  ├─ client/                  Vite SPA, React Router v7, UI, экраны, хуки
│  ├─ server/                  Express API, auth, db, repositories, services, domain
│  └─ shared/                  Zod, DTO, error-codes, constants
├─ migrations/                 NNN_name.ts — индексы и преобразования данных (000_init.ts — все индексы DATA_MODEL; ADR-015)
├─ scripts/                    worker.ts, migrate.ts, seed.ts (dev, на фикстурах), check-contrast.ts, check-docs.ts
├─ packages/client/src/        routes, components, hooks, lib, styles
├─ packages/server/src/        config, db/models, repositories, services, domain, auth, http, jobs
├─ packages/shared/src/        schemas, types, error-codes, constants, i18n
├─ tests/                      unit/, integration/, api/, e2e/, fixtures/ (builders.ts, world-ab.ts, clock.ts)
├─ docker-compose.yml  Dockerfile  .env.example  .nvmrc  PROGRESS.md  NOTICE  LICENSE(решение)
<!-- CHANGED: A4 — перечислены scripts/, migrations/, tests/fixtures/, src/components/ui/, src/lib/api-client.ts, src/hooks/ -->
```
React Router defines client routes; the server exposes API endpoints under `/api/**` only.

## 4. Frontend

Vite + React SPA, React Router v7, TanStack Query, react-hook-form + Zod; Tailwind использует DESIGN_SYSTEM tokens. Общий api-client разбирает API envelopes, ошибки и idempotency. Серверное состояние — Query cache; персональные данные не хранятся в localStorage. Клиентские route guards служат только UX; сервер проверяет AUTH-04 permissions. i18n — словарь `ru.ts` (ADR-013).

## 5. Backend: Express 5

Каждый маршрут — `defineExpressRoute({ id, method, path, auth, permission, contextSource, schemas, rateLimit, handler })`. Pipeline (§2): requestId → rate limit → CSRF/origin (мутации) → сессия → членство → `TenantContext` → RBAC → Zod → handler → единый конверт ответа/ошибки. Реестр используется contract-тестами. Публичные маршруты используют `PublicContext`; `/api/internal/jobs/*` — CRON-аутентификация.

## 6. Сервисный слой и репозитории

Сервисы: `AuthService, MemberService, StaffService, ScheduleService, ServiceCatalogService, CustomerService, BookingService, AppointmentService, CalendarService, PaymentService, NotificationService, DashboardService, SettingsService, AuditService`. Репозитории — по коллекции. Правила — CODING_STANDARDS §4–§5: `ctx` первым параметром, `businessId` подмешивается репозиторием, DTO-мапперы на выходе, транзакции через `withTransaction`. Домен (`booking-engine`, `permissions`, `transitions`, `money`, `time`) — чистые функции без I/O.

## 7. Mongoose-модели и коллекции

19 коллекций (17 из ТЗ + технические `rateLimits`, `schemaMigrations`): полное описание полей, индексов, TTL, soft delete — DATA_MODEL_MONGODB.md. Общие механизмы: `tenantPlugin`, soft-delete фильтр, `optimisticConcurrency` где указано, запрет изменения `transactions` (`ImmutableDocumentError`), `strict: 'throw'`, `autoIndex: false`.

## 8. Validation

Zod на границах: тело/query/params/env. Схемы в `src/shared/schemas` (общие для форм и API), `.strict()`; нормализация (trim, lowercase email, E.164 телефон); ограничения длины/диапазонов — из DATA_MODEL. Неизвестные поля (в т.ч. `businessId`) → `422`. Бизнес-инварианты (пересечение интервалов расписания, кратность 5 минут) — в `domain` и дублируются индексами БД там, где возможно.

## 9. Multi-tenancy

**Контекст бизнеса определяется только сервером:**
- аутентифицированные маршруты: `session.businessId` + активное членство → `TenantContext{userId, businessId, role, staffId?}`;
- публичные: slug → активный бизнес, либо токен управления → запись → её бизнес;
- воркер: `notification.businessId`.
**Четыре слоя защиты** (ADR-004): (1) `ctx` — обязательный параметр репозиториев; (2) `tenantPlugin` отвергает запросы без `businessId`; (3) сервисы проверяют все ссылки загрузкой в том же бизнесе; (4) тесты A/B по реестру маршрутов (TESTING_STRATEGY §4).
**Поведение:** объект другого бизнеса → `404`; клиент и любая сущность независимы между бизнесами; публичный контур не раскрывает существование неактивных бизнесов; `businessId` из клиента не принимается нигде (единственное будущее исключение — `AUTH-05`, post-MVP, и только из собственных членств). <!-- CHANGED: A2b -->
**MVP: один бизнес на пользователя** (`unique {userId}` в `businessMembers`; переключение бизнесов — post-MVP). <!-- CHANGED: A4 -->
**Ограничение MongoDB:** нет FK/RLS — поэтому п.1–4 обязательны и проверяются тестами; для выхода на крупных клиентов возможен вариант «БД на бизнес» (не в MVP).

## 10. Auth и sessions

Регистрация создаёт `users + businesses + settings + businessMembers(owner) + sessions` в транзакции. Вход — email+пароль (argon2id), сессия — cookie с токеном, в БД хэш. В MVP один пользователь — один бизнес (одно членство в `businessMembers`; модель допускает несколько, переключение `AUTH-05` — post-MVP). <!-- CHANGED: A4 --> Приглашения и сброс пароля — одноразовые токены (хэш в БД, TTL). Подробности — API_CONTRACTS §2, ADR-003. Rate limiting — `rateLimits` (политики `RL-*`).

## 11. HTTP middleware

Express middleware задаёт requestId и security headers. Session, tenant, RBAC и CSRF проверяются в pipeline `defineExpressRoute`. React Router guards выполняют только UX-переходы и не авторизуют API-запросы.

## 12. RBAC

Роли `owner/admin/master`, ключи прав и область (`all/own/limited`) — PERMISSIONS_MATRIX. `domain/permissions.ts` — единственная таблица; `PermissionService.assert(ctx, key, resource?)`; `own` реализуется фильтром репозитория. Каждый маршрут объявляет ключ; маршрут без ключа не проходит contract-тест. Статус членства проверяется на каждый запрос (отключение действует мгновенно).

## 13. Error handling

Единая иерархия `AppError` (CODING_STANDARDS §8): коды и HTTP-статусы — API_CONTRACTS §0. Сервисы бросают типизированные ошибки; единый обработчик формирует `{error:{code,message,details,requestId}}`; необработанные → `500 INTERNAL` без деталей, полный лог с `requestId`. Транзакционные и `E11000` ошибки Mongo маппятся в доменные (`SLOT_UNAVAILABLE`, `*_EXISTS`). Побочные эффекты (письма) не должны ронять бизнес-операции: они асинхронны через очередь.

## 14. Jobs/cron и email

Очередь — `notifications`; воркер `runNotificationBatch` (claim → render → provider → статус) запускается процессом `scripts/worker.ts` (рекомендуется) или HTTP-эндпоинтом `SYS-02` для внешнего cron. Провайдеры: `EmailProvider` (`smtp` через nodemailer, `console` для dev/test), адаптеры `SmsProvider`/`PushProvider` (интерфейсы, `skipped` пока не подключены). Подробности — NOTIFICATIONS_SPEC, ADR-010.

## 15. Переменные окружения (`.env.example`; значения секретов — только в окружении)

| Переменная | Назначение | Обяз. |
|---|---|---|
| `NODE_ENV` | `development|test|production` | да |
| `APP_BASE_URL` | публичный URL (ссылки в письмах, CSRF-origin) | да |
| `MONGODB_URI` | строка подключения (replica set) | да |
| `MONGODB_DB_NAME` | имя БД | да |
| `MONGODB_MAX_POOL_SIZE` | пул (по умолчанию 20) | нет |
| `SESSION_COOKIE_NAME` | по умолчанию `na_sid` | нет |
| `SESSION_TTL_DAYS` | скользящий срок (14) | нет |
| `SESSION_ABSOLUTE_TTL_DAYS` | жёсткий срок (90) | нет |
| `TOKEN_PEPPER` | секрет HMAC токенов (≥32 симв.) | да |
| `CRON_SECRET` | секрет для `SYS-02` (≥32 симв.) | да |
| `EMAIL_PROVIDER` | `smtp|console` (console запрещён в production) | да |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | отправитель | да |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP (при `smtp`) | усл. |
| `WORKER_POLL_INTERVAL_SECONDS`, `WORKER_BATCH_LIMIT` | воркер (30 / 50) | нет |
| `TRUSTED_PROXY_HOPS` | число доверенных прокси для определения IP | нет |
| `LOG_LEVEL` | `debug|info|warn|error` | нет |
| `APP_DEFAULT_COUNTRY_CODE` | `RU|KZ|KG|US|OTHER` — запасное значение страны при регистрации, если регион браузера (Intl) не определён <!-- CHANGED: A4 --> | нет |
| `SMS_PROVIDER`, `PUSH_PROVIDER` | зарезервировано, не используется в MVP | нет |
| `TEST_MONGODB_URI` | необязательно: внешний replica set для тестов | нет |
Правила: чтение только в `packages/server/src/config/env.ts` (Zod), неверная конфигурация → отказ старта; клиенту доступны только публичные `VITE_*` (секретов нет); секреты не попадают в код/логи/архивы; `.env*` в `.gitignore`.

## 16. Зависимости (к установке только с разрешением, Этап 1+)

**Версии (решено владельцем):** Node.js **24 LTS**, MongoDB **8.0** (replica set `rs0`), Vite + React + Express 5 + React Router v7 (ADR-002). <!-- CHANGED: A4 -->
Рантайм: `express`, `mongoose`, `zod`, `luxon`, `@node-rs/argon2` (или `bcryptjs`), `nodemailer`, `libphonenumber-js`, `@tanstack/react-query`, `react-router`, `recharts`, `react-hook-form`, `tailwindcss`, `heroicons`, логгер (`pino` или аналог).
Dev/test: `vitest`, `mongodb-memory-server`, `@playwright/test`, `@axe-core/playwright`, `prettier` + `prettier-plugin-tailwindcss`, ESLint-плагины (`jsx-a11y`, `import`, `@typescript-eslint`), `@types/*`.
Удалить: неиспользуемый `axios`; Next.js не входит в целевой стек.

## 17. Docker (локально)

`docker-compose.yml`: сервис `mongo` (образ `mongo:8.0`, команда с `--replSet rs0 --bind_ip_all`, volume данных, healthcheck с автоматическим `rs.initiate` при первом старте); сервис `app` (dev — через `npm run dev` на хосте, либо контейнер для проверки production-сборки); сервис `worker` (тот же образ, команда `node dist/scripts/worker.js`). Секреты — через `env_file` (`.env`, не в репозитории). Строка подключения для разработки: `mongodb://localhost:27017/?replicaSet=rs0&directConnection=true`.
`Dockerfile`: многоступенчатый (deps → build → runtime), non-root пользователь; Express API и Vite static client запускаются отдельно.

## 18. Деплой

Целевой вариант: контейнеры на VPS/PaaS за обратным прокси (TLS, HSTS); приложение `next start` (не статический экспорт); отдельный контейнер воркера; MongoDB — управляемый replica set (Atlas) или собственный replica set с аутентификацией и сетевой изоляцией; пользователь БД приложения с минимальными правами (для `transactions` — без `update/remove`). Порядок выкладки: сборка → `npm run migrate` → запуск app/worker → проверка `SYS-01`. Бэкапы: ежедневные снапшоты/`mongodump` + проверка восстановления; мониторинг: логи с `requestId`, алерты по воркеру и ошибкам 5xx. Альтернатива serverless допустима только с внешним cron для `SYS-02` и учётом пула соединений.

## 19. Порядок и зависимости модулей (13 этапов: 0–12) <!-- CHANGED: A4, A2a (исполнитель — Codex Luna 6) -->

Нумерация **заменяет** прежние «1–13» первой редакции этого раздела и нумерацию MIGRATION_PLAN (ADR-000). Подробности по этапам (эндпоинты, модели, тесты, критерии готовности, исполнитель) — `docs/PHASED_PLAN.md`; перечень эндпоинтов MVP — `docs/MVP_SCOPE.md`.

| Этап | Содержание | Пишет |
|---|---|---|
| 0 | Спайк `occupiedKeys`: реальный replica set, уникальный multikey-индекс, конкурентные вставки, отчёт | Claude |
| 1 | Фундамент: env, logger, БД, defineRoute, tenantPlugin, обновление Next.js, lint/test, Docker, токены дизайна, примитивы | Claude |
| 2 | Модели + Zod + интерфейсы репозиториев/сервисов + UI-компоненты дизайн-системы | Claude |
| 3 | Auth: сессии, членства, RBAC, rate limit, AppShell, login/register | Claude |
| 4 | Staff + Services + Schedule (включая приглашение master через `STF-02`) | Codex Luna 6 |
| 5 | Customers + Settings | Codex Luna 6 |
| 6 | Booking: 6a движок (после спайка), 6b внутренняя запись и статусы, 6c публичная запись и управление по токену | 6a — Claude; 6b, 6c — Codex Luna 6 |
| 7 | Calendar | Codex Luna 6 |
| 8 | Notifications + email (воркер, шаблоны, провайдеры) | Codex Luna 6 |
| 9 | Payments (включая возврат `PAY-06`) | Codex Luna 6 |
| 10 | Dashboard (минимальный: `DSH-01`, `DSH-05`, `MST-01`) | Codex Luna 6 |
| 11 | Очистка прототипа, финальный UI/a11y | Claude + Codex Luna 6 |
| 12 | E2E, безопасность, деплой | Claude |

```
0 спайк ─────────────────────────► 6a
1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 (6a → 6b → 6c) ─► 7
                          6 ─► 8        6 ─► 9 ─► 10 (нужны также 5, 6)
 7, 8, 9, 10 ─► 11 ─► 12
```
Зависимости: `4` и `5` требуют `3`; `6` требует `4`, `5` и результата `0`; `7`, `8`, `9` требуют `6`; `10` требует `6`, `9`. Этапы 1–3 выполняет Claude (по команде владельца) до раздачи задач Codex Luna 6: инфраструктура, модели, auth и UI-компоненты дизайн-системы. **На момент выпуска этого пакета документации код этапов 1–3 не написан** (в репозитории только документация). <!-- CHANGED: ZIP -->
**Уведомления между этапами:** `NotificationService.enqueue*` (постановка в очередь) реализует Claude на этапе 2, поэтому сервисы этапов 4 и 6 могут ставить уведомления сразу; воркер, шаблоны и провайдеры — этап 8. До этапа 8 уведомления накапливаются со статусом `scheduled` (в dev — `ConsoleEmailProvider`). Переход к следующему этапу — только по команде владельца. Обязательные проверки этапа — MIGRATION_PLAN §4 и TESTING_STRATEGY §15.

## 20. Поток публичной записи

```
Клиент: /b/[slug] ─► PUB-01 (профиль) ─► PUB-02 (услуги) ─► PUB-03 (мастера)
        ─► PUB-05 (дни месяца) ─► PUB-04 (слоты на дату)
        ─► PUB-06 (создать запись: slug→business, проверка ссылок, транзакция:
                    bookingVersion++ → повторная проверка → клиент find-or-create (в бизнесе)
                    → insert appointment (unique occupiedKeys) → enqueue notifications → commit)
        ◄─ 201 + manageToken ─► письмо «подтверждение» (воркер)
Управление: /b/[slug]/manage/[token] ─► PUB-07 / PUB-08 / PUB-09 (отмена) / PUB-10 (перенос)
Календарь бизнеса: запись появляется в CAL-01 / APT-01 сразу после коммита
```

## 21. Поток dashboard

`UI (период, мастер)` → `DSH-01`, `DSH-05` (MVP; `DSH-02/03/04` — post-MVP; независимые запросы) → `DashboardService` (границы периода в поясе бизнеса) → агрегации по `transactions`/`appointments`/`customers` с `$match:{businessId}` → DTO → виджеты (skeleton/empty/error на виджет). Загрузка мастера считается чистой функцией по расписаниям/исключениям/блокировкам (общей с календарём).

## 22. Сводка потоков данных

- **Запись/оплата → уведомления:** сервис в транзакции пишет сущность + `notifications`; воркер отправляет асинхронно.
- **Оплата → отчёты:** `payments` + `transactions` (append-only) → выручка в `DSH-01`, `CUS-03`, список оплат `PAY-01` (журнал `TRX-01` — post-MVP).
- **Расписание/блок → доступность:** `staffSchedules/staffExceptions/blockedPeriods` + активные `appointments` → `booking-engine` → слоты/нагрузка.
- **Сессия → всё остальное:** cookie → `sessions` → `businessMembers` → `TenantContext` → права → репозитории.

---

## 23. Cross-document consistency check

Проверка выполнена после создания всех 15 документов: (а) автоматическим скриптом по тексту документов, (б) ручным чтением на соответствие «модель ↔ API ↔ права ↔ UI ↔ движок записи». Скрипт проверяет **структурную** согласованность (идентификаторы, ключи, ссылки), но не смысл формул — смысловые проверки выполнялись вручную и перечислены ниже. Код не написан, поэтому реальные контракт-тесты (TESTING_STRATEGY §6) пока не могут подтвердить документы — это произойдёт при реализации.

**Результаты автоматической проверки**

| Проверка | Итог |
|---|---|
| Эндпоинты в API_CONTRACTS (ID вида `AUTH-01`, `STF-02` …) | **83** (MVP — 64, post-MVP — 19), дубликатов нет. *Исправление:* в первой редакции этого раздела было указано 73 — скрипт не учитывал 4-буквенный префикс `AUTH-` (10 эндпоинтов); проверки ID для `AUTH-*` пересчитываются в A8 <!-- CHANGED: A4 --> |
| ID, упомянутые в UI_UX_SPEC и других документах, но не определённые в API | 0 |
| ID эндпоинтов, не упомянутых в таблице «экран → API» | 0 (служебные `SYS-01/02` перечислены явно) |
| Ключи прав из API_CONTRACTS, отсутствующие в PERMISSIONS_MATRIX | 0 |
| Ключи матрицы (39), не использованные ни одним эндпоинтом | 0; 7 ключей используются только post-MVP эндпоинтами (PERMISSIONS_MATRIX §2a) |
| Ссылки вида «ДОКУМЕНТ §N» на несуществующий раздел | 0 (одна найдена и исправлена) |
| Ссылки на `ADR-NNN`, которых нет в ARCHITECTURE_DECISIONS | 0 |
| 19 коллекций присутствуют в DATA_MODEL и в схеме MASTER_ARCHITECTURE | да |
| Единые значения статусов записи (`pending, confirmed, completed, cancelled, no_show`) в DATA_MODEL, BOOKING, DASHBOARD, DESIGN_SYSTEM | да |

**Расхождения, найденные и исправленные при проверке**
1. Опечатка `staffs.bookingVersion` → `staff.bookingVersion` (DATA_MODEL).
2. Невнятное описание TTL у `notifications` заменено определением поля `expireAt` + TTL-индекс.
3. Две «сырые» формулировки в PERMISSIONS_MATRIX (маскирование email; список скрытых полей) приведены к одному правилу: `customerNote` видим master в его записях, `customers.notes`/`email`/`contacts` и `internalNote` — нет.
4. Ссылка из API_CONTRACTS на несуществующий раздел тестов дашборда исправлена (верный — раздел 7 DASHBOARD_SPEC); ссылки «§PERMISSIONS 3/4» заменены на `PERMISSIONS_MATRIX §3/§4`.
5. Ключ `settings:notifications_read` не использовался — привязан к разделу `notifications` в `SET-01`.
6. Неоднозначность: для `pending`-записи BOOKING_ENGINE_SPEC ставил `appointment_confirmed`, NOTIFICATIONS_SPEC — нет. Единое правило: уведомления и напоминания ставятся только при статусе `confirmed`.
7. Согласие на обработку данных (`acceptPrivacy`) нигде не сохранялось — добавлено поле `appointments.privacyAcceptedAt`.
8. Не у всех эндпоинтов были явно записаны rate limit/isolation/auth — добавлено нормативное «правило наследования» в API_CONTRACTS §0.

**Расхождения с PROJECT_AUDIT.md и MIGRATION_PLAN.md** (файлы не изменялись) — перечислены в ARCHITECTURE_DECISIONS ADR-000; приоритет у документов `docs/`.

**Ручные проверки (подтверждены чтением)**
- Модель → API: все поля DTO существуют в коллекциях; поля записи (`contactEmail`, `idempotencyKey`, `rescheduleCount`, `visitNote`, `internalNote`, `privacyAcceptedAt`) используются в контрактах; `staffId`/`customerId` копируются в `payments`/`transactions` для фильтров дашборда.
- API → роли: у каждого эндпоинта есть ключ права или `CRON`/публичный контекст; master-ограничения (`own`, `limited`, только `visitNote`/`status`) описаны и в PERMISSIONS_MATRIX, и в API (раздел 4, APT-04/06).
- Роли → businessId: `TenantContext` строится из сессии+членства; чужой объект → `404`; `businessId` в теле → `422`; публичный контур — slug/токен.
- Движок → модель: `serviceSnapshot`, `blockedUntilAt`, `occupiedKeys`, `staff.bookingVersion`, `settings.booking.*` совпадают с DATA_MODEL; допустимые переходы статусов совпадают с правами master/admin; DST и «любой мастер» опираются на существующие поля.
- UI → API: каждый экран UI_UX_SPEC §3 имеет эндпоинты (таблица §8).

### Covered requirements (R1–R14 из PRODUCT_SPEC §3)

| № | Модель | API | UI | Права | Тест |
|---|---|---|---|---|---|
| R1 Регистрация бизнеса/владельца | users, businesses, businessMembers, settings, sessions | AUTH-01 | `/register`, онбординг (§3.1, §3.4) | публично; роль owner назначает сервер | API AUTH-01 (атомарность, дубли); E2E-1 |
| R2 Вход/выход/cookie-сессия | users, sessions | AUTH-02/03/04/09; AUTH-07/08 | `/login`, `/app/account` | `account:self` | TESTING §10 (сессии, rate limit); API AUTH-* |
| R3 Роли owner/admin/master | businessMembers | MEM-01, MEM-03, MEM-04, AUTH-04 (MEM-02, MEM-05 post-MVP) | Настройки → Команда | PERMISSIONS_MATRIX целиком (`members:*`) | TESTING §5 (генерация из матрицы) |
| R4 Сотрудники/мастера | staff, businessMembers | STF-01…04 (приглашение — в STF-02), MEM-04 (STF-05 post-MVP) | `/app/staff` | `staff:*` | §5; API STF-01…04 |
| R5 Расписание, перерывы, исключения, блокировки | staffSchedules, staffExceptions, blockedPeriods | STF-06…10, BLK-01…03 | вкладки сотрудника, календарь | `staff:schedule_write`, `blocks:write` | BOOKING §13 (1–7), §7 (4) |
| R6 Услуги и привязка к мастерам | services, staffServices | SVC-01, SVC-02, SVC-04, STF-11/12 | `/app/services`, вкладка «Услуги» | `services:*` | API SVC-*; A/B (§4.4) |
| R7 База клиентов | customers (+агрегации по appointments/transactions) | CUS-01…04, CUS-06 (CUS-05 post-MVP) | `/app/customers[/id]` | `customers:*`, master `limited` | §4.2/4.8; CUS-03 (расчёт summary) |
| R8 Публичная онлайн-запись | businesses(slug), services, staff, staffServices, appointments, customers, settings | PUB-01…10, AVL-01 | `/b/[slug]`, `/b/[slug]/manage/[token]` | публично + rate limit; `appointments:create` для внутренней | §7 (гонки), §4.7, §8; BOOKING §13; E2E-2/3 |
| R9 Календарь | appointments, blockedPeriods, staffSchedules | CAL-01, APT-01…06, BLK-* | `/app/calendar` | `calendar:read` (+own), `blocks:write` | CAL-01 API; §8 (неделя в DST); E2E-4 |
| R10 Оплаты, возвраты, транзакции | payments, transactions | PAY-01, PAY-02, PAY-04, PAY-05, PAY-06 (PAY-03, PAY-07, TRX-01/02 post-MVP) | `/app/payments` («история» = список оплат) | `payments:*` (master —) | PAYMENTS §8 (13 кейсов); кросс-проверка выручки прямым запросом к БД (TESTING §9) |
| R11 Email-уведомления | notifications, settings | SYS-02 (NTF-01/02, SET-04 post-MVP) | интерфейса журнала в MVP нет | `settings:notifications_read` (остальные ключи post-MVP) | NOTIFICATIONS §10 (13 кейсов + 1 сервисный; без UI журнала) |
| R12 Dashboard | transactions, appointments, customers, staffSchedules, blockedPeriods | DSH-01, DSH-05, MST-01 (DSH-02/03/04 post-MVP) | `/app/dashboard` (4 KPI + ближайшие), `/app/my-day` | `dashboard:read`, `dashboard:read_own` | DASHBOARD §7 (кейсы для `DSH-01/05`, `MST-01`; кейсы 5–6 — post-MVP) |
| R13 Изоляция бизнесов | `businessId` во всех бизнес-коллекциях, `tenantPlugin` | все (ST-3, ST-4) | UI-сценарий двух контекстов | `TenantContext`, 404-политика | TESTING §4 (12 проверок + мутант-тест) |
| R14 Responsive UI, состояния, доступность | — | — | UI_UX_SPEC §2–§7, DESIGN_SYSTEM | меню по `AUTH-04.permissions` | TESTING §11 (E2E-9/10), §12 (axe, контраст) |

### Known risks

1. **Изоляция без RLS/FK (MongoDB).** Утечка возможна при пропущенном фильтре; снижается `ctx`-API репозиториев, `tenantPlugin`, проверкой ссылок и A/B-тестами, но держится на дисциплине.
2. **Механизм `occupiedKeys` не прототипирован.** Уникальный multikey-индекс с partial-фильтром — ключевая гарантия от двойной записи; нужна проверка на реальной версии MongoDB (поведение partial/multikey, размер индекса, нагрузка) в первом спайке Этапа 2/6a **до** остальной работы над записью.
3. **Транзакции требуют replica set** (Docker, тесты, хостинг); часть бесплатных/упрощённых хостингов этого не даёт.
4. **DST и пояса:** сложные граничные случаи; много тестов, ошибки вероятны именно здесь.
5. **Собственная аутентификация:** риск ошибок безопасности; требуется углублённое ревью, тесты §10, не передавать во внешние чаты без проверки.
6. **Next.js 14.1.0** с известными уязвимостями — обновление обязательно на Этапе 1; возможны несовместимости при апгрейде.
7. **Лицензия:** GPL-3.0 reference + отсутствие `LICENSE` у основы; подход «идеи, не код» снижает, но не исключает риск; нужна консультация юриста перед коммерческим запуском.
8. **Доставляемость email** (SPF/DKIM/DMARC, репутация SMTP) и надёжность воркера (падение процесса, зависшие `processing`).
9. **Публичная запись и спам:** защита — honeypot + rate limit; без CAPTCHA возможны массовые фиктивные записи (блокируют слоты).
10. **Объём:** 19 коллекций, 83 описанных эндпоинта (64 в MVP), ~17 итераций; при передаче кода внешним чатам — риск дрейфа контрактов (смягчается DEEPSEEK_HANDOFF_RULES).
11. **Производительность дашборда** на больших данных (агрегации без предагрегатов) и `rateLimits` в той же БД.
12. **Доступность стекла:** контраст рассчитан для токенов, но реальный контраст на градиентном фоне/пятнах нужно мерить на готовом UI; `backdrop-filter` на слабых мобильных устройствах.
13. **Документы не проверены кодом:** скрипт ловит структурные расхождения; смысловые ошибки могут обнаружиться при реализации — правки контрактов делаются сначала в документах.
14. **Персональные данные:** хранение телефонов/почты клиентов — нужна политика хранения/удаления и текст согласия в соответствии с законодательством страны бизнеса (не определено).
15. **Нормализация телефонов** зависит от `businesses.countryCode` — неверная страна даёт дубли/ложные совпадения клиентов; при смене страны старые `phoneNormalized` не пересчитываются.
16. **Сокращения MVP относительно первого ТЗ (согласованы владельцем):** журнал отправок уведомлений без UI (R11); нет графика, загрузки мастеров и топа услуг (R12); нет отдельного экрана транзакций (R10 — «история» = список оплат); нельзя создать admin и сменить роли (R3); нет удаления клиентов, услуг и сотрудников — только деактивация. <!-- CHANGED: A4 -->
17. **Нет удаления клиентов в MVP** (`CUS-05` post-MVP), `dataRetentionDays` не применяется автоматически: запросы на удаление персональных данных придётся выполнять вручную в БД до появления функции. <!-- CHANGED: A4 -->

### Decisions needed before implementation

| № | Решение | Рекомендация архитектора |
|---|---|---|
| 1 | Лицензия продукта (и подтверждение подхода ADR-012; юрист) | Закрытая/проприетарная для SaaS, `NOTICE` с упоминанием обоих проектов |
| 2 | Версии: **решено** Node.js 24 LTS и MongoDB 8.0; Next.js/React — выбрать актуальные поддерживаемые на Этапе 1 (ADR-016) | Проверить совместимость с Node 24 при апгрейде |
| 3 | Хостинг БД и приложения (Atlas vs свой replica set; VPS/PaaS) и способ запуска воркера | Docker на VPS + Atlas; воркер отдельным контейнером |
| 4 | Валюта, часовой пояс, страна: **решено** — выбор при регистрации (страна: RU, KZ, KG, US, OTHER; по умолчанию из региона браузера, запасное — `APP_DEFAULT_COUNTRY_CODE`) | — |
| 5 | Может ли master блокировать своё время (ADR-011) | Нет в MVP |
| 6 | CAPTCHA для публичной записи в MVP (например, Turnstile через адаптер) | Добавить после MVP при первых злоупотреблениях; сейчас honeypot + лимиты |
| 7 | Письмо «заявка принята» для `pending`-записей | Не в MVP; по умолчанию `autoConfirm = true` |
| 8 | Хэш паролей: `@node-rs/argon2` или `bcryptjs` | argon2id; bcryptjs как запасной при проблемах сборки |
| 9 | Подтверждение набора библиотек: TanStack Query, Recharts, libphonenumber-js, luxon, логгер (pino) | Принять список MASTER_ARCHITECTURE §16 |
| 10 | Данные клиентов: **решено** `dataRetentionDays` информационное, `consentText`/`requireConsent` настраиваются; юридический текст согласия и порядок ручного удаления — определить до Этапа 6c | Юридическая проверка текста |
| 11 | SMTP-провайдер, домен отправителя, SPF/DKIM/DMARC | До Этапа 9 |
| 12 | Email клиента обязателен при публичной записи (так в контракте PUB-06) | Оставить обязательным (иначе напоминания невозможны) |
| 13 | Одна услуга на запись в MVP | Подтвердить |
| 14 | Свой раннер миграций или `migrate-mongo` (ADR-015) | Свой лёгкий раннер |
| 15 | Спайк по `occupiedKeys` — **Этап 0** (риск 2), до Этапа 6 | Выполнить обязательно |

### A8. Итоговая проверка после правок A1–A7 <!-- CHANGED: A2b -->

Выполнена скриптами и чтением после A-part-1, A2a, A2b (17 документов).

**Структурные проверки (скрипт):**

| Проверка | Итог |
|---|---|
| Эндпоинты: 83 описано, 64 MVP / 19 post-MVP; MVP_SCOPE = API_CONTRACTS (ID, метод, путь) | совпадает |
| Распределение MVP-эндпоинтов по этапам: MVP_SCOPE = PHASED_PLAN (этапы 0–12, под-этапы 6a/6b/6c) | совпадает; сумма 1+8+20+8+17+1+1+5+3 = 64 |
| MASTER §19 ↔ PHASED_PLAN: нумерация, исполнители, зависимости | совпадают (проверено чтением) |
| Упоминания post-MVP эндпоинтов вне строк с пометкой post-MVP | были в 6 документах — исправлены (DASHBOARD, MASTER §9/§21/§22, NOTIFICATIONS, PAYMENTS, PRODUCT_SPEC, TESTING, UI), повторный скан см. отчёт |
| Битые ссылки на разделы документов и ADR | 0 |
| `DeepSeek` как исполнитель | заменён на Codex Luna 6 (остался только в историческом имени файла правил) |

**Смысловые проверки (чтением) по списку A8:**
- `countryCode`: DATA_MODEL §3 (поле, индекс), API `AUTH-01` и `SET-02`/`SettingsDto`, UI §3.1 и §3.13, MASTER §15 (`APP_DEFAULT_COUNTRY_CODE`), DATA_MODEL §12 (разбор телефонов) — согласовано.
- `passwordChangedAt`: DATA_MODEL §1 (удаление других сессий при смене) и `AUTH-09`/`AUTH-08` — согласовано (правка не потребовалась).
- `privacy.*` (`dataRetentionDays`, `consentText`, `requireConsent`): DATA_MODEL §4, `PUB-01` (`consent`), `PUB-06` (`acceptPrivacy` обязателен при `requireConsent`), `SET-02`, UI §3.2/§3.13 — согласовано; `dataRetentionDays` везде помечено «не применяется автоматически».
- Flow создания master: `STF-02` (staff + users(invited) + businessMembers(invited) + токен + письмо в одной транзакции), `AUTH-06` (приём), `MEM-01/03/04`, `STF-04` (деактивация отключает членство и сессии), DATA_MODEL §5 (`unique {userId}` — ограничение MVP, замена на partial `{status:'active'}` в post-MVP), PHASED_PLAN этапы 3–4 (`AuthService.createInvitedUser` от Claude) — согласовано.

**Расхождения, найденные и исправленные на этом шаге (A2b):**
9. **Недостижимые `PAY-04`/`PAY-05`:** упрощённая форма создавала только `paid`. В форму `PAY-02` добавлен select «Оплачено / Ожидает оплаты» (UI_UX_SPEC §3.11, MVP_SCOPE).
10. **Несовпадение «итогов оплат» и выручки дашборда:** `PAY-01.meta.totals` считается по платежам периода (`paidAt`), выручка — по `transactions.occurredAt`; при возврате в другом периоде значения расходятся. Тест «выручка = TRX-01 totals» (DASHBOARD §7/9, PAYMENTS §8/10, TESTING §9) заменён сравнением с прямым запросом к БД; определение `PAY-01 meta.totals` зафиксировано в PAYMENTS_SPEC §5.
11. **Тесты, зависящие от post-MVP:** NOTIFICATIONS §10 кейсы 8–9 (`SET-04`, `NTF-02`) заменены на `dedupe` токенных писем и `pending`→`confirmed`; поведение отключения видов проверяется на уровне сервиса (кейс 14). DASHBOARD §7 кейсы 5–6 помечены post-MVP (загрузка проверяется тестами `CAL-01`).
12. **Роль admin в MVP не создаётся**, поэтому ролевые тесты admin выполняются на уровне сервисов с фикстурой `world-ab` (PERMISSIONS §2a, TESTING §5).
13. **R10/R11/R12:** сокращения MVP явно записаны в PRODUCT_SPEC §3 и §3a.

**Открытые вопросы (не блокируют этап B):** (а) режим Luna — R (репозиторий) принят по умолчанию, ждёт подтверждения; (б) номер версий пакетов в `package.json` будет подтверждён только установкой у владельца (в среде подготовки нет доступа к npm).
