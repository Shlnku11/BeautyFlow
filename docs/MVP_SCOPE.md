# MVP_SCOPE.md — Объём MVP по эндпоинтам

<!-- CHANGED: A2a (новый документ) -->
Источник контрактов — API_CONTRACTS.md (пометка `post-MVP` в заголовках эндпоинтов). Этапы и исполнители — PHASED_PLAN.md. Этот файл машиночитаем: строки таблиц `| ID | … |` разбираются скриптом `check:docs`.

## Итог

| Показатель | Значение |
|---|---|
| Описано эндпоинтов | **83** |
| В MVP | **64** |
| Post-MVP | **19** |

Цель «30–40 эндпоинтов» снята владельцем (решение 2b): MVP = 64, обязательно сохранены R5 целиком (исключения, блокировки), сброс пароля, управление командой (кроме создания admin и смены ролей), `MST-01`, `PUB-05`.

**Приоритеты:** **1** — ядро сквозного сценария (регистрация → мастер → услуга → расписание → публичная запись → календарь); **2** — обязательно для MVP, сквозной сценарий не блокирует; **3** — в MVP, но первым сдвигается при срыве сроков. **Этап** — номер этапа PHASED_PLAN (исполнитель — в PHASED_PLAN).

| Приоритет | Эндпоинтов |
|---|---|
| 1 | 34 |
| 2 | 26 |
| 3 | 4 |

| Этап | Эндпоинтов | Исполнитель |
|---|---|---|
| 1 | 1 | Claude |
| 3 | 8 | Claude |
| 4 | 20 | Codex Luna 6 |
| 5 | 8 | Codex Luna 6 |
| 6b | 7 | Codex Luna 6 |
| 6c | 10 | Codex Luna 6 |
| 7 | 1 | Codex Luna 6 |
| 8 | 1 | Codex Luna 6 |
| 9 | 5 | Codex Luna 6 |
| 10 | 3 | Codex Luna 6 |

Примечание: этапы 1–3 выполняет Claude (на момент выпуска пакета документации код не написан), этапы 4–10 — Codex Luna 6 по task-пакетам (`docs/tasks/`, пока не созданы), кроме перечисленного в DEEPSEEK_HANDOFF_RULES §5 и §12. <!-- CHANGED: ZIP -->


## Auth (регистрация, вход, сессии, приглашения, пароль)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| AUTH-01 | `POST /api/auth/register-business` | да | 1 | 3 | Транзакция users+businesses+settings+businessMembers(owner)+sessions (`withTransaction`). Пишет Claude. Поле `countryCode` обязательно |
| AUTH-02 | `POST /api/auth/login` | да | 1 | 3 | Пишет Claude (`auth/`). Одно членство в MVP; единый ответ на неверный email/пароль |
| AUTH-03 | `POST /api/auth/logout` | да | 1 | 3 | Пишет Claude. Удаляет документ сессии, очищает cookie |
| AUTH-04 | `GET /api/auth/me` | да | 1 | 3 | Пишет Claude. Возвращает `permissions` из `domain/permissions.ts` |
| AUTH-05 | `POST /api/auth/switch-business` | нет | — | post-MVP | Post-MVP: в MVP у пользователя одно членство (`unique {userId}`) |
| AUTH-06 | `POST /api/auth/accept-invite` | да | 1 | 3 | Активирует приглашение, созданное `STF-02`; пишет Claude; тесты используют фикстуру «invited-член» |
| AUTH-07 | `POST /api/auth/forgot-password` | да | 2 | 3 | Ставит `password_reset` в очередь (`NotificationService.enqueue*` — Claude, этап 2); письмо реально уходит только после этапа 8. Единый ответ 202 |
| AUTH-08 | `POST /api/auth/reset-password` | да | 2 | 3 | Токен одноразовый (60 мин); удаляет все сессии пользователя. Пишет Claude |
| AUTH-09 | `POST /api/auth/change-password` | да | 3 | 3 | Удаляет остальные сессии (`auth/session.ts`). Первым сдвигается при срыве сроков |
| AUTH-10 | `PATCH /api/auth/me` | нет | — | post-MVP | Post-MVP: смена имени профиля вынесена из MVP владельцем |

## Команда (члены бизнеса)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| MEM-01 | `GET /api/members` | да | 2 | 4 | Только члены своего бизнеса; токены не отдаются |
| MEM-02 | `POST /api/members/invite` | нет | — | post-MVP | Post-MVP: в MVP приглашение создаётся только вместе с сотрудником (`STF-02`); admin создать нельзя |
| MEM-03 | `PATCH /api/members/:id` | да | 2 | 4 | MVP: только `status` (`role`/`staffId` → 422). Отключение вызывает интерфейс закрытия сессий пользователя (Claude) |
| MEM-04 | `POST /api/members/:id/resend-invite` | да | 2 | 4 | Новый токен через `auth/tokens` (Claude); доставка письма `staff_invite` — с этапа 8 |
| MEM-05 | `POST /api/members/transfer-ownership` | нет | — | post-MVP | Post-MVP: получатель обязан быть admin, а admin в MVP не создаётся |

## Staff (сотрудники и мастера)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| STF-01 | `GET /api/staff` | да | 1 | 4 | master видит только себя |
| STF-02 | `POST /api/staff` | да | 1 | 4 | **Критично.** Транзакция: staff + users(invited) + businessMembers(invited) + inviteToken + enqueue `staff_invite`. Использует `AuthService.createInvitedUser` и `auth/tokens` (Claude, этап 3). Усиленное ревью |
| STF-03 | `GET /api/staff/:id` | да | 1 | 4 | master — только свой |
| STF-04 | `PATCH /api/staff/:id` | да | 1 | 4 | Деактивация отключает членство и закрывает сессии (интерфейс auth — Claude); `confirm=true` при будущих записях |
| STF-05 | `DELETE /api/staff/:id` | нет | — | post-MVP | Post-MVP: удаления нет, только деактивация |
| STF-11 | `GET /api/staff/:id/services` | да | 1 | 4 | Список услуг мастера |
| STF-12 | `PUT /api/staff/:id/services` | да | 1 | 4 | Транзакция; все `serviceIds` проверяются в бизнесе |

## Schedule (расписание, исключения, блокировки)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| BLK-01 | `GET /api/blocked-periods` | да | 2 | 4 | R5; master видит только свои |
| BLK-02 | `POST /api/blocked-periods` | да | 2 | 4 | R5. Транзакция + `bookingVersion`; конфликт с записями → 409; веер `allStaff` с `groupId`. Гонка с записью дотестируется на этапе 6. Усиленное ревью |
| BLK-03 | `DELETE /api/blocked-periods/:id` | да | 2 | 4 | R5; `?group=true` удаляет веер |
| STF-06 | `GET /api/staff/:id/schedule` | да | 1 | 4 | master — только своё расписание (read-only) |
| STF-07 | `PUT /api/staff/:id/schedule` | да | 1 | 4 | Транзакция + `$inc bookingVersion`; в ответе `affectedAppointmentsCount`; валидатор расписания (DATA_MODEL §7) |
| STF-08 | `GET /api/staff/:id/exceptions` | да | 2 | 4 | R5: исключения расписания (день заменяется целиком) |
| STF-09 | `POST /api/staff/:id/exceptions` | да | 2 | 4 | R5: upsert по дате; `custom` требует интервалы |
| STF-10 | `DELETE /api/staff/:id/exceptions/:date` | да | 2 | 4 | R5: удаление исключения |

## Services (услуги)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| SVC-01 | `GET /api/services` | да | 1 | 4 | master — только привязанные услуги |
| SVC-02 | `POST /api/services` | да | 1 | 4 | Валюта = валюта бизнеса; длительность кратна 5 |
| SVC-03 | `GET /api/services/:id` | нет | — | post-MVP | Post-MVP: достаточно списка `SVC-01` |
| SVC-04 | `PATCH /api/services/:id` | да | 1 | 4 | Скрытие услуги — `isActive=false`; существующие записи не меняются (снимок) |
| SVC-05 | `DELETE /api/services/:id` | нет | — | post-MVP | Post-MVP: удаления услуг нет, только деактивация |

## Customers (клиенты)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| CUS-01 | `GET /api/customers` | да | 1 | 5 | Префиксный поиск по `searchTokens`; master — урезанный DTO |
| CUS-02 | `POST /api/customers` | да | 1 | 5 | Уникальность телефона в рамках бизнеса; нормализация по `countryCode` |
| CUS-03 | `GET /api/customers/:id` | да | 1 | 5 | `summary` из агрегаций appointments/transactions; до этапов 6 и 9 значения нулевые (реальные, не mock) |
| CUS-04 | `PATCH /api/customers/:id` | да | 1 | 5 | Смена телефона на существующий → 409 |
| CUS-05 | `DELETE /api/customers/:id` | нет | — | post-MVP | Post-MVP: удаления клиентов нет (риск: удаление ПД — вручную в БД) |
| CUS-06 | `GET /api/customers/:id/appointments` | да | 2 | 5 | История записей клиента (R7); master — только свои визиты |

## Settings (настройки)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| SET-01 | `GET /api/settings` | да | 2 | 5 | admin: раздел notifications read-only |
| SET-02 | `PATCH /api/settings/business` | да | 2 | 5 | owner; `countryCode`, `privacy.*`; блок смены `timezone`/`currency` при будущих записях полностью проверяется после этапа 6 |
| SET-03 | `PATCH /api/settings/booking` | да | 2 | 5 | owner/admin; влияет на движок (шаг слотов, min notice, max advance, autoConfirm, окно отмены) |
| SET-04 | `PATCH /api/settings/notifications` | нет | — | post-MVP | Post-MVP: настройки уведомлений — значения по умолчанию |

## Booking (доступность, внутренние записи, публичная запись)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| APT-01 | `GET /api/appointments` | да | 1 | 6b | master — только свои |
| APT-02 | `POST /api/appointments` | да | 1 | 6b | **Критично.** Транзакция создания (`bookingVersion`, find-or-create клиента, `occupiedKeys`, enqueue); `Idempotency-Key`; гонки. Усиленное ревью |
| APT-03 | `GET /api/appointments/:id` | да | 1 | 6b | Содержит `payment{paidMinor,refundedMinor,balanceMinor}` — до этапа 9 нули (реальные) |
| APT-04 | `PATCH /api/appointments/:id` | да | 2 | 6b | Для master — только `visitNote`; оставлен в MVP, потому что это единственный путь записи заметки мастера |
| APT-05 | `POST /api/appointments/:id/reschedule` | да | 1 | 6b | **Критично.** Единичный `updateOne` с пересчётом `occupiedKeys`; 409 сохраняет старое время |
| APT-06 | `POST /api/appointments/:id/status` | да | 1 | 6b | **Критично.** Матрица переходов × роли; побочные эффекты (`occupiedKeys`, уведомления). Усиленное ревью |
| AVL-01 | `GET /api/availability` | да | 1 | 6b | Использует чистый движок `booking-engine` (этап 6a, Claude) |
| PUB-01 | `GET /api/public/b/:slug` | да | 1 | 6c | Включает `consent{required,text}`; неизвестный/неактивный slug → единый 404 |
| PUB-02 | `GET /api/public/b/:slug/services` | да | 1 | 6c | Только услуги с доступным мастером |
| PUB-03 | `GET /api/public/b/:slug/staff?serviceId=` | да | 1 | 6c | Только `isActive`, `acceptsOnlineBooking` |
| PUB-04 | `GET /api/public/b/:slug/availability?serviceId=&staffId=&date=` | да | 1 | 6c | Слоты по правилам min notice/max advance |
| PUB-05 | `GET /api/public/b/:slug/availability/days?serviceId=&staffId=&month=YYYY-MM` | да | 2 | 6c | Дни месяца с ≥1 слотом; реализация перебором дат — проверить производительность |
| PUB-06 | `POST /api/public/b/:slug/appointments` | да | 1 | 6c | **Критично.** Идемпотентность, honeypot, согласие (`requireConsent`), гонки (20 запросов → 1), find-or-create клиента без изменения существующего. Усиленное ревью |
| PUB-07 | `GET /api/public/manage/:token` | да | 2 | 6c | Токен управления (HMAC, `no-store`); неверный токен → единый 404 |
| PUB-08 | `GET /api/public/manage/:token/availability?date=` | да | 2 | 6c | Слоты переноса: та же услуга и мастер, запись исключена из занятости |
| PUB-09 | `POST /api/public/manage/:token/cancel` | да | 2 | 6c | Окно отмены; освобождает слот; отменяет напоминания |
| PUB-10 | `POST /api/public/manage/:token/reschedule` | да | 2 | 6c | Окно + лимит переносов; усиленное ревью |

## Calendar (календарь)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| CAL-01 | `GET /api/calendar` | да | 1 | 7 | Включает `load` (формула DASHBOARD_SPEC §3.5); границы дня/недели в поясе бизнеса; master — только свой |

## Notifications (уведомления, воркер, служебные)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| NTF-01 | `GET /api/notifications` | нет | — | post-MVP | Post-MVP: журнал в БД ведётся, UI нет |
| NTF-02 | `POST /api/notifications/:id/retry` | нет | — | post-MVP | Post-MVP: повтор `failed` вручную |
| SYS-01 | `GET /api/health` | да | 1 | 1 | Инфраструктура (Claude): `{status, db}` |
| SYS-02 | `POST /api/internal/jobs/notifications/run` | да | 1 | 8 | Воркер по HTTP (`CRON_SECRET`); логика — `runNotificationBatch`. Доставка всех писем (AUTH-07/08, MEM-04, STF-02, запись) начинается здесь |

## Payments (оплаты, транзакции)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| PAY-01 | `GET /api/payments` | да | 2 | 9 | «История транзакций» MVP = этот список (период/метод/статус/мастер/клиент, кто принял) |
| PAY-02 | `POST /api/payments` | да | 2 | 9 | **Критично.** Транзакция payments+transactions; `Idempotency-Key`. Усиленное ревью |
| PAY-03 | `GET /api/payments/:id` | нет | — | post-MVP | Post-MVP: данные платежа в строке списка |
| PAY-04 | `POST /api/payments/:id/mark-paid` | да | 3 | 9 | `pending→paid`. UI-вход: платёж со статусом «Ожидает оплаты» создаётся select-ом в форме `PAY-02` (UI_UX_SPEC §3.11) |
| PAY-05 | `POST /api/payments/:id/cancel` | да | 3 | 9 | Отмена только `pending` (оплаченный платёж отменить нельзя — возврат `PAY-06`). UI-вход: строка платежа «Ожидает оплаты» (UI_UX_SPEC §3.11) |
| PAY-06 | `POST /api/payments/:id/refund` | да | 2 | 9 | Частичный/полный возврат; условное обновление `refundedMinor`; обязательная причина. Усиленное ревью |
| PAY-07 | `GET /api/appointments/:id/payments` | нет | — | post-MVP | Post-MVP: баланс есть в `APT-03.payment` |
| TRX-01 | `GET /api/transactions` | нет | — | post-MVP | Post-MVP: отдельный журнал транзакций |
| TRX-02 | `GET /api/transactions/:id` | нет | — | post-MVP | Post-MVP |

## Dashboard (обзор, «Мой день»)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| DSH-01 | `GET /api/dashboard/summary` | да | 2 | 10 | 4 KPI в UI (выручка нетто, записи, отмены+no_show, новые клиенты); payload шире |
| DSH-02 | `GET /api/dashboard/revenue-series` | нет | — | post-MVP | Post-MVP: график выручки |
| DSH-03 | `GET /api/dashboard/staff-load` | нет | — | post-MVP | Post-MVP: загрузка мастеров (в календаре `load` остаётся) |
| DSH-04 | `GET /api/dashboard/top-services` | нет | — | post-MVP | Post-MVP: топ услуг |
| DSH-05 | `GET /api/dashboard/upcoming` | да | 3 | 10 | Ближайшие записи |
| MST-01 | `GET /api/master/dashboard` | да | 2 | 10 | «Мой день» master; без денег |

## Audit (журнал аудита)

| ID | Метод и путь | MVP | Приоритет | Этап | Комментарий |
|---|---|---|---|---|---|
| AUD-01 | `GET /api/audit-logs` | нет | — | post-MVP | Post-MVP: запись в `auditLogs` ведётся, чтения через UI нет |

## Правила изменения

Перевод эндпоинта между MVP и post-MVP выполняется **сначала** здесь и в заголовке API_CONTRACTS.md (с разрешения владельца), затем в UI_UX_SPEC, PERMISSIONS_MATRIX §2a, TESTING_STRATEGY и PHASED_PLAN. Скрипт `check:docs` сверяет: множество MVP-ID здесь = множество ID без пометки post-MVP в API_CONTRACTS.md = реестр `defineRoute`.
