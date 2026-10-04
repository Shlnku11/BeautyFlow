# CODING_STANDARDS.md — Стандарты кода

Обязательны для всего кода, в том числе полученного из внешних чатов (DEEPSEEK_HANDOFF_RULES). Нарушение стандарта = код не принимается.

## 1. TypeScript

- `strict: true` + `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` (включаются на Этапе 1; существующий код приводится в порядок только в файлах, которые трогает этап).
- **`any` запрещён** (в т.ч. `catch (err: any)` → `catch (err: unknown)` + сужение). ESLint: `@typescript-eslint/no-explicit-any: error`. `as`-приведения — только с комментарием-обоснованием; `@ts-ignore` запрещён, `@ts-expect-error` — только с описанием и ссылкой на задачу.
- Типы данных API и форм выводятся из Zod: `type X = z.infer<typeof XSchema>`. Дублировать типы вручную нельзя.
- Деньги — `number` (целые minor units) в типе `Minor` (branded), даты API — `string` ISO, внутри сервера — `Date`/luxon `DateTime`.
- Идентификаторы — `string` в API/UI, `Types.ObjectId` только внутри `src/server/db` и репозиториев; преобразование — в одном месте.

## 2. Именование

| Что | Правило | Пример |
|---|---|---|
| Файлы/папки | `kebab-case` | `booking-service.ts`, `staff-schedule/` |
| React-компоненты (файл и экспорт) | `PascalCase.tsx` | `AppointmentCard.tsx` |
| Хуки | `useCamelCase` | `useAppointments` |
| Переменные/функции | `camelCase` | `getAvailableSlots` |
| Типы/интерфейсы/классы | `PascalCase`, без префикса `I` | `TenantContext` |
| Константы | `UPPER_SNAKE_CASE` | `SLOT_GRANULARITY_MINUTES` |
| Mongoose-модели | единственное число, `PascalCase` | `Appointment` (коллекция `appointments`) |
| Zod-схемы | `<Name>Schema` | `CreateAppointmentSchema` |
| Коды ошибок | `UPPER_SNAKE_CASE` | `SLOT_UNAVAILABLE` |
| Тесты | `<unit>.test.ts` рядом с типом теста (см. §10) | `slots.test.ts` |
Имена сущностей **строго по DATA_MODEL_MONGODB.md**. Новые имена сущностей/полей не придумываются.

## 3. Структура и импорты

```
src/app/            только маршруты/страницы/Route Handlers (тонкий слой)
src/components/ui/  универсальные UI-компоненты без бизнес-логики
src/components/features/<feature>/   компоненты функций
src/hooks/          клиентские хуки (данные через api-client)
src/lib/            api-client, format, a11y-утилиты (чисто клиент/общие)
src/shared/         Zod-схемы, типы DTO, константы, i18n-ключи — БЕЗ серверных/клиентских зависимостей
src/server/         ВСЁ серверное (db, repositories, services, domain, auth, http, notifications, jobs, config)
```
- Алиасы: `@/*` → `src/*` (tsconfig `paths`). Относительные импорты — только внутри одной папки функции (`./x`), выше — алиас.
- **Границы:** `src/server/**` начинается с `import 'server-only'`; клиентские компоненты не импортируют из `src/server`. `src/shared` не импортирует из `server`/`components`. Нарушение ловится ESLint (`no-restricted-imports`) и тестом `architecture.test.ts` (проверка импортов).
- Порядок импортов: node/внешние → `@/` → относительные → типы; без циклических зависимостей (`import/no-cycle`).
- Named exports; `default export` только там, где требует Next (`page.tsx`, `layout.tsx`, `route.ts` экспортирует HTTP-методы).

## 4. Слои сервера (service / repository)

```
Route Handler → defineRoute (auth, tenant ctx, rate limit, zod) → Service → Repository → Mongoose model
```
- **Route Handler:** только разбор запроса, вызов сервиса, формирование ответа. Бизнес-логики и обращений к моделям нет.
- **Service** (`src/server/services/*-service.ts`): бизнес-правила, проверка прав (`PermissionService`), транзакции, постановка уведомлений, аудит. Принимает `ctx: TenantContext` первым параметром.
- **Repository** (`src/server/repositories/*-repository.ts`): единственное место с запросами к моделям; **первый параметр всегда `ctx: TenantContext`** (или `PublicContext`), `businessId` подмешивается репозиторием; методы возвращают plain-объекты (`lean`) или доменные типы, не Mongoose-документы.
- **Domain** (`src/server/domain/*`): чистые функции (booking-engine, money, permissions, transitions) — без I/O.
- Сервисы не вызывают Route Handlers; репозитории не вызывают сервисы. Межсервисные вызовы — через публичные методы сервисов.

## 5. Мультитенантность (жёсткие правила)

1. `businessId` в сервисах/репозиториях берётся **только** из `ctx`. Любое поле `businessId` в теле/query/заголовке клиента запрещено (Zod `.strict()` → 422).
2. Запрещены запросы к бизнес-коллекциям мимо репозитория; `Model.find(...)` вне `src/server/repositories` и `src/server/db` — ошибка ESLint (`no-restricted-syntax` по импорту моделей).
3. Репозиторий обязан отдавать `null` (→ 404), если документ найден, но принадлежит другому бизнесу (фильтр по `businessId` делает это естественно).
4. Все ссылки (`customerId`, `staffId`, `serviceId`, …) во входных данных проверяются загрузкой через репозиторий с тем же `ctx` до записи.
5. Исключения из tenant-guard (`users`, `sessions`, `businesses`, `rateLimits`, `schemaMigrations`, claim воркера уведомлений) перечислены в одном файле `tenant-exempt.ts` с комментарием-обоснованием.

## 6. Валидация (Zod)

- Все входные данные (body, query, params, env) валидируются Zod на границе. Схемы — в `src/shared/schemas/<feature>.ts`, используются и сервером, и формами.
- Объекты — `.strict()`; строки — `trim()` и максимальные длины; числа — `int()` и диапазоны; даты — ISO-строки → `Date` в одном месте; enum — `z.enum` из констант DATA_MODEL.
- Сообщения валидации — коды (`too_small` и т.д.), перевод на русский — в UI-словаре.
- Ответы сервера не валидируются Zod в runtime, но DTO-мапперы обязательны (никаких «возврата документа как есть»).

## 7. Mongoose

- Схемы в `src/server/db/models/*.ts`, одно имя модели — один файл; `timestamps: true`, `strict: 'throw'`, `autoIndex: false` (индексы — миграции), `optimisticConcurrency` где указано в DATA_MODEL.
- Подключение — один кеширующий коннектор (`global`), `maxPoolSize` из env; нельзя создавать соединение в обработчике.
- Запросы читающие — `.lean()`; `select` явный для публичных DTO; **`populate` не используется** (явные запросы по id — предсказуемо и изолированно).
- Транзакции — только через `withTransaction(fn)` (повтор при `TransientTransactionError` до 3 раз); внутри — все операции получают `session`.
- Деньги — только целые; даты — UTC.
- Любое изменение схемы/индекса = новая миграция `migrations/NNN_name.ts`; изменение уже применённой миграции запрещено.
- Soft delete — через `isDeleted/deletedAt` (DATA_MODEL §0); физическое удаление — только там, где явно разрешено (`staffServices`, `sessions`, исключения/блокировки).

## 8. API-соглашения

- Все обработчики создаются через `defineRoute` (`id`, метод, путь, `auth`, `permission`, `contextSource`, схемы, `rateLimit`) — реестр используется contract-тестом.
- Ответы: `ok(data, meta?)`, `created(data)`, `noContent()`; ошибки: бросаются как `AppError` и преобразуются единым обработчиком. Формат — API_CONTRACTS §0.
- Классы ошибок (`src/server/http/errors.ts`): `AppError(code, httpStatus, message, details?)` ← `ValidationError (422)`, `UnauthenticatedError (401)`, `ForbiddenError (403)`, `NotFoundError (404)`, `ConflictError (409)`, `RateLimitError (429)`, `BadRequestError (400)`; доменные коды — константы в `src/shared/error-codes.ts`. Необработанные исключения → `500 INTERNAL` без деталей, полный лог с `requestId`.
- Логи: структурированные JSON (`pino`-совместимый интерфейс — решение на Этапе 1), без паролей/токенов/полных email-тел; PII минимизировать.
- Пути, методы и коды — **строго по API_CONTRACTS.md**; отклонения требуют правки контракта с разрешения.

## 9. React и Next.js

- Server/Client: по умолчанию компоненты серверные только для статических оболочек (layout, заголовки); любые экраны с данными — клиентские (`'use client'`) и получают данные через `api-client` + TanStack Query. **Прямой доступ к БД из UI, в том числе из Server Components и `generateMetadata`, запрещён.**
- Компоненты: функциональные, props типизированы, без `React.FC`; один компонент — один файл; логика данных — в хуках (`useCustomers`), презентация — в компонентах; компонент ≤ ~200 строк, иначе разбивать.
- Хуки: только `use*`, зависимости эффектов корректны (`react-hooks/exhaustive-deps: error`).
- Состояния данных: `loading / empty / error / success` обязательны для каждого экрана (UI_UX_SPEC §4); текст — из i18n-словаря.
- Формы: react-hook-form + zodResolver с общими схемами; ошибки сервера отображаются у полей.
- Доступность — DESIGN_SYSTEM §9: семантические теги, `aria-*`, фокус; `div onClick` вместо кнопки запрещён.
- Нет `localStorage` с персональными данными/токенами; сессия — только httpOnly cookie.
- Next.js Route Handlers: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'`.

## 10. Tailwind

- Только токены темы (`bg-primary-600`, `text-neutral-900`, `rounded-lg`); произвольные значения `[#hex]`/`[13px]` запрещены (исключение — размеры геометрии календаря с комментарием).
- Стеклянные классы — только готовые утилиты `glass-surface` (определены в одном месте); применять их вне whitelist DESIGN_SYSTEM §5 нельзя.
- Порядок классов — `prettier-plugin-tailwindcss`; повторяющиеся наборы → компонент, не `@apply`-свалка.
- Адаптивность — mobile-first (`sm:`, `md:`, `lg:`); `dark:` запрещён (DESIGN_SYSTEM §8).

## 11. Тестовые правила (кратко; полно — TESTING_STRATEGY)

Каждая новая функция — с тестами в том же этапе. Тесты детерминированы: время через инъекцию `now`, случайность через seed. Нет `.only`/`.skip` в основной ветке. Бизнес-A/B фикстуры обязательны для любой репозиторной/сервисной функции с `ctx`.

## 12. i18n

Строки интерфейса — только через словарь `src/shared/i18n/ru.ts` (типизированные ключи, функция `t(key, params)`); хардкод русского текста в компонентах запрещён (ESLint-правило/тест на кириллицу в `src/components`, `src/app`). Серверные письма — шаблоны по ключу локали. Даты/деньги — `Intl` с локалью и часовым поясом бизнеса, не ручная склейка.

## 13. Конфигурация и секреты

- Все настройки — через env, читаются **только** в `src/server/config/env.ts` (Zod-валидация при старте; приложение не стартует с неверной конфигурацией). Клиенту доступно только `NEXT_PUBLIC_*` (без секретов).
- Секреты не попадают в код, тесты, логи, архивы; `.env*` в `.gitignore`; в репозитории только `.env.example` с пустыми/демо-значениями. Для тестов — отдельные тестовые значения, не совпадающие с production.
- Сравнение секретов — `crypto.timingSafeEqual`.

## 14. Запреты (сводка)

`any` · mock-данные в завершённых функциях · прямой доступ к БД из UI · `businessId` из тела/query · секреты в коде · `console.log` в production-коде (использовать logger) · `populate` · float для денег · `localStorage` для токенов/ПД · новые зависимости без разрешения · изменение контрактов без разрешения · копирование кода из reference-проекта · `dark:`-стили · хардкод русских строк в компонентах.

## 15. Комментарии

Комментарии объясняют **почему**, а не «что» (код сам читаем). Обязательны: инварианты (например, «`occupiedKeys` обязан быть пересчитан при смене времени»), ссылки на документ-источник правила (`// BOOKING_ENGINE_SPEC §5.2`), обоснование исключений из правил. Публичные функции домена — краткий JSDoc с единицами измерения (минуты, UTC). Закомментированный код и `TODO` без ссылки на задачу в основной ветке запрещены; **критические функции не оставляются как TODO/mock**.

## 16. Форматирование и инструменты

Prettier (`semi: true`, `singleQuote: true`, `printWidth: 100`, `trailingComma: 'all'`), ESLint (`next/core-web-vitals`, `@typescript-eslint/strict`, `import`, `jsx-a11y`, `react-hooks`), EditorConfig. Скрипты (появятся на Этапе 1): `lint`, `typecheck`, `format:check`, `test:unit`, `test:integration`, `test:api`, `test:e2e`, `migrate`, `build`. Коммиты — Conventional Commits. Перед слиянием должны проходить `lint`, `typecheck`, тесты затронутого этапа и `build`.
