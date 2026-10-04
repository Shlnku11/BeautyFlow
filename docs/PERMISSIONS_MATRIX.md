# PERMISSIONS_MATRIX.md — Роли и права

Источник истины для прав. API_CONTRACTS ссылается на **ключи прав** из этого файла (колонка «Permission»). Ключ, которого нет здесь, использовать нельзя.

## 1. Принципы

1. Три роли: `owner`, `admin`, `master`. Роль хранится в `businessMembers.role` и определяется **на каждый запрос** по активному членству в бизнесе из сессии (не кэшируется в cookie).
2. Проверка трёхступенчатая: **аутентификация** (сессия) → **членство** (`businessMembers.status = active` в `session.businessId`) → **право** (`can(role, permissionKey)` + область).
3. Значения ячейки: `—` запрещено · `all` весь бизнес · `own` только свои данные (у master — записи, где `staffId = member.staffId`) · `limited` урезанный набор полей.
4. **Видимость vs запрет.** Объект другого бизнеса или чужой для master (`own`-область) → `404 NOT_FOUND` (существование не раскрывается). Маршрут/действие запрещено роли целиком → `403 FORBIDDEN`.
5. Права проверяются в сервисном слое (`PermissionService.assert`) и дублируются метаданными маршрута (`defineRoute({permission})`), чтобы тесты могли перечислить все маршруты.
6. Права **не** настраиваются владельцем в MVP, кроме флага `privacy.masterSeesCustomerPhone`.

## 2. Матрица

| Ключ права | owner | admin | master |
|---|---|---|---|
| `dashboard:read` | all | all | — |
| `dashboard:read_own` | — | — | own (без денег) |
| `calendar:read` | all | all | own |
| `blocks:write` (создание/удаление блокировок времени) | all | all | — |
| `appointments:read` | all | all | own |
| `appointments:create` | all | all | — |
| `appointments:update` (internalNote, customerNote, смена услуги/мастера) | all | all | — |
| `appointments:reschedule` | all | all | — |
| `appointments:status` (confirm/complete/no_show/cancel) | all | all | own (см. §3) |
| `appointments:visit_note` | all | all | own |
| `customers:read` | all | all | limited (только клиенты с записями у этого master) |
| `customers:write` | all | all | — |
| `customers:delete` | all | all | — |
| `payments:read` | all | all | — |
| `payments:create` | all | all | — |
| `payments:cancel` (pending) | all | all | — |
| `payments:refund` | all | all | — |
| `transactions:read` | all | all | — |
| `staff:read` | all | all | own (только свой профиль и расписание) |
| `staff:write` (профиль, услуги мастера) | all | all (кроме управления доступом, см. members) | — |
| `staff:schedule_write` (расписание, исключения) | all | all | — |
| `staff:deactivate` | all | all | — |
| `services:read` | all | all | limited (только услуги, привязанные к нему) |
| `services:write` | all | all | — |
| `services:delete` | all | all | — |
| `settings:business_read` | all | all | — |
| `settings:business_write` (название, адрес, timezone, currency, privacy) | all | — | — |
| `settings:booking_write` | all | all | — |
| `settings:notifications_read` | all | all | — |
| `settings:notifications_write` | all | — | — |
| `notifications:read` (журнал) | all | all | — |
| `notifications:retry` | all | all | — |
| `members:read` | all | all (без токенов) | — |
| `members:invite` (роль `master`) | all | all | — |
| `members:invite_admin` (роль `admin`) | all | — | — |
| `members:manage_role` (смена роли, отключение) | all | только master | — |
| `members:transfer_ownership` | all (re-auth паролем) | — | — |
| `audit:read` | all | — | — |
| `account:self` (свой профиль, пароль, переключение бизнеса) | all | all | all |

<!-- CHANGED: A3.5 -->
## 2a. Статус ключей в MVP

Матрица определяет права полностью (контракт на будущее), но часть ключей относится к функциям post-MVP и в MVP не проверяется ни одним реализованным эндпоинтом.

| Статус | Ключи |
|---|---|
| **post-MVP** (эндпоинты не реализуются) | `members:invite_admin` (MEM-02), `members:transfer_ownership` (MEM-05), `audit:read` (AUD-01), `notifications:read` и `notifications:retry` (NTF-01/02), `settings:notifications_write` (SET-04), `transactions:read` (TRX-01/02) |
| **MVP с ограничением** | `members:manage_role` — в MVP только смена `status` членов-master (`role` менять нельзя); `members:invite` — повторная отправка (`MEM-04`) и приглашение, создаваемое вместе с сотрудником (`STF-02` с `email`: требуются `staff:write` **и** `members:invite`); `account:self` — пароль, выход, данные пользователя (смена имени и переключение бизнеса — post-MVP) |
| **MVP** | все остальные ключи |

Следствия для MVP: роль `admin` в MVP не создаётся (есть owner и master), поэтому правила для admin остаются проверяемыми только в тестах на уровне сервисов (фикстура `world-ab` создаёт admin напрямую); в MVP один пользователь состоит в одном бизнесе.

## 3. Детали и запрещённые поля/действия

### owner
- Единственный (ровно один активный) на бизнес; не может отключить сам себя и не может понизить себя без передачи владения.
- Передача владения: только target-пользователь с ролью `admin` и активным членством; требуется повторный ввод пароля владельца; пишется `auditLogs: ownership.transferred`; выполняется в транзакции.
- Не может: видеть/менять `passwordHash`, токены других пользователей; менять `businessId`, `slug` (immutable).

### admin
- Может: клиенты, записи, оплаты/возвраты, сотрудники, расписания, услуги, блокировки, дашборд, журнал уведомлений (+повтор), настройки записи (`settings:booking_write`), приглашение/отключение **master**.
- **Запрещено:** `settings:business_write` (timezone, currency, название, slug, privacy), `settings:notifications_write` (только чтение), `audit:read`, приглашение/смена роли/отключение `admin` и `owner`, передача владения, изменение собственной роли.
- Запрещённые поля в `PATCH /api/members/:id` для admin: `role` (если целевой не master), `status` целевого admin/owner → `403`.

### master
- Видит: свой календарь/записи/профиль/расписание (read-only); клиентов, у которых есть запись у него; услуги, привязанные к нему.
- `customerNote` (комментарий клиента к его записи) **виден** master в его собственных записях. Поля клиента, доступные master (`limited`): `id`, `firstName`, `lastName`, `phone` (только если `privacy.masterSeesCustomerPhone = true`), история записей **у этого мастера** (дата, услуга, статус, `visitNote`).
- **Скрыто от master:** `customers.email`, `contacts`, `notes` (заметки о клиенте), `internalNote` записей; суммы оплат и любые `payments`/`transactions`, данные других мастеров, дашборд денег, настройки, журнал уведомлений, аудит, членов.
- Изменение записи: только поля `status` и `visitNote` **собственных** записей. Любое другое поле в теле → `422` (strict-схема), чужая запись → `404`.
- Допустимые переходы master (подмножество BOOKING_ENGINE_SPEC §9): `pending→confirmed`, `confirmed→completed`, `confirmed→no_show`, `pending|confirmed→cancelled` (с причиной). Откат `completed`/`no_show`/`cancelled` — только owner/admin.
- Не может: создавать/переносить записи, менять расписание, создавать блокировки (решение MVP, см. ARCHITECTURE_DECISIONS ADR-011).

## 4. Правила для данных (field-level)

| Сущность | owner/admin | master |
|---|---|---|
| customer | все поля, кроме служебных `searchTokens` | `limited`-набор выше |
| appointment | все поля; токены (`manageTokenHash`) **никогда** не отдаются | `id, startAt, endAt, status, serviceSnapshot.name, customer(limited), customerNote, visitNote`; нет `internalNote`, цен, `payments` |
| staff | все; `bookingVersion` не отдаётся | свой профиль |
| member | `id, user{name,email}, role, status, staffId, joinedAt` | — |
| settings | согласно ключам выше | — |
| notification | `kind, status, scheduledFor, sentAt, attempts, lastError, recipient` (email показывается полностью) | — |

Никогда не отдаются клиенту (любая роль): `users.passwordHash`, `passwordResetTokenHash`, `sessions.tokenHash`, `businessMembers.inviteTokenHash`, `appointments.manageTokenHash`, `occupiedKeys`.

## 5. Реализация (требования)

- Единый модуль `src/server/domain/permissions.ts` содержит таблицу «роль → ключ → значение» в виде константы, из неё же генерируется тест полноты (каждая пара роль×ключ обязана быть определена).
- `own`-область для master реализуется фильтром репозитория (`staffId = member.staffId`), а не пост-фильтрацией результата.
- Любой новый маршрут обязан объявить ключ права; маршрут без ключа не проходит contract-тест (TESTING_STRATEGY §6).
- Ответы 403/404 не раскрывают, почему (одинаковое сообщение, разные коды только по правилу п.4 §1).
