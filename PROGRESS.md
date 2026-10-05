# Progress

| Этап | Статус | Дата |
|---|---|---|
| 0 — Спайк `occupiedKeys` | Частично: уникальный multikey race на MongoDB прошёл 20 × 20; расширенный отчёт и остальные пункты §0.occupiedKeys ещё не выполнены | 2026-10-04 |
| 1 — Фундамент Vite + Express | Каркас перенесён, typecheck/lint/unit/integration/build и health проходят; повторная финальная проверка после перепланировки ожидается | 2026-10-04 |
| 2 — Модели, Zod, интерфейсы, UI-компоненты | Частично: модели, миграция, Zod и UI-kit перенесены; репозитории, сервисы и A/B фикстуры не завершены | 2026-10-04 |
| 3 — Auth, AppShell, login/register | Частично: AUTH-01…04, регистрация/вход и базовый AppShell работают; AUTH-06…09 и role tests отсутствуют | 2026-10-04 |
| 4 — Staff + Services + Schedule | Backend STF/SVC/BLK/MEM и UI `/app/staff`, карточки сотрудника (профиль/расписание/исключения/услуги/доступ), `/app/services` и настройки команды реализованы; E2E проверяет переходы UI. Общий route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 5 — Customers + Settings | Backend CUS/SET и UI `/app/customers`, карточка с историей/заметками/оплатами, настройки Бизнес/Запись/Команда реализованы; E2E проверяет UI. Общий route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 6 — Booking | 6a unit-покрытие всех 15 сценариев BOOKING_ENGINE_SPEC §13 добавлено; DST покрывает spring gap/fall fold в New York/Berlin и стабильность в шести бизнес-поясах, а также TZ процесса UTC и America/Los_Angeles. 6b завершён: AVL-01, APT-01…06, role transitions, атомарные reschedule/status; internal 20-way race 1 success + 19×409. 6c завершён: PUB-01…10 и E2E booking→manage→cancel | 2026-10-05 |
| 7 — Calendar | CAL-01 и UI закрыты: рабочая сетка 15 минут, выбор даты/дня-недели, создание по свободному слоту и панель записи со статусами/переносом/заметками/оплатой; master own-only без фильтра мастеров. Исправлено распаковывание API envelope в клиентском календаре. Полный route×role/A/B gate остаётся на этапе 12 | 2026-10-05 |
| 8 — Notifications + email | Закрыт: dedupe/backoff, SMTP + Console providers, SMS/Push skipped adapters, 8 RU-шаблонов, атомарный claim с арендой/recovery, retry/status/TTL, циклический worker, SYS-02 с CRON_SECRET. Проверены retry, duplicate enqueue, crash recovery, parallel workers, password-reset templateData cleanup и A/B изоляция. Reminders рендерятся по актуальной записи и содержат телефон бизнеса + инструкцию позвонить; manageUrl хранится только в confirmed/changed/cancelled уведомлениях | 2026-10-05 |
| 9 — Payments | Закрыт: PAY-01/02/04/05/06, tenant-scoped payment/transaction repositories, целочисленные суммы, идемпотентное создание, append-only журнал charge/refund в транзакциях; экран /app/payments и действие принятия оплаты из календаря. Unit/integration/race проверки и typecheck/lint/build зелёные | 2026-10-05 |
| 10 — Dashboard | Закрыт: DSH-01 (KPI/previous), DSH-05 (ближайшие записи, limit≤20), MST-01 («Мой день», только свои данные без денег); локальные бизнес-периоды с Luxon/DST, `$match businessId` первым этапом агрегаций, загрузка мастера через общий CAL-01/booking-engine. UI /app/dashboard и /app/my-day. Unit/integration/E2E, полный test suite, race, typecheck/lint/build зелёные | 2026-10-05 |
| 11 — Финальный UI/a11y | Блоки 11.1 и 11.2 закрыты. В 11.2 удалён неиспользуемый `packages/client/src/styles.css`; прежние Next.js пути, mock-хранилища и `components/forms` отсутствуют. Блок 11.3 (contrast/responsive/axe/keyboard/E2E расширение) впереди | 2026-10-05 |
| 12 — E2E, безопасность, деплой | Частично: Playwright smoke/auth, health, race DB-index проходят; полный security/E2E и сквозные ролевые сценарии остаются обязательными | 2026-10-05 |

## Обязательные работы перед финалом (этапы 11–12)

- **Этап 11.2:** проверить и удалить оставшийся Next.js-прототип/мёртвые файлы, затем повторить typecheck/lint/build.
- **Этап 11.3:** пройти contrast, responsive 320–1440px, axe ключевых экранов, клавиатурный сценарий публичной записи и E2E из `TESTING_STRATEGY §11`.
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
