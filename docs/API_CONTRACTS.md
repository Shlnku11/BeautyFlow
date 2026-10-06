# API_CONTRACTS.md — Контракты API

Контракты — единственный источник для реализации и тестов. Имена полей — из DATA_MODEL_MONGODB.md, ключи прав — из PERMISSIONS_MATRIX.md. UI_UX_SPEC ссылается на **ID эндпоинтов** (`AUTH-01` …).

<!-- CHANGED: A2 -->
**Объём MVP.** Всего описано 85 эндпоинтов; в MVP реализуются **66**, остальные 19 помечены **post-MVP** и в реестр маршрутов MVP **не попадают** (контракт сохраняется для будущего). Полная таблица «ID → MVP / приоритет / этап» — `docs/MVP_SCOPE.md`. Эндпоинт без пометки `post-MVP` — MVP.

## 0. Общие соглашения

**База:** все пути под `/api`. Route Handlers: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Формат — JSON UTF-8. Мутации требуют `Content-Type: application/json` (иначе `415`).

**Контекст бизнеса (колонка Context):**
- `SESSION` — cookie-сессия → `session.businessId` → активное членство → `TenantContext{userId, businessId, role, staffId}`;
- `SLUG` — публичный `slug` → `businesses` со `status=active`; иначе `404`;
- `TOKEN` — токен управления → запись → её `businessId`;
- `CRON` — заголовок `Authorization: Bearer ${CRON_SECRET}` (constant-time сравнение);
- `NONE` — бизнес не нужен (регистрация, вход).
`businessId` **никогда** не читается из тела, query или заголовков клиента.

**Конверт успеха:** `{ "data": <payload>, "meta"?: { page, limit, total } }`. Пагинация: `?page=1&limit=25` (limit ≤ 100, по умолчанию 25).
**Конверт ошибки:** `{ "error": { "code": "STRING", "message": "ru-текст", "details"?: [...], "requestId": "uuid" } }`. Заголовок `X-Request-Id` в каждом ответе.

**Коды:** `200` ок · `201` создано · `204` без тела · `400 BAD_REQUEST` (битый JSON) · `401 UNAUTHENTICATED` · `403 FORBIDDEN` · `404 NOT_FOUND` · `409 CONFLICT`/доменные (`SLOT_UNAVAILABLE`, `INVALID_STATUS_TRANSITION`, …) · `415 UNSUPPORTED_MEDIA_TYPE` · `422 VALIDATION_ERROR` · `429 RATE_LIMITED` (+`Retry-After`) · `500 INTERNAL` (без деталей).

**Политика изоляции:** объект другого бизнеса → `404`. Объект своего бизнеса, но вне области master (`own`) → `404`. Запрещённое роли действие в своём бизнесе → `403`.
**Strict-тела:** схемы Zod `.strict()`; любое неизвестное поле (в т.ч. `businessId`, `role`, `status` где не разрешено) → `422`.
**CSRF:** мутации с cookie-сессией проверяют `Origin` (или `Referer`) = `APP_BASE_URL`, иначе `403 CSRF_ORIGIN_MISMATCH`; cookie `SameSite=Lax`.
**Cookie сессии:** имя `SESSION_COOKIE_NAME` (по умолчанию `na_sid`), `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`, `Max-Age` = `SESSION_TTL_DAYS`.
**Идемпотентность:** заголовок `Idempotency-Key` (≤80 симв.) поддерживают `PUB-06`, `APT-02`, `PAY-02`.
**Деньги:** `{ amountMinor: int, currency: "RUB" }`. **Даты:** ISO UTC (`2026-11-03T07:00:00.000Z`); локальные даты `YYYY-MM-DD`.

**Политики rate limit** (ключ → лимит; хранение в `rateLimits`):
`RL-LOGIN` 5 неудач/15 мин на (ip+email) и 30 запросов/15 мин на ip · `RL-REGISTER` 3/час на ip · `RL-RESET` 3/час на email, 10/час на ip · `RL-PUBLIC-READ` 60/мин на ip · `RL-PUBLIC-BOOK` 5/10 мин на ip и 3/час на (business, phoneNormalized) · `RL-MANAGE` 10/10 мин на ip и на токен · `RL-API` 300/мин на пользователя (все аутентифицированные) · `RL-JOB` — нет, защита секретом.

**Стандартные тесты (ST):** ST-1 без сессии → 401 · ST-2 роль без права → 403 · ST-3 объект бизнеса B под сессией A → 404 · ST-4 `businessId` в теле → 422 и данные не изменились · ST-5 невалидные поля → 422 с `details` · ST-6 превышение лимита → 429. В блоках указаны только применимые ST и специфичные тесты.

**Правило наследования (нормативное).** Если в блоке эндпоинта поле не указано, действует значение по умолчанию:
- **Auth:** для `/api/public/**` — без аутентификации; для `/api/internal/jobs/**` — `CRON`; для остальных — cookie-сессия (`401` без неё).
- **Rate limit:** `SESSION`-эндпоинты — `RL-API`; публичные GET — `RL-PUBLIC-READ`; публичные `manage/*` — `RL-MANAGE`; `SYS-01` — без лимита.
- **Business isolation:** (а) репозиторий всегда фильтрует по `ctx.businessId`; (б) каждый `:id` и каждая ссылка в теле/query (`customerId`, `staffId`, `serviceId`, `appointmentId`, `staffIds`, `serviceIds`, …) загружается с тем же `businessId`, иначе `404` и **ничего не записывается**; (в) для master дополнительно фильтр `own`; (г) для публичных — бизнес только из `slug`/токена; ответы не содержат данных других бизнесов.
- **Коды ошибок:** к перечисленным в блоке всегда добавляются применимые общие: `401`, `403` (по праву), `404` (чужой/отсутствующий объект), `422` (валидация), `429`, `500`.
- **Источник бизнеса:** `SESSION` для всех, кроме явно отмеченных (`PUB-*` → `SLUG`/`TOKEN`, `SYS-02` → `CRON`, `AUTH-01/02/06/07/08` → `NONE`).

## 1. DTO (сокращённо)

- **UserDto** `{id,name,email,emailVerified,locale}`; **MembershipDto** `{businessId,businessName,slug,role,staffId?}`.
- **CustomerDto** `{id,firstName,lastName?,phone,email?,contacts[],notes?,source,createdAt}`; **CustomerLimitedDto** (master) `{id,firstName,lastName?,phone?}`; **CustomerSummary** `{visitsCount (completed), lastVisitAt?, nextVisitAt?, totalPaidMinor (net of refunds), currency}`.
- **StaffDto** `{id,displayName,email?,phone?,bio?,color,isActive,acceptsOnlineBooking,displayOrder,serviceIds[]?}`.
- **ScheduleDto** `{weekly:[{isoWeekday,intervals:[{start,end}],breaks:[{start,end}]}]}`; **ExceptionDto** `{date,kind,intervals[],breaks[],reason?}`; **BlockedPeriodDto** `{id,staffId,startAt,endAt,reason?,groupId?}`.
- **ServiceDto** `{id,name,description?,durationMinutes,bufferMinutes,priceMinor,currency,onlineBookingEnabled,isActive,displayOrder,staffIds[]?}`.
- **AppointmentDto** `{id,customer:{id,firstName,lastName?,phone,email?},staff:{id,displayName,color},service:{id,name},startAt,endAt,blockedUntilAt,status,source,serviceSnapshot,customerNote?,internalNote?,visitNote?,rescheduleCount,payment:{paidMinor,refundedMinor,balanceMinor}}`; **AppointmentMasterDto** — без `internalNote`, `payment`, `customer.email`.
- **AppointmentPublicDto** `{id,business:{name,slug,timezone,address?,phone?},service:{name,durationMinutes,priceMinor,currency},staff:{displayName},startAt,endAt,status,canCancel,canReschedule}`.
- **SlotDto** `{startAt}` (при конкретном мастере дополнительно `staffId`).
- **PaymentDto** `{id,appointmentId,customerId,staffId,amountMinor,refundedMinor,currency,method,status,paidAt?,notes?,createdBy:{id,name},createdAt}`; **TransactionDto** `{id,paymentId,appointmentId,customerId,staffId,type,direction,amountMinor,currency,method,occurredAt,note?,createdBy:{id,name}}`.
- **NotificationDto** `{id,appointmentId?,channel,kind,status,recipient,scheduledFor,attempts,lastError?,sentAt?}`.
- **MemberDto** `{id,user:{id,name,email},role,status,staffId?,joinedAt?}`.
- **SettingsDto** `{business:{name,slug,timezone,currency,countryCode,phone?,email?,address?,publicDescription?},booking:{…},notifications:{…},privacy:{…}}` (поля — DATA_MODEL §4).
- Никогда не возвращаются: хэши паролей/токенов, `occupiedKeys`, `bookingVersion`, `searchTokens`.

---

## 2. Auth

**AUTH-01 `POST /api/auth/register-business`** — регистрация бизнеса и владельца.
Auth: нет · Permission: — · Context: `NONE` (создаёт новый).
Request: `{ businessName(2–120), slug(опц., иначе из названия), timezone(IANA), currency(RUB|KZT|KGS|USD|EUR), **countryCode(RU|KZ|KG|US|OTHER, обязателен; клиент подставляет по региону локали браузера (Intl), иначе по `APP_DEFAULT_COUNTRY_CODE`; если определить нельзя — пользователь обязан выбрать)**, ownerName, email, password(≥10, ≤128, не из топ-списка), acceptTerms:true, website:"" (honeypot) }`.
Response `201`: `{ data:{ user:UserDto, membership:MembershipDto } }` + `Set-Cookie`. Транзакция создаёт `users`, `businesses`, `settings` (defaults), `businessMembers(owner)`, `sessions` и уведомление `email_verification`; новый пользователь имеет `emailVerified=false`. Вход разрешён до подтверждения, а `AUTH-04` отдаёт флаг для ненавязчивого баннера.
Codes: 201, 409 `SLUG_TAKEN`/`EMAIL_TAKEN` (единый текст «email или адрес уже используются» не раскрывает аккаунт — для email возвращается `422` общей формулировкой), 422, 429.
Isolation: создаёт новый тенант; ничего не читает из чужих. Rate: `RL-REGISTER`.
Tests: ST-5, ST-6; honeypot≠"" → 422; дубли slug/email; зарезервированный slug; создание атомарно (сбой на шаге → ничего не сохранено); пароль слабый → 422.

**AUTH-02 `POST /api/auth/login`** — вход.
Auth: нет · Context: `NONE`.
Request: `{ email, password }`. Response `200`: `{ data:{ user:UserDto, membership:MembershipDto } }` + cookie. В MVP у пользователя одно членство; сессия сразу создаётся с его `businessId`.
Codes: 200, 401 `INVALID_CREDENTIALS` (одинаково для неизвестного email и неверного пароля; время ответа выравнивается), 403 `NO_ACTIVE_MEMBERSHIP`, 422, 429.
Isolation: сессия создаётся с `businessId` только из активного членства пользователя. Rate: `RL-LOGIN`.
Tests: ST-5, ST-6; одинаковый ответ для неизвестного email; отключённый пользователь/членство; смена сессии (новая cookie, старая при наличии удаляется); флаги cookie.

**AUTH-03 `POST /api/auth/logout`** — выход. Auth: сессия · Permission: `account:self` · Context: `SESSION`.
Request: `{}`. Response `204`, cookie очищается, документ `sessions` удаляется. Codes: 204, 401 (идемпотентно допустим 204 без сессии). Isolation: удаляет только свою сессию. Rate: `RL-API`.
Tests: после logout `AUTH-04` → 401; повторный logout не падает.

**AUTH-04 `GET /api/auth/me`** — текущий пользователь и контекст. Auth: сессия · `account:self` · `SESSION`.
Response `200`: `{ data:{ user, membership:MembershipDto, active:{ businessId, role, staffId?, business:{name,slug,timezone,currency,countryCode} }, permissions: string[] } }` (`permissions` — список ключей роли, для скрытия UI; сервер всё равно проверяет).
Codes: 200, 401. Isolation: данные только из членства текущего пользователя. Tests: ST-1; для каждой роли набор `permissions` совпадает с матрицей.

**AUTH-05 `POST /api/auth/switch-business`** · **post-MVP** — выбор/смена активного бизнеса. Auth: сессия · `account:self` · `SESSION`.
Request: `{ businessId }` (**единственное** место, где клиент называет бизнес — и только из списка собственных активных членств). Response `200`: как `AUTH-04.active`.
Codes: 200, 404 (членства нет или не активно), 422. Isolation: проверка по `businessMembers(userId, businessId, status=active)`. Tests: переключение на чужой бизнес → 404; после переключения запросы идут в новый тенант.

**AUTH-06 `POST /api/auth/accept-invite`** — принять приглашение. Auth: нет · Context: токен приглашения → членство.
Request: `{ token, name, password }`. Response `200`: `{ data:{ user, membership } }` + cookie. Активирует `users`/`businessMembers`, удаляет `inviteTokenHash`.
Codes: 200, 404 `INVITE_INVALID` (неверный/истёкший/использованный токен — одинаково), 422, 429. Rate: `RL-RESET`.
Tests: токен одноразовый; истёкший → 404; роль берётся из членства, не из тела.

**AUTH-07 `POST /api/auth/forgot-password`** — запрос сброса. Auth: нет. Request: `{ email }`. Response `202` всегда (одинаково для существующего и несуществующего). Ставит `password_reset` в очередь, если пользователь `active`. Rate: `RL-RESET`. Tests: единый ответ и время; повторные запросы не плодят токены сверх лимита.

**AUTH-08 `POST /api/auth/reset-password`** — установить новый пароль. Auth: нет. Request: `{ token, password }`. Response `200`; удаляет все сессии пользователя, ставит `passwordChangedAt`, пишет аудит. Codes: 200, 404 `RESET_INVALID`, 422, 429. Tests: токен одноразовый (TTL 60 мин); старые сессии недействительны.

**AUTH-09 `POST /api/auth/change-password`** — смена пароля. Auth: сессия · `account:self` · `SESSION`. Request: `{ currentPassword, newPassword }`. Response `204`; удаляет все **остальные** сессии. Codes: 204, 401, 403 `WRONG_PASSWORD`, 422. Rate: `RL-API`. Tests: неверный текущий → 403; остальные сессии недействительны.

**AUTH-11 `POST /api/auth/verify-email`** — подтвердить адрес владельца аккаунта. Auth: нет · Context: `NONE`. Request: `{ email, code }` (6 цифр). Response `200`: `{ data:{ emailVerified:true } }`. В `users` код хранится как HMAC-SHA256; очередь email хранит код для доставки и очищает `templateData` после результата отправки. Код действует 15 минут и допускает 5 неверных проверок; после пятой попытки код очищается, дальнейшие запросы → `429 RATE_LIMITED`. Успешное подтверждение одноразово выставляет `emailVerified=true` и удаляет hash/expiry. Неверный, просроченный, повторно использованный код или неизвестный email → единый `400 EMAIL_VERIFICATION_INVALID`. Rate: `RL-RESET`. Тесты: TTL, пять ошибочных попыток с конкурентным ограничением/429 после исчерпания, успешный код, повторное использование и изоляция разных аккаунтов A/B.

**AUTH-12 `POST /api/auth/resend-verification`** — повторно отправить код. Auth: нет · Context: `NONE`. Request: `{ email }`. Response `202` всегда с нейтральным текстом; если аккаунт существует, активен и не подтверждён — новый код и уведомление ставятся в очередь, прежние ожидающие коды аннулируются. Rate: `RL-RESET`.

### Google OAuth (необязательное расширение, не входит в MVP route matrix)

Google — дополнительный способ входа. Если `GOOGLE_CLIENT_ID` или `GOOGLE_CLIENT_SECRET` не заданы, `AUTH-14` возвращает `enabled:false`; UI показывает «Скоро», а email/password маршруты работают независимо.

**AUTH-13 `POST /api/auth/google`** — вход по Google ID token. Auth: нет · Context: `NONE`. Request: `{ idToken }`. Сервер проверяет подпись, audience, subject и `email_verified=true`; связывает `googleId` по подтверждённому email либо находит уже связанный аккаунт, затем создаёт сессию для его активного членства. Не принимает `businessId` от клиента. Codes: 200, 401 `GOOGLE_TOKEN_INVALID`, 404 `GOOGLE_ACCOUNT_NOT_FOUND`, 409 `GOOGLE_EMAIL_TAKEN`, 503 `GOOGLE_AUTH_UNAVAILABLE`, 429. Rate: `RL-LOGIN`.

**AUTH-14 `GET /api/auth/google/config`** — публичный статус кнопки OAuth. Response `200`: `{ data:{ enabled:boolean, clientId:string|null } }`. Возвращает только публичный Client ID; Client Secret не раскрывается.

**AUTH-15 `POST /api/auth/google/register-business`** — атомарная регистрация нового владельца. Auth: нет · Context: `NONE`. Request: `{ idToken, businessName, slug?, timezone, currency, countryCode, acceptTerms:true }`. Email и имя берутся только из проверенного Google ID token. В одной Mongo-транзакции создаются `users` (emailVerified=true), `businesses`, `settings`, `businessMembers(owner)` и `sessions`. Codes: 201, 401 `GOOGLE_TOKEN_INVALID`, 409 `GOOGLE_EMAIL_TAKEN`/`SLUG_TAKEN`, 422, 429. Rate: `RL-REGISTER`.

**AUTH-10 `PATCH /api/auth/me`** · **post-MVP** — обновить имя профиля. Auth: сессия · `account:self`. Request: `{ name }` (strict). Response `200 UserDto`. Tests: ST-4; email менять нельзя в MVP (422).

---

## 3. Owner / admin: члены команды, аудит

**MEM-01 `GET /api/members`** — список членов бизнеса. Auth: сессия · `members:read` (owner, admin) · `SESSION`. Query: `status`, `role`, `page`, `limit`. Response `200 MemberDto[]`. Codes: 200, 401, 403. Isolation: фильтр `businessId`. Tests: ST-1/2/3(через пересечение — члены B не видны A).

**MEM-02 `POST /api/members/invite`** · **post-MVP** — пригласить. Auth: сессия · `members:invite` (master-роль) / `members:invite_admin` (роль admin; только owner) · `SESSION`.
Request: `{ email, name, role: "admin"|"master", staffId?: id }` (для `master` `staffId` обязателен, указывает на **существующего** staff **своего** бизнеса без привязанного члена).
Response `201 MemberDto` (+ письмо `staff_invite`). Если `users` с таким email есть — создаётся только `businessMembers(status=invited)`.
Codes: 201, 403 (admin приглашает admin), 404 (`staffId` чужого бизнеса/несуществующий), 409 `ALREADY_MEMBER`/`STAFF_ALREADY_LINKED`, 422. Isolation: `staffId` проверяется с `businessId`. Rate: `RL-API`. Tests: admin→admin 403; `staffId` бизнеса B → 404; `role:"owner"` → 422; аудит `member.invited`.

**MEM-03 `PATCH /api/members/:id`** — сменить роль/статус. Auth: сессия · `members:manage_role` · `SESSION`.
**MVP:** Request (strict): `{ status: "active"|"disabled" }`. Поля `role` и `staffId` — post-MVP (в MVP новые admin не создаются; есть только owner и master) → `422`. Правила: admin и owner могут менять статус членов с ролью `master`; owner не отключается и не меняется этим эндпоинтом. <!-- CHANGED: A2 --> Отключение/понижение принудительно закрывает сессии затронутого пользователя в этом бизнесе.
Codes: 200 `MemberDto`, 403, 404, 409 `LAST_OWNER`, 422. Tests: admin пытается менять admin → 403; owner себя → 409; аудит `member.role_changed|member.disabled`.

**MEM-04 `POST /api/members/:id/resend-invite`** — повторно отправить приглашение (генерирует новый токен). Auth: `members:invite`. **MVP:** первичное приглашение создаёт `STF-02`, повторную отправку и просмотр статуса (`MEM-01`) обеспечивает этот эндпоинт. <!-- CHANGED: A2 --> Response `202`. Codes: 202, 404 (не `invited`), 429. Tests: старый токен недействителен.

**MEM-05 `POST /api/members/transfer-ownership`** · **post-MVP** — передать владение. Auth: `members:transfer_ownership` (owner). Request: `{ targetMemberId, password }`. Транзакция: owner→admin, target(admin)→owner. Response `200`. Codes: 200, 403 `WRONG_PASSWORD`, 404, 409 `TARGET_NOT_ADMIN`, 422. Isolation: target по `businessId`. Tests: после передачи ровно один owner; бывший владелец теряет owner-права; атомарность.

**AUD-01 `GET /api/audit-logs`** · **post-MVP** — журнал аудита. Auth: `audit:read` (owner) · `SESSION`. Query: `action`, `from`, `to`, `actorUserId`, `page`, `limit`. Response `200` `{id,action,actorRole,actor?:{id,name},entityType,entityId,metadata,createdAt,ip}[]`. Codes: 200, 401, 403. Tests: admin → 403; журнал B не виден A.

---

## 4. Master

**MST-01 `GET /api/master/dashboard`** — «Мой день». Auth: сессия · `dashboard:read_own` (master) · `SESSION`.
Query: `date?` (локальная дата, по умолчанию сегодня). Response `200`: `{ date, today:AppointmentMasterDto[], upcoming:AppointmentMasterDto[] (следующие 7 дней, ≤20), counts:{ todayTotal, completedThisMonth, noShowThisMonth } }` — **без денег**.
Codes: 200, 401, 403 (owner/admin используют `DSH-*`). Isolation: фильтр `businessId` + `staffId = member.staffId`.
Tests: ST-1/2; не содержит чужих записей; нет денежных полей.

**Поведение общих эндпоинтов для master** (контракты ниже, область `own`): `APT-01`, `APT-03` (только свои, `AppointmentMasterDto`), `APT-06` (только свои, только переходы master, `reason` обязателен при cancel), `APT-04` (**только** `visitNote`, остальное → 422), `CAL-01` (принудительно свой `staffId`; чужой `staffId` в query → 404), `CUS-01/03` (CustomerLimitedDto только клиенты с записями у него), `STF-03/06` (свой), `SVC-01` (привязанные к нему). Остальные эндпоинты → `403`.

---

## 5. Customers

**CUS-01 `GET /api/customers`** — список/поиск. Auth: `customers:read` (owner/admin all; master limited) · `SESSION`.
Query: `q` (≥2 символов; префиксный поиск по `searchTokens`), `hasUpcoming=true|false`, `source`, `sort=createdAt|lastName|lastVisitAt`, `order`, `page`, `limit`. Response `200 (CustomerDto+{visitsCount,lastVisitAt?,nextVisitAt?})[]` для owner/admin; `CustomerLimitedDto[]` для master.
Codes: 200, 401, 403. Isolation: `businessId`; для master дополнительно `customerId ∈ {клиенты с записями у его staffId}`. Rate: `RL-API`.
Tests: ST-1/3(поиск по телефону клиента B → пусто); master не получает email/notes/contacts; префиксный поиск; сортировка.

**CUS-02 `POST /api/customers`** — создать. `customers:write` · `SESSION`. Request: `{ firstName, lastName?, phone, email?, contacts?, notes? }`. Response `201 CustomerDto`. Codes: 201, 403, 409 `CUSTOMER_PHONE_EXISTS` (в **этом** бизнесе; details содержит `existingCustomerId`), 422. Isolation: `businessId` из контекста; уникальность в разрезе бизнеса. Tests: ST-2/4/5; тот же телефон в бизнесе B допустим и создаёт независимую запись.

**CUS-03 `GET /api/customers/:id`** — карточка. `customers:read` · `SESSION`. Response `200`: owner/admin `{ customer:CustomerDto, summary:CustomerSummary }`; master `{ customer:CustomerLimitedDto }` (summary отсутствует). Codes: 200, 403, 404 (чужой бизнес / master без записей у клиента). Tests: ST-3; summary: считает `completed` как визиты, `nextVisitAt` = ближайшая `pending|confirmed` в будущем, `totalPaidMinor` = Σcharge − Σrefund; master не видит summary.

**CUS-04 `PATCH /api/customers/:id`** — изменить. `customers:write`. Request: любое подмножество полей CUS-02 (strict). Response `200`. Codes: 200, 403, 404, 409, 422. Tests: ST-3/4; смена телефона на существующий → 409.

**CUS-05 `DELETE /api/customers/:id`** · **post-MVP** — мягкое удаление. `customers:delete`. Response `204`. Codes: 204, 403, 404, 409 `CUSTOMER_HAS_UPCOMING_APPOINTMENTS`. Аудит `customer.deleted`. Tests: ST-3; история записей/оплат остаётся; после удаления тот же телефон можно использовать снова.

**CUS-06 `GET /api/customers/:id/appointments`** — история записей клиента. `customers:read` (+`appointments:read`). Query: `status`, `from`, `to`, `page`, `limit`. Response `200 AppointmentDto[]` (master: `AppointmentMasterDto`, только его записи). Codes: 200, 403, 404. Tests: ST-3; master видит только свои визиты у клиента.

---

## 6. Staff, расписание, блокировки

**STF-01 `GET /api/staff`** — список. `staff:read` (master: только себя). Query: `isActive`, `includeDeleted=false`. Response `200 StaffDto[]`. Isolation: `businessId`. Tests: ST-1/3; master получает 1 элемент.

**STF-02 `POST /api/staff`** — создать. `staff:write` (+ `members:invite`, если указан `email`). Request: `{ displayName, email?, phone?, bio?, color?, acceptsOnlineBooking?, displayOrder? }`. Response `201 { data: StaffDto & { accessInvite: "sent"|"none" } }` + пустой `staffSchedules`.
**Flow создания master в MVP (нормативно):** owner/admin создаёт сотрудника через `STF-02`. Если указан `email`, в **той же** Mongo-транзакции система (1) создаёт `users` (`status=invited`, `passwordHash=null`) или находит существующего, (2) создаёт `businessMembers` (`role=master`, `staffId`, `status=invited`, `inviteTokenHash`, `inviteExpiresAt=+7 дней`), (3) ставит в очередь письмо `staff_invite` с открытым токеном; `accessInvite="sent"`. Без `email` членство не создаётся (`accessInvite="none"`: сотрудник существует только как календарная единица). Приём приглашения — `AUTH-06`; повторная отправка — `MEM-04`; отключение — `MEM-03`. Отдельного эндпоинта создания приглашения нет (`MEM-02` — post-MVP); администраторов в MVP создать нельзя. <!-- CHANGED: A2 -->
Codes: 201, 403, 409 `EMAIL_TAKEN` (email уже принадлежит члену этого или другого бизнеса, DATA_MODEL §5), 422. Isolation: сотрудник и членство создаются только в `ctx.businessId`. Tests: ST-2/4/5; с `email` создаются staff+member+письмо атомарно; без `email` — только staff; повторный email → 409 и ничего не создано; роль в членстве всегда `master` (поле `role` в теле → 422).

**STF-03 `GET /api/staff/:id`** — карточка. `staff:read`. Response `200 StaffDto` (с `serviceIds`). Codes: 200, 403, 404 (чужой/для master — не его). Tests: ST-3; master чужой staff → 404.

**STF-04 `PATCH /api/staff/:id`** — изменить/деактивировать. `staff:write` (деактивация — `staff:deactivate`). Request: `{ displayName?, email?, phone?, bio?, color?, isActive?, acceptsOnlineBooking?, displayOrder?, confirm? }`. Деактивация при будущих активных записях без `confirm=true` → `409 STAFF_HAS_UPCOMING_APPOINTMENTS` с `details.count`. Деактивация (`isActive=false`) **также** переводит связанное членство в `disabled` и удаляет все сессии этого пользователя (уволенный мастер теряет доступ немедленно); обратная активация членство **не** восстанавливает — для этого `MEM-03`. <!-- CHANGED: A2 -->
Response `200`. Аудит `staff.deactivated`. Tests: ST-3/4; деактивированный не виден публично и не возвращает слоты.

**STF-05 `DELETE /api/staff/:id`** · **post-MVP** — мягкое удаление. `staff:deactivate`. Условия: нет будущих активных записей, нет привязанного активного члена. Response `204`. Codes: 204, 403, 404, 409. Tests: ST-3; удалённый не в списке; прошлые записи читаются.

**STF-06 `GET /api/staff/:id/schedule`** — расписание. `staff:read`. Response `200 ScheduleDto`. Tests: ST-3; master — только свой.

**STF-07 `PUT /api/staff/:id/schedule`** — заменить расписание целиком. `staff:schedule_write`. Request `ScheduleDto` (правила DATA_MODEL §7). Response `200 { schedule, affectedAppointmentsCount }`. Транзакция с `$inc bookingVersion`. Codes: 200, 403, 404, 422. Tests: ST-2/3/4/5; пересекающиеся интервалы → 422; перерыв вне интервала → 422; будущие записи не отменяются; влияние на слоты.

**STF-08 `GET /api/staff/:id/exceptions`** — исключения. `staff:read`. Query: `from`, `to` (локальные даты). Response `200 ExceptionDto[]`. Tests: ST-3.

**STF-09 `POST /api/staff/:id/exceptions`** — создать/заменить исключение на дату. `staff:schedule_write`. Request `ExceptionDto`. Response `200|201`, `affectedAppointmentsCount`. Tests: ST-2/3/5; замена существующей даты; `custom` без интервалов → 422.

**STF-10 `DELETE /api/staff/:id/exceptions/:date`** — удалить исключение. `staff:schedule_write`. Response `204`. Codes: 204, 403, 404. Tests: ST-3; возврат к недельному плану.

**STF-11 `GET /api/staff/:id/services`** — услуги мастера. `staff:read`. Response `200 { serviceIds[] }`. Codes: 200, 403, 404. Tests: ST-1/3; master — только свой.
**STF-12 `PUT /api/staff/:id/services`** — заменить список. `staff:write`. Request `{ serviceIds[] }`; все id проверяются в бизнесе, иначе `404 SERVICE_NOT_FOUND`/`422`. Response `200`. Транзакция. Tests: ST-3; `serviceId` бизнеса B → 404 и список не изменён.

**BLK-01 `GET /api/blocked-periods`** — список блокировок. `calendar:read` (master: свои). Query: `from`, `to` (UTC), `staffId?`. Response `200 BlockedPeriodDto[]`. Tests: ST-3; master чужой `staffId` → 404.

**BLK-02 `POST /api/blocked-periods`** — создать. `blocks:write`. Request: `{ staffId | staffIds[] | allStaff:true, startAt, endAt, reason? }`. `allStaff` создаёт веер (общий `groupId`) по активным сотрудникам. Транзакция с `$inc bookingVersion` каждого. Response `201 BlockedPeriodDto[]`. Codes: 201, 403, 404, 409 `BLOCK_CONFLICTS_WITH_APPOINTMENTS` (`details.appointmentIds`), 422. Tests: ST-2/3/4/5; конфликт с записью; гонка с созданием записи (не более одной успешной операции); `staffId` чужого бизнеса → 404.

**BLK-03 `DELETE /api/blocked-periods/:id`** — удалить (`?group=true` — весь веер). `blocks:write`. Response `204`. Codes: 204, 403, 404. Tests: ST-3; слот снова доступен.

---

## 7. Services

**SVC-01 `GET /api/services`** — список. `services:read` (master: привязанные). Query: `isActive`, `staffId`. Response `200 ServiceDto[]`. Tests: ST-1/3.

**SVC-02 `POST /api/services`** — создать. `services:write`. Request: `{ name, description?, durationMinutes, bufferMinutes?, priceMinor, currency?, onlineBookingEnabled?, isActive?, displayOrder?, staffIds? }`. `currency` по умолчанию и по требованию = валюте бизнеса. Response `201`. Codes: 201, 403, 409 `SERVICE_NAME_EXISTS`, 422 (длительность не кратна 5, цена не целая, чужая валюта). `staffIds` проверяются в бизнесе. Tests: ST-2/4/5; `staffIds` бизнеса B → 404.

**SVC-03 `GET /api/services/:id`** · **post-MVP** — карточка. `services:read`. Codes: 200, 403, 404. Tests: ST-3.

**SVC-04 `PATCH /api/services/:id`** — изменить. `services:write`. Request: подмножество SVC-02 (strict). Существующие записи не меняются (снимок). Response `200 ServiceDto`. Codes: 200, 403, 404, 409 `SERVICE_NAME_EXISTS`, 422. Tests: ST-3/4; цена меняется, старая запись сохраняет `serviceSnapshot`.

**SVC-05 `DELETE /api/services/:id`** · **post-MVP** — мягкое удаление. `services:delete`. Условие: нет будущих активных записей. Response `204`. Codes: 204, 403, 404, 409. Аудит `service.deleted`. Tests: ST-3; пропадает из публичной записи.

---

## 8. Availability (внутренняя)

**AVL-01 `GET /api/availability`** — слоты для внутренней записи/переноса. Auth: сессия · `appointments:create` (owner/admin) · `SESSION`.
Query: `serviceId`, `staffId|any`, `date` (локальная `YYYY-MM-DD`), `enforceNotice=true|false` (по умолчанию `false`), `excludeAppointmentId?`. Response `200 { data:{ date, timezone, slots:SlotDto[] } }`.
Codes: 200, 403, 404 (service/staff/appointment другого бизнеса), 422. Isolation: все ссылки грузятся с `businessId`. Rate: `RL-API`.
Tests: ST-1/2/3; значения совпадают с набором тест-кейсов BOOKING_ENGINE_SPEC §13; `excludeAppointmentId` освобождает слот переносимой записи.

---

## 9. Public booking (без аутентификации)

Общее: Context `SLUG` либо `TOKEN`. Неизвестный/неактивный бизнес/выключенная онлайн-запись → одинаковый `404 NOT_FOUND`. Не возвращают e-mail/телефоны клиентов и внутренние id, кроме перечисленных. Заголовок `Cache-Control: no-store` для всего `/api/public/manage/*`.

**PUB-01 `GET /api/public/b/:slug`** — публичный профиль. Response `200 { name, slug, timezone, currency, address?, phone?, publicDescription?, bookingConfig:{ maxAdvanceDays, slotStepMinutes }, consent:{ required, text? } }` (`consent` из `settings.privacy`: `requireConsent`, `consentText`). <!-- CHANGED: A1 --> Codes: 200, 404. Rate: `RL-PUBLIC-READ`. Tests: неизвестный/`suspended` slug → одинаковый 404.

**PUB-02 `GET /api/public/b/:slug/services`** — активные услуги с `onlineBookingEnabled`, у которых есть хотя бы один доступный мастер. Response `200 {id,name,description?,durationMinutes,priceMinor,currency}[]`. Tests: скрытые/удалённые не видны; услуги бизнеса B не появляются.

**PUB-03 `GET /api/public/b/:slug/staff?serviceId=`** — мастера, оказывающие услугу, `isActive`, `acceptsOnlineBooking`. Response `200 {id,displayName,bio?}[]` (+ клиентская опция «любой мастер»). Codes: 200, 404, 422. Tests: неактивный/удалённый не виден; `serviceId` бизнеса B → 404.

**PUB-04 `GET /api/public/b/:slug/availability?serviceId=&staffId=&date=`** — слоты на дату (`staffId` — id или `any`). Правила `minNotice`/`maxAdvance` включены. Response `200 { date, timezone, slots:SlotDto[] }`. Codes: 200, 404, 422 (дата вне окна). Rate: `RL-PUBLIC-READ`. Tests: слоты = движок; вне `maxAdvanceDays` → 422; занятое не отдаётся; ограничение: нельзя узнать, кем занят слот.

**PUB-05 `GET /api/public/b/:slug/availability/days?serviceId=&staffId=&month=YYYY-MM`** — даты месяца с ≥1 слотом. Response `200 { month, days:string[] }`. Rate: `RL-PUBLIC-READ`. Tests: согласованность с PUB-04.

**PUB-06 `POST /api/public/b/:slug/appointments`** — создать запись. Заголовок `Idempotency-Key` (рекомендуется).
Request: `{ serviceId, staffId|"any", startAt, customer:{ firstName, lastName?, phone, email }, customerNote?, acceptPrivacy:true (**обязателен, если `settings.privacy.requireConsent=true`**; сервер сохраняет `privacyAcceptedAt`), website:"" (honeypot) }`.
Response `201 { data:{ appointment:AppointmentPublicDto, manageToken, manageUrl } }`.
Codes: 201, 200 (повтор с тем же ключом), 404, 409 `SLOT_UNAVAILABLE`, 422, 429. Isolation: клиент ищется/создаётся только в бизнесе слага; существующий клиент не изменяется и не раскрывается; ссылки service/staff — с `businessId` слага. Rate: `RL-PUBLIC-BOOK`.
Tests: ST-5/6; гонка 20 запросов → один 201; идемпотентность; `any`; чужие serviceId/staffId → 404; honeypot; создание клиента в A при том же телефоне в B → независимая запись; письмо поставлено в очередь; `autoConfirm=false` → `pending`.

**PUB-07 `GET /api/public/manage/:token`** — просмотр записи. Context `TOKEN`. Response `200 AppointmentPublicDto`. Codes: 200, 404. Rate: `RL-MANAGE`. Tests: неверный/истёкший/чужой токен → одинаковый 404.

**PUB-08 `GET /api/public/manage/:token/availability?date=`** — слоты для переноса (той же услуги и мастера, запись исключена из занятости). Response `200 { date, timezone, slots }`. Codes: 200, 403 `RESCHEDULE_NOT_ALLOWED`, 404. Tests: окно/лимит переносов; слоты учитывают правила.

**PUB-09 `POST /api/public/manage/:token/cancel`** — отмена. Request `{ reason? }`. Response `200 AppointmentPublicDto`. Codes: 200, 403 `CANCELLATION_WINDOW_PASSED`, 404, 409 `INVALID_STATUS_TRANSITION`. Эффекты: статус `cancelled`, слот свободен, письмо клиенту/уведомление отменено. Rate: `RL-MANAGE`. Tests: окно отмены; повторная отмена; слот освобождён.

**PUB-10 `POST /api/public/manage/:token/reschedule`** — перенос. Request `{ startAt }`. Response `200 AppointmentPublicDto`. Codes: 200, 403 (`CANCELLATION_WINDOW_PASSED`/`RESCHEDULE_LIMIT_REACHED`), 404, 409 `SLOT_UNAVAILABLE`. Rate: `RL-MANAGE`. Tests: гонка за слот; старое время сохраняется при `409`; счётчик переносов; новые напоминания.

---

## 10. Appointments (внутренние)

**APT-01 `GET /api/appointments`** — список. `appointments:read` (master own). Query: `from`, `to` (UTC), `status` (повторяемый), `staffId`, `customerId`, `serviceId`, `source`, `page`, `limit`, `sort=startAt`. Response `200 AppointmentDto[]` (master: `AppointmentMasterDto`). Isolation: `businessId`; master: `staffId = own`. Tests: ST-1/3; фильтры; master не видит чужих.

**APT-02 `POST /api/appointments`** — создать. `appointments:create`. `Idempotency-Key`. Request: `{ customerId | newCustomer:{…CUS-02}, serviceId, staffId|"any", startAt, enforceNotice?:false, status?:"pending"|"confirmed", internalNote?, customerNote?, notifyCustomer?:true }`. Response `201 AppointmentDto`. Codes: 201, 403, 404 (`customerId`/`serviceId`/`staffId` чужого бизнеса), 409 `SLOT_UNAVAILABLE`, 422. Tests: ST-2/3/4/5; гонка; чужой `customerId` → 404; уведомление при `notifyCustomer`.

**APT-03 `GET /api/appointments/:id`** — карточка. `appointments:read`. Codes: 200, 403, 404. Tests: ST-3; master чужая запись → 404; поля по роли (PERMISSIONS_MATRIX §4).

**APT-04 `PATCH /api/appointments/:id`** — заметки/поля без смены времени. `appointments:update` (owner/admin: `internalNote`, `customerNote`, `serviceId`, `staffId`*; master: **только** `visitNote` по `appointments:visit_note`). *смена услуги/мастера — проверка слота как при переносе; запись получает новый `serviceSnapshot`. Response `200`. Codes: 200, 403, 404, 409, 422. Tests: master передаёт `internalNote` → 422; чужая запись → 404; смена мастера на занятого → 409.

**APT-05 `POST /api/appointments/:id/reschedule`** — перенос (внутренний). `appointments:reschedule`. Request: `{ startAt, staffId?, enforceNotice?:false, notifyCustomer?:true }`. Response `200`. Codes: 200, 403, 404, 409 `SLOT_UNAVAILABLE`, 422. Tests: ST-2/3; атомарность `occupiedKeys`; новые уведомления.

**APT-06 `POST /api/appointments/:id/status`** — смена статуса. `appointments:status`. Request: `{ status, cancelReason?, notifyCustomer?:true }`. Допустимость — BOOKING_ENGINE_SPEC §9 и PERMISSIONS_MATRIX §3. Response `200`. Codes: 200, 403, 404, 409 `INVALID_STATUS_TRANSITION`/`SLOT_UNAVAILABLE` (восстановление), 422 (`completed` для будущего). Tests: ST-2/3; полная матрица переходов × роли; побочные эффекты (слот, уведомления).

---

## 11. Calendar

**CAL-01 `GET /api/calendar`** — данные календаря. `calendar:read` (master own). Query: `view=day|week`, `date` (локальная), `staffId?|staffIds?`. Response `200`: `{ range:{from,to,timezone}, staff:[{id,displayName,color}], appointments:AppointmentDto[] (status≠cancelled по умолчанию; `includeCancelled=true`), blockedPeriods:BlockedPeriodDto[], workingIntervals:[{staffId,date,intervals:[{start,end}]}], load:[{staffId,bookedMinutes,availableMinutes,loadPercent}] }`.
Codes: 200, 403, 404 (`staffId` чужой/не свой для master), 422. Isolation: `businessId`; master принудительно `staffId=own`. Rate: `RL-API`.
Tests: ST-1/3; границы дня/недели в поясе бизнеса; DST-неделя; формула загрузки = DASHBOARD_SPEC §3.5; master не получает чужих.

---

## 12. Payments и transactions

**PAY-01 `GET /api/payments`** — список. `payments:read`. Query: `from`, `to` (по `paidAt`/`createdAt` для pending), `method`, `status`, `staffId`, `customerId`, `q` (имя/телефон клиента → через `customers`), `page`, `limit`. Response `200 PaymentDto[]` + `meta.totals:{paidMinor,refundedMinor}`. Tests: ST-1/2/3; фильтры; master → 403.

**PAY-02 `POST /api/payments`** — зарегистрировать оплату. `payments:create`. `Idempotency-Key`. Request: `{ appointmentId, amountMinor, method, status?:"paid"|"pending" (по умолчанию paid), paidAt?, notes? }` (`customerId`, `staffId`, `currency` берутся с записи/бизнеса). Для `paid` в транзакции создаётся `transactions(charge)`. Response `201 PaymentDto`. Codes: 201, 403, 404 (запись другого бизнеса), 409 (`APPOINTMENT_CANCELLED` — нельзя принимать оплату по отменённой), 422. Tests: ST-2/3/4/5; идемпотентность; `amountMinor` ≤ 0/не целое → 422; создаётся ровно одна `transaction`.

**PAY-03 `GET /api/payments/:id`** · **post-MVP** — карточка с запись/клиент/кто принял и транзакциями. `payments:read`. Response `200 { payment, appointment:AppointmentDto, transactions:TransactionDto[] }`. Tests: ST-3.

**PAY-04 `POST /api/payments/:id/mark-paid`** — `pending → paid`. `payments:create`. Request `{ paidAt?, method? }`. Response `200`; создаёт `charge`. Codes: 200, 403, 404, 409 `INVALID_PAYMENT_TRANSITION`. Tests: повтор не создаёт вторую `charge`.

**PAY-05 `POST /api/payments/:id/cancel`** — `pending → cancelled`. `payments:cancel`. Request `{ reason? }`. Response `200`. Codes: 409 если не `pending`. Аудит `payment.cancelled`. Tests: транзакции не создаются.

**PAY-06 `POST /api/payments/:id/refund`** — возврат (полный/частичный). `payments:refund`. Request `{ amountMinor, note }` (note обязателен). Условие: `status=paid`, `amountMinor ≤ amountMinor − refundedMinor`. Транзакция: `refundedMinor += x`, при полном возврате `status=refunded`, создаётся `transactions(refund)`. Response `200`. Codes: 200, 403, 404, 409 `REFUND_EXCEEDS_PAID`/`INVALID_PAYMENT_TRANSITION`, 422. Аудит `payment.refunded`. Tests: частичный+полный; превышение → 409; гонка двух возвратов → сумма не превышает платёж.

**PAY-07 `GET /api/appointments/:id/payments`** · **post-MVP** — платежи записи + баланс. `payments:read`. Response `200 { payments:PaymentDto[], paidMinor, refundedMinor, balanceMinor }`. `balanceMinor = priceMinor(snapshot) − (paid − refunded)`. Codes: 200, 403, 404. Tests: ST-3; расчёт баланса.

**TRX-01 `GET /api/transactions`** · **post-MVP** — журнал. `transactions:read`. Query: `from`, `to`, `method`, `type`, `staffId`, `customerId`, `q`, `page`, `limit`. Response `200 TransactionDto[]` + `meta.totals:{inMinor,outMinor,netMinor}`. Tests: ST-1/2/3; периоды в поясе бизнеса; сумма = дашборд.

**TRX-02 `GET /api/transactions/:id`** · **post-MVP** — карточка (ссылки на платёж/запись/клиента/пользователя). `transactions:read`. Codes: 200, 403, 404. Tests: ST-3. **Изменяющих эндпоинтов у transactions нет.**

---

## 13. Notifications

**NTF-01 `GET /api/notifications`** · **post-MVP** — журнал отправок. `notifications:read`. Query: `status`, `kind`, `channel`, `appointmentId`, `from`, `to`, `page`, `limit`. Response `200 NotificationDto[]`. Tests: ST-1/2/3; фильтры.

**NTF-02 `POST /api/notifications/:id/retry`** · **post-MVP** — повторить `failed`. `notifications:retry`. Response `200` (статус → `scheduled`, `attempts=0`). Codes: 200, 403, 404, 409 (не `failed`, либо запись уже отменена/прошла). Tests: ST-3; нельзя повторить `sent`.

**SYS-02 `POST /api/internal/jobs/notifications/run`** — запуск воркера (для внешнего cron). Auth: `CRON` · Context: `CRON` · Request `{ limit?:50 }`. Response `200 { claimed, sent, failed, skipped }`. Codes: 200, 401 (неверный/отсутствующий секрет). Rate: `RL-JOB`. Tests: без секрета 401; повторный запуск не шлёт дубли; параллельные запуски обрабатывают разные письма.

**SYS-01 `GET /api/health`** — `{status:"ok", db:"up"}`; без данных бизнеса. Auth: нет. Tests: 200/503 при недоступной БД.

---

## 14. Dashboard

Все: `dashboard:read` (owner/admin), `SESSION`, query `from`, `to` (локальные даты, включительно; максимум 366 дней) **или** `preset=today|week|month|last_month` (по умолчанию `month`), `staffId?`, `compare=true|false`. Период интерпретируется в поясе бизнеса. master → `403`.

**DSH-01 `GET /api/dashboard/summary`** — KPI. Response `200 { period:{from,to,timezone}, revenue:{netMinor,grossMinor,refundedMinor,currency}, appointments:{total,pending,confirmed,completed,cancelled,noShow,cancellationRate,noShowRate}, newCustomers, previous?:{…те же} }`. **MVP-UI использует 4 KPI:** выручка нетто; записи (всего); отмены + no_show; новые клиенты (+ `DSH-05` «ближайшие»). Прочие поля ответа (`previous`, доли) остаются в контракте, но в MVP-UI не показываются; график, загрузка мастеров, топ услуг — `DSH-02/03/04` (post-MVP). <!-- CHANGED: A2 -->
Tests: ST-1/2/3; значения на фиксированных фикстурах (DASHBOARD_SPEC §7).
**DSH-02 `GET /api/dashboard/revenue-series`** · **post-MVP** — `granularity=day|week` → `[{date,netMinor}]`. Tests: сумма ряда = `revenue.netMinor`.
**DSH-03 `GET /api/dashboard/staff-load`** · **post-MVP** — `[{staffId,displayName,bookedMinutes,availableMinutes,loadPercent,appointmentsCount}]`. Tests: формула; исключения/блокировки уменьшают `availableMinutes`.
**DSH-04 `GET /api/dashboard/top-services`** · **post-MVP** — `sort=count|revenue`, `limit≤20` → `[{serviceId,name,count,netRevenueMinor}]`. Tests: отменённые не считаются.
**DSH-05 `GET /api/dashboard/upcoming`** — ближайшие `limit≤20` записей `pending|confirmed` от `now` → `AppointmentDto[]`. Tests: порядок, фильтр `staffId`.
Для всех: Isolation — `$match: {businessId}` первым этапом; Rate `RL-API`; Codes 200/401/403/404 (чужой `staffId)/422.

---

## 15. Settings

**SET-01 `GET /api/settings`** — настройки. `settings:business_read` (разделы `business`, `booking`, `privacy`) и `settings:notifications_read` (раздел `notifications`) — оба у owner, admin. Response `200 SettingsDto`. Для admin `notifications` — только чтение (флаг `readOnly:true`). Tests: ST-1/2/3; master → 403.
**SET-02 `PATCH /api/settings/business`** — профиль бизнеса. `settings:business_write` (owner). Request: `{ name?, phone?, email?, address?, publicDescription?, timezone?, currency?, countryCode?, privacy?:{ masterSeesCustomerPhone?, dataRetentionDays?, consentText?, requireConsent? } }` (`slug` → 422). Смена `countryCode` не пересчитывает существующие `phoneNormalized` (DATA_MODEL §12); `dataRetentionDays` информационное (DATA_MODEL §4). <!-- CHANGED: A1 --> `timezone`/`currency` с будущими активными записями → `409 TIMEZONE_CHANGE_BLOCKED`/`CURRENCY_CHANGE_BLOCKED`. Response `200`. Аудит `settings.updated`. Tests: admin → 403; slug → 422; блокировка смены timezone.
**SET-03 `PATCH /api/settings/booking`** — правила записи. `settings:booking_write` (owner, admin). Request: подмножество `booking.*`. Response `200`. Tests: ST-2/4/5; значения вне диапазонов → 422; влияние на слоты.
**SET-04 `PATCH /api/settings/notifications`** · **post-MVP** — уведомления. `settings:notifications_write` (owner). Request: подмножество `notifications.*`. Response `200`. Tests: admin → 403; отключение напоминаний не отменяет уже `sent`, отменяет `scheduled` соответствующего вида.

---

## 16. Реестр маршрутов (для contract-теста)

Каждый маршрут объявляется через `defineRoute({ id, method, path, auth, permission, contextSource, bodySchema, querySchema, rateLimit, handler })`. Тест `routes.contract.test` обязан: (1) убедиться, что **все ID этого документа без пометки post-MVP** (64) зарегистрированы и наоборот, а post-MVP ID в реестре отсутствуют; <!-- CHANGED: A2 --> (2) для каждого `:id`-маршрута с `contextSource=SESSION` выполнить ST-3; (3) для каждого маршрута проверить ST-1 и (при `permission`) ST-2 по матрице; (4) проверить, что `bodySchema` strict.
