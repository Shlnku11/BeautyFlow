# DATA_MODEL_MONGODB.md — Модель данных (MongoDB + Mongoose)

Статус: спецификация. Модели и миграции — см. `src/server/db/models` и `migrations/`. <!-- CHANGED: after stage 1 --> Источник истины для имён сущностей и полей: **этот файл**. Любое другое место, где имя поля отличается, — ошибка в том месте.

---

## 0. Общие правила

| Правило | Значение |
|---|---|
| Имена коллекций | camelCase, множественное число: `users`, `businessMembers`, `staffSchedules` … |
| Имена полей | camelCase |
| `_id` | `ObjectId`. В API отдаётся как строка `id` |
| Время | `Date` в **UTC**. Календарные даты «по бизнесу» — строка `YYYY-MM-DD`, время суток — строка `HH:mm` (24ч) |
| Деньги | **целое число в минимальных единицах** (`amountMinor`, `priceMinor`), валюта — ISO 4217 (`RUB`, `KZT`, `KGS`, `USD`, `EUR`). Float запрещён |
| `createdAt`/`updatedAt` | у всех коллекций, `timestamps: true` |
| Мягкое удаление | поля `isDeleted: Boolean (default false)` + `deletedAt: Date|null`. Булево поле нужно потому, что `partialFilterExpression` надёжно поддерживает равенство по Boolean, но не равенство по `null` |
| `businessId` | `ObjectId`, **required, indexed**, во всех бизнес-зависимых коллекциях. Источник значения — только сессия/публичный контекст (см. MASTER_ARCHITECTURE §9), никогда тело запроса |
| Глобальные коллекции (не tenant-scoped, `tenantPlugin` не подключается) | `users`, `sessions`, `businesses`, `rateLimits`, `schemaMigrations`. Коллекции могут содержать `businessId` как поле-ссылку (`sessions.businessId` — активный бизнес сессии, см. §2), но запросы к ним не фильтруются по бизнесу. <!-- CHANGED: after stage 1 --> |
| Версионирование | `optimisticConcurrency: true` на `appointments`, `payments`, `settings`, `staffSchedules` (`__v`) |
| Строки | `trim`, максимальные длины указаны; пустая строка → `undefined` |
| Неизвестные поля | `strict: 'throw'` для моделей; на уровне API — Zod `.strict()` |
| Индексы | создаются только скриптом миграций (`autoIndex: false` везде, кроме тестов) |
| Кросс-бизнес связи | MongoDB не имеет FK. Защита: (1) репозитории принимают `TenantContext`, (2) сервис загружает все связанные документы **с тем же `businessId`** до записи, (3) tenant-plugin Mongoose отвергает запрос без `businessId` в фильтре, (4) тесты Business A vs B |

### Tenant-plugin (требование к Mongoose)

Каждая бизнес-схема подключает `tenantPlugin`. Он:
- добавляет `businessId` (required, `ObjectId`, immutable после создания);
- в хуках `find`, `findOne`, `findOneAndUpdate`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `countDocuments`, `aggregate` **бросает `TenantGuardError`**, если в фильтре (или в первом `$match` aggregate) нет `businessId`;
- для схем с мягким удалением по умолчанию подмешивает `isDeleted: false`, если вызывающий явно не передал `includeDeleted`.

Глобальные коллекции помечаются `tenantExempt: true` в одном месте (`src/server/db/tenant-exempt.ts`).

---

## 1. users (глобальная)

Аккаунт человека. Один пользователь может состоять в нескольких бизнесах через `businessMembers`.

| Поле | Тип | Обяз. | Default | Правила |
|---|---|---|---|---|
| email | String | да | — | как введён, trim, ≤254 |
| emailNormalized | String | да | — | lowercase(email), unique |
| emailVerified | Boolean | да | `false` | подтверждён ли контроль над адресом |
| emailVerificationCodeHash | String | нет | null | HMAC-SHA256 кода подтверждения, без сырого кода |
| emailVerificationExpiresAt | Date | нет | null | +15 минут |
| emailVerificationAttempts | Number | да | `0` | не более 5 неверных проверок на код |
| passwordHash | String | нет | null | argon2id; `null` пока статус `invited` |
| name | String | да | — | 1–120 |
| locale | String enum `ru` | да | `ru` | зарезервировано под `en` |
| status | enum `active`,`invited`,`disabled` | да | `active` | |
| lastLoginAt | Date | нет | null | |
| passwordChangedAt | Date | нет | null | при смене — удалить все другие `sessions` пользователя |
| passwordResetTokenHash | String | нет | — | HMAC токена сброса |
| passwordResetExpiresAt | Date | нет | — | +60 минут |

Индексы: `unique {emailNormalized:1}`; `{passwordResetTokenHash:1}` partial `{passwordResetTokenHash:{$exists:true}}`.
Soft delete: нет (статус `disabled`).

## 2. sessions (глобальная)

| Поле | Тип | Обяз. | Default | Правила |
|---|---|---|---|---|
| tokenHash | String | да | — | HMAC-SHA256(token, TOKEN_PEPPER); сам токен только в cookie |
| userId | ObjectId→users | да | — | |
| businessId | ObjectId→businesses | да (MVP) | — | активный бизнес; в MVP у пользователя ровно одно членство, поэтому задаётся при входе всегда (`null`-состояние появится вместе с переключением бизнесов post-MVP) <!-- CHANGED: A2 -->|
| ip | String | нет | — | ≤64 |
| userAgent | String | нет | — | ≤256, усечённый |
| lastSeenAt | Date | да | now | обновляется не чаще раза в 10 мин |
| expiresAt | Date | да | now+14д | скользящее окно |
| absoluteExpiresAt | Date | да | now+90д | жёсткий предел |

Индексы: `unique {tokenHash:1}`; `{userId:1}`; **TTL** `{expiresAt:1}` с `expireAfterSeconds: 0`.
Проверка при каждом запросе: `now < expiresAt && now < absoluteExpiresAt`, пользователь `active`, членство `active` (см. §5).

## 3. businesses (глобальная)

| Поле | Тип | Обяз. | Default | Правила |
|---|---|---|---|---|
| name | String | да | — | 2–120 |
| slug | String | да | — | `^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$`, 3–40, unique; список зарезервированных (`app`,`api`,`login`,`register`,`b`,`admin`,`static`…) запрещён; **неизменяем после создания** в MVP |
| timezone | String | да | — | валидный IANA (проверка через luxon `IANAZone.isValidZone`) |
| currency | String | да | — | ISO 4217 из белого списка MVP: `RUB`,`KZT`,`KGS`,`USD`,`EUR` |
| countryCode | String enum `RU`,`KZ`,`KG`,`US`,`OTHER` | да | — | страна бизнеса; определяет регион разбора телефонов (`phoneNormalized`, §12). `OTHER` — телефон вводится только в международном формате с `+`. **indexed** <!-- CHANGED: A1 --> |
| phone | String | нет | — | нормализуется |
| email | String | нет | — | |
| address | String | нет | — | ≤300 |
| publicDescription | String | нет | — | ≤1000 |
| status | enum `active`,`suspended`,`closed` | да | `active` | не-`active` бизнес для публичной записи = как несуществующий (404) |

Индексы: `unique {slug:1}`; `{countryCode:1}` <!-- CHANGED: A1 -->.
Смена `timezone` разрешена только owner и только если нет будущих записей в статусах `pending`/`confirmed` (иначе 409 `TIMEZONE_CHANGE_BLOCKED`).

## 4. settings (по одному документу на бизнес)

| Поле | Тип | Default | Правила |
|---|---|---|---|
| businessId | ObjectId | — | unique |
| booking.publicEnabled | Boolean | true | |
| booking.slotStepMinutes | Number enum 5,10,15,20,30,60 | 15 | шаг сетки слотов |
| booking.minNoticeMinutes | Number | 120 | 0–10080 |
| booking.maxAdvanceDays | Number | 60 | 1–365 |
| booking.autoConfirm | Boolean | true | true → новая публичная запись `confirmed`, иначе `pending` |
| booking.cancellationWindowHours | Number | 12 | клиент может отменить/перенести не позже чем за N часов до начала; 0–168 |
| booking.customerRescheduleLimit | Number | 2 | 0–10 |
| notifications.emailEnabled | Boolean | true | |
| notifications.confirmationEnabled | Boolean | true | |
| notifications.changeEnabled | Boolean | true | |
| notifications.cancellationEnabled | Boolean | true | |
| notifications.reminder24hEnabled | Boolean | true | |
| notifications.reminder1hEnabled | Boolean | true | |
| notifications.followUpEnabled | Boolean | true | |
| notifications.followUpDelayMinutes | Number | 120 | 15–2880 |
| notifications.senderName | String | name бизнеса | ≤80 |
| notifications.replyTo | String | email бизнеса | валидный email |
| privacy.masterSeesCustomerPhone | Boolean | true | см. PERMISSIONS_MATRIX |
| privacy.dataRetentionDays | Number (целое) | 730 | 30–3650. **Информационное поле: в MVP автоматическая очистка/анонимизация не выполняется** (задача очистки — post-MVP). Не вводить в заблуждение: в UI подпись «не применяется автоматически» <!-- CHANGED: A1 --> |
| privacy.consentText | String | `""` (пусто → UI показывает стандартный текст из словаря) | ≤2000; показывается на шаге подтверждения публичной записи (PUB-01 → `consent.text`) <!-- CHANGED: A1 --> |
| privacy.requireConsent | Boolean | true | true → `acceptPrivacy:true` обязателен в PUB-06 и сохраняется `appointments.privacyAcceptedAt`; false → согласие не запрашивается <!-- CHANGED: A1 --> |

Индексы: `unique {businessId:1}`. Документ создаётся при регистрации бизнеса с defaults. Частичные обновления — только через `$set` по точечным путям.

## 5. businessMembers

Доступ пользователя в бизнес + роль.

| Поле | Тип | Обяз. | Правила |
|---|---|---|---|
| businessId | ObjectId | да | |
| userId | ObjectId→users | да | |
| role | enum `owner`,`admin`,`master` | да | |
| staffId | ObjectId→staff | `master`: да; иначе нет | сотрудник, чьё расписание видит master |
| status | enum `active`,`invited`,`disabled` | да | default `invited` для приглашённых, `active` для owner |
| inviteTokenHash | String | нет | HMAC токена приглашения |
| inviteExpiresAt | Date | нет | +7 дней |
| invitedBy | ObjectId→users | нет | |
| joinedAt | Date | нет | |

Индексы:
- `unique {businessId:1, userId:1}`;
- **MVP: один пользователь — один бизнес:** `unique {userId:1}` **по всем статусам** (`active`, `invited`, `disabled`). Это **ограничение MVP**, а не целевая модель. В post-MVP (переключение бизнесов) индекс заменяется миграцией на `unique {userId:1}` с `partialFilterExpression: {status:'active'}` (одно активное членство; `invited` и `disabled` пользователя не блокируют). **Осознанное решение MVP:** пользователь, чьё членство получило статус `disabled` (например, уволенный master), **не сможет присоединиться к другому бизнесу** (попытка приглашения даёт `409 EMAIL_TAKEN`), пока индекс не заменён; обходного пути в MVP нет. <!-- CHANGED: A1 -->;
- **ровно один владелец**: `unique {businessId:1}` partial `{role:'owner', status:'active'}`;
- `unique {businessId:1, staffId:1}` partial `{staffId:{$exists:true}}` (один staff — один логин);
- `unique {inviteTokenHash:1}` partial `{inviteTokenHash:{$exists:true}}`.
**В MVP пользователь может состоять только в одном бизнесе** (модель `businessMembers` many-to-many — задел на будущее). Приглашение пользователя, email которого уже принадлежит члену другого бизнеса, отклоняется (`409 EMAIL_TAKEN`) <!-- CHANGED: A1 -->.
Soft delete: нет (`status: disabled`). Передача владения — отдельная транзакция из двух апдейтов (owner→admin, admin→owner) внутри Mongo-транзакции.

## 6. staff

| Поле | Тип | Обяз. | Default | Правила |
|---|---|---|---|---|
| businessId | ObjectId | да | | |
| displayName | String | да | | 2–80 |
| email | String | нет | | |
| phone | String | нет | | |
| bio | String | нет | | ≤1000, публичное |
| color | String enum из 8 цветов палитры календаря (DESIGN_SYSTEM §Календарь) | да | автоподбор | |
| isActive | Boolean | да | true | неактивный не доступен для записи и не показывается публично |
| acceptsOnlineBooking | Boolean | да | true | |
| displayOrder | Number | да | 0 | |
| bookingVersion | Number | да | 0 | счётчик для сериализации записи/блокировок (см. §17) |
| isDeleted / deletedAt | | | false/null | |

Индексы: `{businessId:1, isDeleted:1, isActive:1, displayOrder:1}`.
Деактивация: `isActive=false`; будущие записи остаются, UI предлагает перенести/отменить. Деактивация с будущими активными записями → ответ содержит предупреждение `futureAppointmentsCount`, требуется `confirm=true`.

## 7. staffSchedules (один документ на сотрудника)

| Поле | Тип | Правила |
|---|---|---|
| businessId, staffId | ObjectId | `unique {businessId:1, staffId:1}` |
| weekly | Array(≤7) of `{ isoWeekday:1..7, intervals:[{start,end}], breaks:[{start,end}] }` | отсутствие дня = выходной |
| timezoneOverride | — | **не поддерживается** (используется timezone бизнеса) |

Правила валидации (`ScheduleValidator`):
1. `HH:mm`, кратно 5 минутам; `start < end`;
2. ≤3 интервала в день, не пересекаются, отсортированы;
3. каждый перерыв целиком внутри одного интервала; перерывы не пересекаются;
4. `isoWeekday` уникален в массиве.

## 8. staffExceptions

Замена рабочего плана на конкретную локальную дату (идея reference: исключение **полностью заменяет** день).

| Поле | Тип | Правила |
|---|---|---|
| businessId, staffId | ObjectId | |
| date | String `YYYY-MM-DD` | локальная дата бизнеса |
| kind | enum `day_off`,`custom` | |
| intervals, breaks | как в §7 | обязательны и непусты при `custom`; пусты при `day_off` |
| reason | String ≤200 | |

Индексы: `unique {businessId:1, staffId:1, date:1}`; `{businessId:1, date:1}`.

## 9. blockedPeriods

Блокировка времени конкретного сотрудника. Блок «на весь бизнес» = веер по всем активным сотрудникам с общим `groupId` (сознательное упрощение, ADR-009).

| Поле | Тип | Правила |
|---|---|---|
| businessId, staffId | ObjectId | staffId обязателен |
| startAt, endAt | Date (UTC) | `endAt > startAt`, кратно 5 мин, длительность ≤ 31 день |
| reason | String ≤200 | |
| groupId | ObjectId | нет у одиночных блоков |
| createdBy | ObjectId→users | |

Индексы: `{businessId:1, staffId:1, startAt:1, endAt:1}`; `{businessId:1, groupId:1}` partial `{groupId:{$exists:true}}`.
Создание блока, пересекающего активные записи → 409 `BLOCK_CONFLICTS_WITH_APPOINTMENTS` (со списком id). Новые сотрудники, созданные позже, веером не покрываются (UI предупреждает).

## 10. services

| Поле | Тип | Обяз. | Default | Правила |
|---|---|---|---|---|
| businessId | ObjectId | да | | |
| name | String | да | | 2–120 |
| nameNormalized | String | да | | lowercase, для уникальности |
| description | String | нет | | ≤1000 |
| durationMinutes | Number | да | | 5–720, кратно 5 |
| bufferMinutes | Number | да | 0 | 0–120, кратно 5; идёт **после** услуги |
| priceMinor | Number | да | | целое ≥0 |
| currency | String | да | = business.currency | в MVP обязана совпадать с валютой бизнеса |
| onlineBookingEnabled | Boolean | да | true | |
| isActive | Boolean | да | true | |
| displayOrder | Number | да | 0 | |
| isDeleted / deletedAt | | | | |

Индексы: `unique {businessId:1, nameNormalized:1}` partial `{isDeleted:false}`; `{businessId:1, isDeleted:1, isActive:1, displayOrder:1}`.
Изменение цены/длительности **не меняет** существующие записи (у записи есть снимок, §12).

## 11. staffServices

| Поле | Тип | Правила |
|---|---|---|
| businessId, staffId, serviceId | ObjectId | оба референса принадлежат тому же `businessId` (проверка в сервисе) |

Индексы: `unique {businessId:1, staffId:1, serviceId:1}`; `{businessId:1, serviceId:1}`.
Hard delete допустим (связь без истории). Замена списка услуг мастера — `PUT` целиком, в транзакции.

## 12. customers

| Поле | Тип | Обяз. | Правила |
|---|---|---|---|
| businessId | ObjectId | да | клиент одного бизнеса независим от «такого же» в другом |
| firstName | String | да | 1–80 |
| lastName | String | нет | ≤80 |
| phone | String | да | как введён |
| phoneNormalized | String | да | E.164 через libphonenumber-js; регион разбора — `businesses.countryCode` (для `OTHER` номер обязан начинаться с `+`). **При смене `countryCode` существующие `phoneNormalized` автоматически не пересчитываются** <!-- CHANGED: A1 --> |
| email | String | нет | |
| emailNormalized | String | нет | lowercase |
| contacts | Array(≤10) `{type: enum telegram,whatsapp,instagram,other; value ≤120}` | нет | «другие контакты» |
| notes | String | нет | ≤4000, внутренние заметки (не видны master) |
| searchTokens | [String] | да | lowercase слова имени/фамилии + цифры телефона; перестраивается при изменении |
| source | enum `internal`,`public` | да | |
| isDeleted / deletedAt | | | |

Индексы:
- `unique {businessId:1, phoneNormalized:1}` partial `{isDeleted:false}`;
- `{businessId:1, emailNormalized:1}` partial `{emailNormalized:{$exists:true}}`;
- `{businessId:1, searchTokens:1}` (поиск префиксом `^q`);
- `{businessId:1, createdAt:-1}` (метрика «новые клиенты»).
Производные величины (число визитов, последний/следующий визит, сумма оплат) **не хранятся**, считаются агрегацией по `appointments` и `transactions` (нет рассинхронизации; см. API CUS-03).
Удаление клиента (soft) запрещено при будущих активных записях (409).

## 13. appointments

| Поле | Тип | Обяз. | Правила |
|---|---|---|---|
| businessId | ObjectId | да | |
| customerId | ObjectId→customers | да | |
| staffId | ObjectId→staff | да | |
| serviceId | ObjectId→services | да | |
| startAt | Date UTC | да | кратно 5 мин |
| endAt | Date UTC | да | `startAt + serviceSnapshot.durationMinutes` |
| bufferMinutes | Number | да | снимок из услуги |
| blockedUntilAt | Date UTC | да | `endAt + bufferMinutes` |
| occupiedKeys | [String] | **условно** | ключи 5-минутных ячеек `"<staffId>:<n>"` для диапазона `[startAt, blockedUntilAt)`, `n = floor(epochMinutes/5)`. Присутствует **только** у статусов `pending`,`confirmed`,`completed`; у `cancelled`,`no_show` поле **удаляется** (`$unset`). См. §17 |
| status | enum `pending`,`confirmed`,`completed`,`cancelled`,`no_show` | да | |
| source | enum `public`,`internal` | да | |
| serviceSnapshot | `{name, durationMinutes, priceMinor, currency}` | да | |
| contactEmail | String | нет | email, указанный при записи; на него уходят уведомления |
| customerNote | String ≤500 | нет | комментарий клиента |
| internalNote | String ≤2000 | нет | заметка админа (не видна master) |
| visitNote | String ≤2000 | нет | заметка мастера после визита |
| manageTokenHash | String | нет | HMAC токена управления (только public-записи и по желанию internal) |
| manageTokenExpiresAt | Date | нет | `startAt + 24ч` |
| rescheduleCount | Number | да | default 0 (счётчик переносов **клиентом**) |
| privacyAcceptedAt | Date | нет | момент согласия с обработкой данных; обязателен для `source=public` |
| idempotencyKey | String | нет | ≤80 |
| cancelledAt, cancelledBy (`customer`,`staff`,`system`), cancelReason ≤300 | | нет | |
| completedAt | Date | нет | |
| createdBy | ObjectId→users | нет | null для публичных |

Нет мягкого удаления: записи не удаляются, только отменяются.

**Инвариант (обязателен):** `occupiedKeys` обязан быть пересчитан при **любом** изменении `startAt`, `endAt` или `bufferMinutes` (а также удалён/восстановлен при смене статуса на неактивный/активный). Изменение этих полей без пересчёта ключей — дефект; пересчёт и запись выполняются одним `updateOne` одного документа. <!-- CHANGED: A1 -->

Индексы:
- `{businessId:1, staffId:1, startAt:1}` (календарь, доступность);
- `{businessId:1, startAt:1, status:1}`;
- `{businessId:1, status:1, startAt:1}` (дашборд);
- `{businessId:1, customerId:1, startAt:-1}`;
- `{businessId:1, serviceId:1, startAt:1}`;
- `unique {occupiedKeys:1}` partial `{occupiedKeys:{$exists:true}}` — **жёсткий запрет пересечений на уровне БД**;
- `unique {manageTokenHash:1}` partial `{manageTokenHash:{$exists:true}}`;
- `unique {businessId:1, idempotencyKey:1}` partial `{idempotencyKey:{$exists:true}}`.

Допустимые переходы статусов — BOOKING_ENGINE_SPEC §9.

## 14. payments

| Поле | Тип | Обяз. | Правила |
|---|---|---|---|
| businessId | ObjectId | да | |
| appointmentId | ObjectId | да | в MVP оплата всегда привязана к записи |
| customerId | ObjectId | да | копируется с записи, должен совпадать |
| staffId | ObjectId | да | копируется с записи (фильтры дашборда) |
| amountMinor | Number | да | целое >0 |
| refundedMinor | Number | да | default 0, `0 ≤ refundedMinor ≤ amountMinor` |
| currency | String | да | = валюта бизнеса |
| method | enum `cash`,`card`,`transfer`,`online` | да | |
| status | enum `pending`,`paid`,`refunded`,`cancelled` | да | см. PAYMENTS_SPEC |
| paidAt | Date | нет | обязателен при `paid`/`refunded` |
| notes | String ≤500 | нет | |
| idempotencyKey | String ≤80 | нет | защита от двойной отправки формы |
| createdBy | ObjectId→users | да | |

Индексы: `{businessId:1, appointmentId:1}`; `{businessId:1, status:1, paidAt:-1}`; `{businessId:1, customerId:1, paidAt:-1}`; `unique {businessId:1, idempotencyKey:1}` partial `{idempotencyKey:{$exists:true}}`.
Удаления нет. Изменение `amountMinor` после перехода в `paid` запрещено.

## 15. transactions (append-only)

Неизменяемый журнал движения денег.

| Поле | Тип | Правила |
|---|---|---|
| businessId, paymentId, appointmentId, customerId, staffId | ObjectId | |
| type | enum `charge`,`refund` | |
| direction | enum `in`,`out` | `charge→in`, `refund→out` |
| amountMinor | Number | целое >0 |
| currency, method | | копируются с платежа |
| occurredAt | Date | момент операции |
| note | String ≤500 | причина возврата |
| createdBy | ObjectId→users | |

Индексы: `{businessId:1, occurredAt:-1}`; `{businessId:1, paymentId:1}`; `{businessId:1, method:1, occurredAt:-1}`; `{businessId:1, customerId:1, occurredAt:-1}`; `{businessId:1, staffId:1, occurredAt:-1}`.
Неизменяемость: в Mongoose pre-hooks на `updateOne/updateMany/findOneAndUpdate/deleteOne/deleteMany/replaceOne/save(existing)` бросают `ImmutableDocumentError`; в production рекомендуется пользователь БД без прав `update`/`remove` на эту коллекцию.

## 16. notifications

| Поле | Тип | Обяз. | Правила |
|---|---|---|---|
| businessId | ObjectId | да | |
| appointmentId | ObjectId | нет | нет у `staff_invite`, `password_reset` |
| customerId | ObjectId | нет | |
| channel | enum `email`,`sms`,`push` | да | в MVP реально работает только `email` |
| kind | enum `appointment_confirmed`,`appointment_changed`,`appointment_cancelled`,`reminder_24h`,`reminder_1h`,`followup_after_visit`,`staff_invite`,`password_reset`,`email_verification` | да | |
| recipient | `{email?, phone?, name?}` | да | |
| status | enum `scheduled`,`processing`,`sent`,`failed`,`cancelled`,`skipped` | да | основные по ТЗ: `scheduled`,`sent`,`failed`; остальные — служебные |
| scheduledFor | Date | да | |
| nextAttemptAt | Date | да | = scheduledFor изначально |
| attempts | Number | да | default 0 |
| maxAttempts | Number | да | default 5 |
| lockedUntil | Date | нет | аренда воркера (5 мин) |
| lockedBy | String | нет | id воркера |
| lastError | String ≤500 | нет | без секретов/PII-дампов |
| sentAt | Date | нет | |
| providerMessageId | String | нет | |
| templateData | Mixed | нет | снимок для немедленных событий (`changed`,`cancelled`,`invite`,`reset`); для напоминаний не хранится — рендер при отправке по актуальной записи |
| dedupeKey | String | да | unique, формат в NOTIFICATIONS_SPEC §5 |

Индексы: `unique {dedupeKey:1}`; `{status:1, nextAttemptAt:1}` (выборка воркером; глобальная, без businessId — воркер обходит бизнесы, каждая обработка далее работает в контексте `notification.businessId`); `{businessId:1, createdAt:-1}`; `{businessId:1, appointmentId:1}`; `{businessId:1, status:1, createdAt:-1}`.
Поле `expireAt: Date` (необязательное) ставится при переходе в `sent`, `cancelled` или `skipped` (= момент + 400 дней); **TTL-индекс** `{expireAt:1}` с `expireAfterSeconds: 0`. У `failed` и активных статусов поля нет — они не удаляются.
Исключение из tenant-guard: единственный глобальный запрос — `claimNextBatch` воркера (помечен явно, ADR-010).

## 17. Защита от двойного бронирования (MongoDB)

MongoDB не имеет exclusion constraint, поэтому используется комбинация из трёх слоёв.

**Слой 1 — жёсткий запрет в БД (основной).** У активной записи (`pending`,`confirmed`,`completed`) есть массив `occupiedKeys` — ключи 5-минутных ячеек занятого диапазона `[startAt, endAt+buffer)`:
`key = "<staffId>:<floor(utcEpochMinutes / 5)>"`.
Уникальный partial-индекс по `occupiedKeys` (multikey) гарантирует: **две активные записи одного мастера с пересекающимися занятыми диапазонами не могут быть сохранены** — вторая вставка/апдейт падает с `E11000` → API отвечает `409 SLOT_UNAVAILABLE`. Это работает без транзакции и под любой конкуренцией. Ключ включает `staffId`, поэтому коллизий между мастерами/бизнесами нет.
- Отмена/неявка: `$unset occupiedKeys` (освобождает слот).
- Перенос: единичный `updateOne` с новыми `startAt`, `endAt`, `blockedUntilAt`, `occupiedKeys`; при `E11000` старое время остаётся (атомарность одного документа).
- Размер: услуга 3 ч + буфер 15 мин = 39 ключей (приемлемо; максимум 720+120 мин → 168 ключей).
- Следствие: все времена записей кратны 5 минутам; сетка слотов (`slotStepMinutes`) кратна 5.

**Слой 2 — транзакция для согласованности нескольких документов.** Создание записи выполняется в Mongo-транзакции (нужен replica set): `$inc staff.bookingVersion` (сериализация с изменениями расписания/блокировок этого мастера через write-conflict) → повторная проверка рабочего времени/блокировок внутри транзакции → поиск/создание клиента → вставка `appointments` → вставка `notifications`. При `TransientTransactionError` — до 3 повторов.

**Слой 3 — проверка до записи.** `BookingEngine.isSlotAvailable` (чистая функция) отсекает заведомо занятые слоты и даёт быстрый `409`, не нагружая БД.

Альтернативы, отклонённые: (a) только проверка «найти пересечение, затем вставить» — гонка; (b) коллекция блокировок с TTL — лишняя сущность, сложнее чистка; (c) глобальный лок на бизнес — лишняя конкуренция. Блоки (`blockedPeriods`) и расписание защищены слоем 2 (они меняются редко).

## 18. auditLogs

| Поле | Тип | Правила |
|---|---|---|
| businessId | ObjectId | |
| actorUserId | ObjectId | null для системных |
| actorRole | enum `owner`,`admin`,`master`,`system`,`customer` | |
| action | String enum: `member.invited`,`member.role_changed`,`member.disabled`,`ownership.transferred`,`staff.deactivated`,`service.deleted`,`customer.deleted`,`payment.created`,`payment.refunded`,`payment.cancelled`,`appointment.cancelled`,`settings.updated`,`auth.login_failed_limit`,`auth.password_changed` | |
| entityType, entityId | String / ObjectId | |
| metadata | Mixed ≤4 КБ | запрещены пароли, токены, полные email-тела |
| ip | String | |

Индексы: `{businessId:1, createdAt:-1}`; `{businessId:1, action:1, createdAt:-1}`; **TTL** по `createdAt` 730 дней. Только вставка.

## 19. Технические коллекции

**rateLimits** (глобальная): `key` (String, unique), `count` (Number), `expiresAt` (Date, TTL `expireAfterSeconds:0`). Инкремент через `findOneAndUpdate` с `upsert` и `$inc`.
**schemaMigrations** (глобальная): `id` (String unique, `NNN_name`), `appliedAt`, `checksum`. Используется скриптом миграций, который создаёт индексы и вносит изменения схемы.

## 20. Связи (сводка)

```
users 1─* businessMembers *─1 businesses 1─1 settings
businessMembers *─0..1 staff   (только role=master)
businesses 1─* staff 1─1 staffSchedules ; staff 1─* staffExceptions ; staff 1─* blockedPeriods
staff *─* services  (через staffServices)
businesses 1─* customers
appointments *─1 customers, *─1 staff, *─1 services
payments *─1 appointments ; transactions *─1 payments
notifications *─0..1 appointments
```
Все связи **внутри одного businessId** (кроме `users`↔`businessMembers`).
