# Progress

| Этап | Статус | Дата |
|---|---|---|
| 0 — Спайк `occupiedKeys` | Частично: уникальный multikey race на MongoDB прошёл 20 × 20; расширенный отчёт и остальные пункты §0.occupiedKeys ещё не выполнены | 2026-10-04 |
| 1 — Фундамент Vite + Express | Каркас перенесён, typecheck/lint/unit/integration/build и health проходят; повторная финальная проверка после перепланировки ожидается | 2026-10-04 |
| 2 — Модели, Zod, интерфейсы, UI-компоненты | Частично: модели, миграция, Zod и UI-kit перенесены; репозитории, сервисы и A/B фикстуры не завершены | 2026-10-04 |
| 3 — Auth, AppShell, login/register | AUTH-01…04, AUTH-06…09 и AppShell реализованы; AUTH-05 остаётся post-MVP. Этап 12 добавил тесты сброса/смены пароля и role coverage | 2026-10-05 |
| 4 — Staff + Services + Schedule | Backend STF/SVC/BLK/MEM и UI `/app/staff`, карточки сотрудника (профиль/расписание/исключения/услуги/доступ), `/app/services` и настройки команды реализованы; E2E проверяет переходы UI. Общий route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 5 — Customers + Settings | Backend CUS/SET и UI `/app/customers`, карточка с историей/заметками/оплатами, настройки Бизнес/Запись/Команда реализованы; E2E проверяет UI. Общий route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 6 — Booking | 6a unit-покрытие всех 15 сценариев BOOKING_ENGINE_SPEC §13 добавлено; DST покрывает spring gap/fall fold в New York/Berlin и стабильность в шести бизнес-поясах, а также TZ процесса UTC и America/Los_Angeles. 6b завершён: AVL-01, APT-01…06, role transitions, атомарные reschedule/status; internal 20-way race 1 success + 19×409. 6c завершён: PUB-01…10 и E2E booking→manage→cancel | 2026-10-05 |
| 7 — Calendar | CAL-01 и UI закрыты: рабочая сетка 15 минут, выбор даты/дня-недели, создание по свободному слоту и панель записи со статусами/переносом/заметками/оплатой; master own-only без фильтра мастеров. Исправлено распаковывание API envelope в клиентском календаре. Полный route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 8 — Notifications + email | Закрыт: dedupe/backoff, SMTP + Console providers, SMS/Push skipped adapters, 8 RU-шаблонов, атомарный claim с арендой/recovery, retry/status/TTL, циклический worker, SYS-02 с CRON_SECRET. Проверены retry, duplicate enqueue, crash recovery, parallel workers, password-reset templateData cleanup и A/B изоляция. Reminders рендерятся по актуальной записи и содержат телефон бизнеса + инструкцию позвонить; manageUrl хранится только в confirmed/changed/cancelled уведомлениях | 2026-10-05 |
| 9 — Payments | Закрыт: PAY-01/02/04/05/06, tenant-scoped payment/transaction repositories, целочисленные суммы, идемпотентное создание, append-only журнал charge/refund в транзакциях; экран /app/payments и действие принятия оплаты из календаря. Unit/integration/race проверки и typecheck/lint/build зелёные | 2026-10-05 |
| 10 — Dashboard | Закрыт: DSH-01 (KPI/previous), DSH-05 (ближайшие записи, limit≤20), MST-01 («Мой день», только свои данные без денег); локальные бизнес-периоды с Luxon/DST, `$match businessId` первым этапом агрегаций, загрузка мастера через общий CAL-01/booking-engine. UI /app/dashboard и /app/my-day. Unit/integration/E2E, полный test suite, race, typecheck/lint/build зелёные | 2026-10-05 |
| 11 — Финальный UI/a11y | Закрыт: UI/cleanup/a11y, все E2E §11 сценарии 1–10, включая перенос+конкурентный слот, master invitation и A/B direct URL. Исправлен auth navigation flake (повторное использование вкладки со stale React Query session после cookie clear); все E2E 9/9 | 2026-10-05 |
| 12 — E2E, безопасность, деплой | 🟡 Реализация завершена; release gate частичный. AUTH-07/08/09 подключены и тестируются; все 64 contract ID имеют handler, role matrix покрывает session routes для owner/admin/master/anonymous и проверяет A/B изоляцию. CSP и Gitleaks пройдены. Docker image build и production-mode HTTP/security-header smoke пройдены. `docs/DEPLOY.md` и README подготовлены. Реальный staging/production deployment, TLS, backup restore и мониторинг не проверены. `npm audit` остаётся с 5 high в Tailwind 3 dev dependency цепочке; зависимости не менять, Tailwind 4 post-MVP. Открыто: production verification и решение по advisory risk | 2026-10-05 |

## Этап 12 — текущий статус (2026-10-05)

- Добавлен `tests/api/route-role-matrix.test.ts`: реальные Express session routes прогоняются для owner/admin/master и anonymous; проверяются 401/403, отсутствие fallback 501, tenant B в path/body и отсутствие утечки/изменения чужих объектов. `routes-registry.test.ts` сверяет concrete handler ID всех 64 контрактных endpoints с MVP route registry.
- Добавлен CSP для API: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`; security header test покрывает CSP, `nosniff`, Referrer/Permissions-Policy и отключённый `X-Powered-By`.
- AUTH-07/08/09 подключены в `http/auth-routes.ts`. AUTH-07 отвечает одинаковым 202 и нейтральным текстом, задаёт минимальный response floor 150ms, сохраняет hash токена и 60m expiry; notification содержит URL/token для email delivery. AUTH-08 одноразово потребляет токен атомарным условным update в `withTransaction`, удаляет все пользовательские sessions и пишет audit. AUTH-09 проверяет текущий пароль и в транзакции удаляет все другие сессии, сохраняя текущую. Добавлен `tests/api/auth-password-flows.test.ts`: enumeration/timing, expiry/replay/race, sessions/audit и wrong-password cases.
- Route ID union покрывает все 64 MVP endpoints; role gate проходит все session routes, а cross-tenant ID/body probes покрывают сущности и межсущностные ссылки. Тесты не являются статистической гарантией timing под произвольной нагрузкой и не заменяют staging security exercise.
- Content-Security-Policy — заголовок добавлен и проверен API-тестом.
- `npm audit --audit-level=high`: 5 high уязвимостей в dev dependency цепочке Tailwind 3.4.19 → chokidar/micromatch/braces. Переход на Tailwind 4 — post-MVP; зависимости не менять.
- Gitleaks 8.30.1: текущие source/docs/tests directories clean. Git history reports 4 generic-api-key false positives from legacy test fixtures (`tests/unit/env.test.ts`, `tests/unit/notifications.test.ts`); values are dummy-only, current fixtures have been changed to low-entropy test values. No actual credential was identified.
- Docker image собран; production-mode API HTTP/404 + CSP/header smoke прошёл. Health с намеренно недоступной тестовой БД не проверялся как успешный. Production/staging host, DNS/TLS, SMTP и backup target не заданы; реальный deploy/restore не выполнен.
- `npm run typecheck`, `npm run lint`, `npm test` (28 файлов / 101 тест), `npm run test:api` (4 файла / 13 тестов), `npm run test:race` (2/2), `npm run build`, `npm run test:e2e` (9/9), `npm run check:contrast`, `npm run test:a11y` (1/1) — ✅. Docker image build и smoke ✅. Полный `npm audit --audit-level=high` ❌ (5 high dev-only); `npm audit --omit=dev --audit-level=high` ✅. Известные upstream build warnings: client chunk >500kB и React `"use client"` directives.

## Обязательные работы перед финалом (этапы 11–12)

- **Этап 11:** блок 11.4 добавил E2E §11 #3 (перенос через manage UI, конкурентная публичная запись → 409 SLOT_UNAVAILABLE, проверка единственного владельца occupiedKeys), #5 (STF-02 email в notifications DB, AUTH-06 принятие, master own-only и 403/redirect для owner-only разделов), #7 (два browser context A/B, чужие customer/staff/appointment API + UI direct URL дают 404). Исправлены относительные Navigate, которые формировали бесконечные пути у master. Причина login flake: очистка cookie в уже авторизованной вкладке не очищает React Query session cache; тест авторизации выполняется в новой вкладке после очистки cookie.
- **Все реализованные эндпоинты (обязательный финальный gate):** построить и прогнать полную матрицу **роль × эндпоинт** по `PERMISSIONS_MATRIX.md`, включая owner/admin/master, анонимный/просроченный доступ, ожидаемые 200/201/204/403/404/422, область `own`, проверки чужих ID во всех path/query/body полях и подтверждение, что при A→B обращениях данные B не читаются и не меняются. Источник ожидаемых прав — контракт, не ручное допущение.

## Этап 11.1 — результат и проверки (2026-10-05)

- Сделаны экраны Staff/Services/Customers/Settings и вкладки профиля сотрудника; календарь получил сетку слотов 15 минут, создание записи и панель действий. Исправлено получение CAL-01 payload (клиент API уже снимает внешний envelope).
- Booking-engine: добавлены unit проверки всех 15 кейсов §13, шестизонная матрица поясов, DST gap/fold и сравнение process TZ UTC/America/Los_Angeles.
- `npm run typecheck`, `npm run lint`, `npm test` (26 файлов / 90 тестов), `npm run test:race` (2/2), `npm run build`, `npm run test:e2e` (5/5) — ✅.
- `npm run check:contrast` — пока не работает: отсутствует `scripts/check-contrast.ts`. `npm run test:a11y` — пока не находит тестов в `tests/e2e/a11y`; закрыть в блоке 11.3.

## Этап 11.2 — результат и проверки (2026-10-05)

- Проверены legacy пути `src/app/page.tsx`, `src/app/submissions`, `src/lib/storage.ts`, `components/forms/*`: их нет в рабочем дереве. Старые mock-хранилища/locations не используются.
- Удалён единственный лишний stylesheet `packages/client/src/styles.css`; он не импортировался и ссылался на отсутствующий токен-файл. Работающий `tokens.css` и Tailwind entrypoint оставлены.
- Typecheck/lint/unit (26 файлов / 90 тестов)/race (2/2)/build/E2E (5/5) — ✅.
- Contrast и выделенный a11y suite пока не запускаются по причинам, указанным выше; починить в 11.3.

## Этап 11.3 — результат и проверки (2026-10-05)

- Добавлен scripts/check-contrast.ts: проверяет документированные пары токенов по WCAG (текст ≥4.5:1, границы/фокус ≥3:1) и запрещает glass-классы вне whitelist; npm run check:contrast ✅.
- App получил skip-link и нижнюю навигацию для мобильного экрана; широкие таблицы имеют мобильные карточки. Диалог переведён на Headless UI Dialog с управлением фокусом и Escape; динамические статусы используют семантику status/alert.
- Добавлен axe/responsive/keyboard E2E набор: 12 ключевых маршрутов — 0 serious/critical axe нарушений; размеры 320, 375, 768, 1024 и 1440 px без горизонтального overflow; проверены skip-link, Escape и keyboard-only public booking. npm run test:a11y ✅ (1 сценарий).
- Полный набор: typecheck ✅, lint ✅, npm test (26 файлов / 90 тестов) ✅; отдельно unit 40/40, integration 46/46, API 2/2, race 2/2 ✅; build ✅, E2E 9/9 ✅, contrast ✅, a11y 1/1 ✅. Build сообщает upstream use-client/размер чанка warnings.
- Все сценарии TESTING_STRATEGY §11 1–10 закрыты автоматизированно в E2E. Проверка responsive widths выполнена в Playwright; ручной просмотр реальных устройств и скринридером не выполнялся. Полная матрица всех API role×endpoint и A/B полей остаётся gate этапа 12.
