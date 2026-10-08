# NOTIFICATIONS_SPEC.md — Уведомления

Обязательный рабочий канал — **email**. SMS и push — адаптеры по контракту, без реализации провайдеров в MVP. Модель — DATA_MODEL_MONGODB §16, API — API_CONTRACTS §13: в MVP только `SYS-02` (`NTF-01` журнал и `NTF-02` повтор — post-MVP), настройки — `settings.notifications.*` (в MVP остаются **значениями по умолчанию**: изменяющий эндпоинт `SET-04` — post-MVP). Журнал отправок ведётся **в БД**, интерфейса просмотра в MVP нет. <!-- CHANGED: A2b -->

## 1. Архитектура

```
Событие домена (создана/изменена/отменена/завершена запись, приглашение, сброс пароля)
   │  NotificationService.enqueue*()      ← внутри той же Mongo-транзакции, что и изменение записи
   ▼
notifications (status=scheduled, scheduledFor, dedupeKey UNIQUE)
   │
   ▼  Воркер: runNotificationBatch()  ← scripts/worker.ts (цикл) ИЛИ POST /api/internal/jobs/notifications/run (внешний cron)
   │     claim → render → ChannelProvider.send() → mark sent|retry|failed
   ▼
EmailProvider (smtp | console)         SmsProvider / PushProvider (adapters, пока не подключены)
```
Постановка в очередь — часть транзакции бизнес-операции: нет «записи без уведомления» и «уведомления без записи».

## 2. Интерфейсы провайдеров (контракты)

**NotificationChannelProvider** (общий):
- `channel`: `'email' | 'sms' | 'push'`;
- `send(message): Promise<SendResult>`, где `message = { to, subject?, text, html?, idempotencyKey, headers? }`, `SendResult = { providerMessageId: string }`;
- ошибки типизированы: `TransientProviderError` (повтор), `PermanentProviderError` (сразу `failed`: неверный адрес, отказ получателя).

**EmailProvider** — реализации: `SmtpEmailProvider` (nodemailer, SMTP из env), `ConsoleEmailProvider` (dev/test: логирует и сохраняет письма в память; **запрещён при `NODE_ENV=production`** — проверка при старте).
**SmsProvider / PushProvider** — интерфейсы определены, регистрируются в `ProviderRegistry`; пока не зарегистрированы → уведомление этого канала получает статус `skipped` с `lastError: 'CHANNEL_NOT_CONFIGURED'`. Добавление провайдера = новый класс + строка регистрации + env, **без изменений** очереди/сервисов/схемы.

## 3. События и шаблоны

| kind | Когда ставится | Получатель | scheduledFor |
|---|---|---|---|
| `appointment_confirmed` | запись создана и статус `confirmed` (или переход `pending→confirmed`) | клиент (`contactEmail`) | сейчас |
| `appointment_changed` | перенос/смена мастера/услуги | клиент | сейчас |
| `appointment_cancelled` | статус `cancelled` | клиент | сейчас |
| `reminder_24h` | при `confirmed` (и после переноса) | клиент | `startAt − 24 ч` (не ставится, если время уже прошло) |
| `reminder_1h` | то же | клиент | `startAt − 1 ч` (аналогично) |
| `followup_after_visit` | переход в `completed` | клиент | `now + followUpDelayMinutes` |
| `staff_invite` | `STF-02` (создание сотрудника с email), `MEM-04` (повтор) | приглашённый (`recipient.email`) | сейчас |
| `password_reset` | `AUTH-07` | пользователь | сейчас |
| `email_verification` | `AUTH-01`, `AUTH-12` | владелец аккаунта | сейчас |
| `login_verification` | `AUTH-02` | пользователь | сейчас |

- Для `pending` записи подтверждение не уходит (отправляется «заявка принята» — **не** в MVP; решение §Decisions: в MVP при `autoConfirm=false` клиент получает `appointment_confirmed` только после подтверждения).
- Включение/выключение по видам — `settings.notifications.*Enabled`; выключенный вид просто не ставится в очередь, а при выключении уже стоящие `scheduled` этого вида получают `cancelled`. **MVP:** изменить флаги через API нельзя (`SET-04` — post-MVP), действуют значения по умолчанию (все включены); логика сохранения и отмены реализуется в сервисе и проверяется на уровне сервиса (кейс 14 ниже), HTTP-эндпоинт появится в post-MVP. <!-- CHANGED: A2b -->
- Если у записи нет `contactEmail` → уведомление `skipped` (`NO_RECIPIENT`).
- Шаблоны: текст на русском, ключи `src/server/notifications/templates/ru/<kind>.ts`; структура допускает `en` позже (ключ `locale`). Содержимое: название бизнеса, услуга, мастер, дата/время **в поясе бизнеса с подписью зоны**, адрес, ссылка управления (`manageUrl`) для `confirmed/changed/reminder`, `ics`-вложение — вне MVP. `email_verification` и `login_verification` хранят код в `templateData` только до результата доставки; после sent/failed/skipped поле целиком удаляется. Тема и тело не содержат лишних персональных данных.
- Данные рендера: для `confirmed/changed/cancelled/invite/reset` — снимок `templateData`, сохранённый при постановке; для `reminder_*` и `followup` — **рендер при отправке по актуальной записи** (запись могла быть перенесена/отменена).

## 4. Планирование и инвалидация

- При создании/подтверждении записи — вставка `reminder_24h`, `reminder_1h` (если включены и `scheduledFor > now`).
- Перенос: старые `scheduled` напоминания записи → `cancelled`; новые вставляются под новое `startAt` (другие `dedupeKey`).
- Отмена/неявка: все `scheduled` уведомления записи → `cancelled` (кроме только что поставленного `appointment_cancelled`).
- Проверка актуальности **в момент отправки** (guard): для `reminder_*` запись должна быть в статусе `pending|confirmed`/`confirmed` (напоминания только `confirmed`) и `now < startAt`; иначе уведомление `skipped` (`STALE`). Для `followup` — запись `completed`.
- «Просроченные» напоминания (воркер был выключен): если `now > scheduledFor + 30 мин` для `reminder_1h` или `> scheduledFor + 2 ч` для `reminder_24h` → `skipped` (`LATE`). Не отправлять напоминание «за час», когда визит уже идёт.

## 5. Защита от дублей (dedupe)

`dedupeKey` (unique-индекс), формат:
- `appointment_confirmed|changed|cancelled`: `"<channel>:<kind>:<appointmentId>:<__v записи>"`;
- `reminder_*`: `"<channel>:<kind>:<appointmentId>:<startAtEpochMs>"`;
- `followup_after_visit`: `"<channel>:followup_after_visit:<appointmentId>"`;
- `staff_invite`: `"<channel>:staff_invite:<memberId>:<inviteTokenHash[0..8]>"`; `password_reset`: `"<channel>:password_reset:<userId>:<resetTokenHash[0..8]>"`; `email_verification`: `"email:email_verification:<userId>:<codeHash[0..8]>"`; `login_verification`: `"email:login_verification:<userId>:<codeHash[0..8]>"`. <!-- CHANGED: stage 2 -->
Вставка при дубле (`E11000`) — штатный no-op. Дополнительно воркер передаёт провайдеру `idempotencyKey = notification._id`.

## 6. Очередь, воркер, повторы

**Claim** (атомарно, без глобальных блокировок):
`findOneAndUpdate({ status:'scheduled', nextAttemptAt:{$lte:now}, $or:[{lockedUntil:null},{lockedUntil:{$lt:now}}] }, { $set:{ status:'processing', lockedUntil: now+5мин, lockedBy: workerId }, $inc:{ attempts:1 } })` — повторяется до `limit` раз за запуск. Это **единственный** бизнес-независимый запрос; далее обработка идёт с `businessId` уведомления.
**Зависшие `processing`** (воркер упал): записи с `status:'processing'` и `lockedUntil < now` возвращаются в `scheduled` при следующем запуске (шаг recovery).
**Исходы отправки:**
- успех → `status:'sent'`, `sentAt`, `providerMessageId`, `expireAt = now+400д`;
- `TransientProviderError` → если `attempts < maxAttempts (5)`: `status:'scheduled'`, `nextAttemptAt = now + backoff[attempts]` (1, 5, 30, 120, 720 мин), `lastError`; иначе `failed`;
- `PermanentProviderError` → сразу `failed`;
- guard-отказ → `skipped`.
`failed` остаётся в журнале (в БД). Повтор вручную `NTF-02` (`failed → scheduled`, `attempts=0`, при условии что запись всё ещё актуальна) — **post-MVP**; в MVP `failed` разбирается оператором по БД/логам. <!-- CHANGED: A2b -->
**Ошибки не должны ломать бизнес-операции:** отправка полностью отделена от создания записи.

## 7. Cron / job

- **Рекомендованный запуск (Docker/VPS):** отдельный процесс `scripts/worker.ts` (цикл каждые 30 с: recovery → claim/send до `limit` → пауза). Один или несколько воркеров безопасны (claim атомарен).
- **Альтернатива (serverless/внешний cron):** `POST /api/internal/jobs/notifications/run` (`SYS-02`) с `Authorization: Bearer ${CRON_SECRET}`, вызывается каждую минуту.
- Обе точки входа вызывают один и тот же `runNotificationBatch({limit, now, workerId})`.
- Мониторинг: счётчики `claimed/sent/failed/skipped` в логе каждого прогона; алёрт при `failed` > порога и при самом старом `scheduled` старше 15 минут (настраивается при деплое).

## 8. Журнал

Журнал (в БД; просмотр через `NTF-01` — post-MVP) хранит: вид, статус, получателя, `scheduledFor`, попытки, `lastError`, `sentAt`. `lastError` хранит только код/короткое сообщение (без тела письма, без паролей SMTP). Хранение: `sent|cancelled|skipped` — TTL 400 дней (`expireAt`); `failed` — без TTL до ручного решения. Тела писем не хранятся (кроме `templateData` — минимальный набор полей).

## 9. Переменные окружения

`EMAIL_PROVIDER=smtp|console`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE=true|false`, `SMTP_USER`, `SMTP_PASSWORD`, `CRON_SECRET` (≥32 симв.), `WORKER_POLL_INTERVAL_SECONDS=30`, `WORKER_BATCH_LIMIT=50`, `APP_BASE_URL`. Для будущих каналов: `SMS_PROVIDER`, `PUSH_PROVIDER` (+ специфичные ключи провайдера) — не используются в MVP. Все — только через env (`src/server/config/env.ts`, валидация Zod при старте; в production пустые `SMTP_*` при `EMAIL_PROVIDER=smtp` → отказ запуска).

## 10. Тесты

Unit: построение `dedupeKey`; расчёт `scheduledFor`; таблица backoff; guard (актуальность/LATE); выбор шаблона и форматирование времени в поясе бизнеса (в т.ч. DST); `ProviderRegistry` (неподключённый канал → `skipped`).
Integration (replica set, `ConsoleEmailProvider`/фейк):
1. создание записи ставит `confirmed` + 2 напоминания в той же транзакции; откат транзакции → уведомлений нет;
2. повторная постановка (тот же ключ) не создаёт дубль;
3. два воркера параллельно → каждое уведомление отправлено ровно один раз;
4. `TransientProviderError` ×5 → `failed`; между попытками соблюдается backoff; `PermanentProviderError` → сразу `failed`;
5. падение воркера в `processing` → recovery возвращает в `scheduled`;
6. перенос отменяет старые напоминания и создаёт новые; отмена записи отменяет все;
7. напоминание к отменённой/прошедшей записи → `skipped (STALE)`; просроченное → `skipped (LATE)`;
8. `password_reset`, `staff_invite`, `email_verification` и `login_verification`: повторный запрос (новый токен/код) создаёт новое уведомление, повторная постановка той же ценности — no-op (`dedupeKey` включает хэш); одноразовые коды очищаются из `templateData` после исхода доставки; <!-- CHANGED: A2b; stage 2 -->
9. запись с `autoConfirm=false` (`pending`): ни подтверждения, ни напоминаний; после `APT-06 → confirmed` ставятся `appointment_confirmed` и напоминания; <!-- CHANGED: A2b -->
10. `SYS-02` без секрета → 401, с секретом → 200;
11. изоляция: журнал бизнеса A не содержит уведомлений B; воркер рендерит с данными своего бизнеса;
12. отсутствие `contactEmail` → `skipped (NO_RECIPIENT)`;
13. `ConsoleEmailProvider` в production → отказ старта.

Дополнительно, **уровень сервиса** (не HTTP; поведение `SET-04` — post-MVP): 14. выключение вида (`settings.notifications.*Enabled=false`, выставленное в фикстуре) отменяет `scheduled` этого вида и не ставит новых; повторное включение не воскрешает отменённые. *Кейсы «`NTF-02` повторяет только `failed`» и «`SET-04`» исключены из MVP-набора (post-MVP).* <!-- CHANGED: A2b -->
E2E: «запись через публичную страницу → письмо-подтверждение попало в ConsoleEmailProvider со ссылкой управления → переход по ссылке → отмена → письмо об отмене».
