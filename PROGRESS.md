# Progress

## 2026-10-09 — Финальный прогон и подготовка к защите

- E2E: **23/23 за 5,1 минуты** на порту 5174, включая вход demo owner/master, email-OTP-регистрацию, изоляцию tenant, race-сценарий и создание записи из свободного календарного слота. 23 проверки включают две отдельные demo-account регрессии.
- Исправлены причины E2E flaky: публичные landing/login/register и booking снимаются в гостевой сессии отдельно от owner; OTP helper читает активные scheduled-коды, а проверка приглашений принимает состояния `scheduled` и `sent`; Playwright запускается без фонового worker, который удаляет одноразовый код после доставки. В dashboard skeleton исправлена serious axe-проблема: доступное имя теперь связано с `role="status"`.
- Quality gates: typecheck ✅; lint ✅; `npm test -- --maxWorkers=1` — **34 файла / 125 тестов ✅**; `npm run test:race` — **2/2 ✅**; `npm run check:contrast` ✅; `npm run build` ✅. Build по-прежнему сообщает о `use client` dependency directives и крупнейшем клиентском chunk **540.84 kB**; bundle-переразбиение отложено после защиты.
- Playwright обновил светлые/тёмные кадры landing, login, dashboard, calendar, public booking, payments, staff и customers. Финальный индекс: [`docs/screenshots/README.md`](docs/screenshots/README.md); walkthrough на 5 минут: [`DEFENSE_WALKTHROUGH.md`](DEFENSE_WALKTHROUGH.md), шпаргалка: [`docs/DEFENSE_CARD.md`](docs/DEFENSE_CARD.md).
- В `.env` проверены `APP_BASE_URL=http://localhost:5174` и `TRUSTED_PROXY_HOPS=1`; файл остаётся игнорируемым и не попадёт в коммит. Порт 5173 не трогали. Backend/API contracts/data model, `tenantPlugin`, `occupiedKeys`, `withTransaction` не менялись.
- Cleanup: `.gitignore` покрывает `outputs/`, `test-results/`, `dist/`, `tmp/`, `work/` и временные файлы. Фактическое удаление этих директорий и старых промежуточных скриншотов было отклонено автоматической проверкой команд; они остаются локально и требуют ручной очистки.
- Для защиты готов локальный запуск. После неё остаются полный аудит backend/frontend, production-проверка email и настройка Google OAuth credentials; OAuth кнопка корректно показывает «Скоро появится». Bundle optimization и production deploy — отдельные последующие задачи.

## 2026-10-08 — Реконструкция UI, блок 1 (Landing)

Статус: блок лендинга завершён и закоммичен; общий редизайн страниц продолжается по очереди из `docs/comparison/` и исходного задания. Этот раздел новее передачи ниже: Landing больше не считается незавершённым.

- Первый экран перестроен в одну колонку: Inter Variable, заголовок 64px, отступы и позиция близки к Linear. Dashboard превью 60.4% viewport и уходит ниже первого экрана.
- Для темы Light/Dark используются реальные снимки продукта: `packages/client/public/images/dashboard-{light,dark}.png` и `calendar-{light,dark}.png`. Добавлены demo-секция с календарём и 4-колоночный футер; CTA тёмный с одной основной кнопкой. Тексты — из `packages/shared/src/i18n/ru.ts`.
- Сохранено сравнение 32 исходных различий и зафиксировано 5 оставшихся продуктовых отличий (BeautyFlow бренд/фиолетовый акцент, русская салонная навигация, реальное содержимое CRM, отсутствие Linear-specific overlay, заданная ширина превью 60.4% против ~92%). Результат не объявляется 10/10; подробный score — `docs/AUDIT.md`.
- Реальные Playwright кадры сохранены как `docs/screenshots/landing-{light,dark}.png`; финальное сравнение Linear: `docs/comparison/landing-linear-vs-ours-after.png`.
- Качество: typecheck ✅, lint ✅, unit/integration 32 файла / 118 тестов ✅, build ✅, contrast ✅, landing E2E 4/4 ✅. Полный E2E 18/21: оставшиеся сбои/флейки относятся к axe timeout записей/оплат и payments fixture со ссылкой на недоступную запись; auth smoke timeout после 20 параллельных запросов. Все три подробно описаны в блоке Stage 4 Landing аудита. Полный `test:a11y` отдельно не запускался.
- На машине `localhost:5173` занят процессом отдельного `sales-dashboard`; он не тронут. Playwright поддерживает `E2E_APP_ORIGIN`, по умолчанию `http://localhost:5173`; подтверждённый прогон лендинга выполнен на `http://localhost:5174` с тестовым API на `3000`.

Следующий блок: этап 2 исходного задания — Login / Register / Verify-email.

## 2026-10-08 — Передача: этап 4 (радикальная доработка)

Текущий статус: этап 4 закрыт на 8 из 13 экранов. Последняя завершённая область — Staff (список + карточка специалиста с пятью вкладками); подробная проверка добавлена ниже. Routing/404 в этой работе не менялись и остаются отложенными.

Закрытые изменения:

- `12a44c7` — календарь: overlap + мобильная сетка.
- `a032027` — карточка клиента: локализация, timezone, валюта.
- `4c942e2` — календарный E2E locator, полный E2E 13/13.
- `8402bd8` — адаптивный список клиентов.
- `d296de8` — удалён демо-баннер email.
- `73cd4d3` — адаптивные оплаты до 1536px.
- `8ba183a` — адаптивные записи до 1280px.
- `a880043` — адаптивные услуги до 1120px.
- `3878b18` — Staff: адаптивный список и детальная карточка с вкладками Профиль / Расписание / Исключения / Услуги / Доступ; Chromium E2E и light/dark screenshots.

Осталось для следующего исполнителя:

- Этап 4: Dashboard, Landing, Login, Register/Verify-email, Settings, My-day, Public-booking. 404/routing не менять до отдельного решения.
- Этап 5: Motion + GSAP анимации (скиллы установлены, но не применены).
- Этап 6: эскизы 24 страниц.
- Этап 7: презентация, walkthrough, финальные скриншоты.

Команды: существующий MongoDB контейнер `docs-master-architecture-md-1-3-mongo-1` на `27018` (при необходимости `docker start docs-master-architecture-md-1-3-mongo-1`; новый не создавать), затем `npm run migrate`, `npm run seed`, `npm run dev`. Проверки: `npm run typecheck && npm run lint && npm test`, `npm run test:race`, `npm run test:e2e`, `npm run test:a11y`, `npm run check:contrast`, `npm run build`. Демо-вход: `owner@demo.local` / `demo-password-123`.

## 2026-10-08 — Stage 4 Staff (list + profile tabs)

- Список сотрудников оформлен через shadcn primitives: плотная таблица для широких экранов и карточки до 1279px, summary, поиск по имени/email/телефону, фильтр inactive, реальные service counts из tenant services, состояния loading/error/retry/empty, доступная форма создания.
- Карточка специалиста получила identity header и пять keyboard-operable вкладок: профиль, расписание, исключения, услуги, доступ. Формы используют labels, permission-aware read-only state, status feedback; деактивация с будущими записями подтверждается управляемым Dialog.
- `tests/e2e/a11y/staff-management.spec.ts`: real Chromium + existing Mongo seed; owner login через UI; проверены пять ширин 320/375/768/1024/1440, обе темы, axe для списка и каждой вкладки, arrow-key tab navigation, поиск/empty/clear, required validation, network abort + retry и сохранение профиля. Staff E2E ✅ 1/1.
- Скриншоты сведены к актуальным парным кадрам ключевых экранов: `docs/screenshots/staff-{light,dark}.png`; прочие промежуточные варианты удалены.
- Сборка/проверки этого прохода: typecheck ✅, lint ✅, Vitest 32 файла / 118 тестов ✅, race 2/2 ✅, build ✅ (upstream `use client` + крупный client chunk warning), contrast ✅, `test:a11y` 7/7 ✅, полный `test:e2e` 18/18 ✅. В промежуточном прогоне была разовая Windows screenshot file-open ошибка у payments; изолированный payments E2E, полный a11y и повторный полный E2E прошли.
- Smoke registration locator обновлён: список с корректной кнопкой и empty-state кнопкой теперь выбирает header action, а оплаты проверяются в реальной responsive card, не desktop table. Изменения только в UI Staff, E2E и документации; backend/contracts/`.env` не тронуты.

## 2026-10-08 — Runtime/UI stabilization after partial shadcn WIP

- Recovered the client application sources from the last known compiling baseline (`d3f9021`) after the prior WIP commit contained corrupted JSX/TypeScript. Re-applied the necessary shadcn lowercase path, Dialog compatibility, and entry CSS fixes without touching backend contracts, architecture, or `.env`.
- `npm run migrate` ✅ (`000_init` and `001_google_identity` already applied); `npm run typecheck` ✅; `npm run lint` ✅; `npm test` ✅ (31 files / 115 tests); `npm run test:race` ✅ (2/2); `npm run build` ✅. Build still warns that client JS is 1.26 MB minified and includes upstream `use client` directive notices.
- Real Chromium smoke: `/` stayed at the public landing route with no redirect loop; root landing test ✅. Direct Playwright navigation to the requested public/auth/app URLs returned 200 for the document shell; protected `/app/*` routes correctly redirect anonymous users to `/login`.
- This is stabilization only. Shadcn integration remains partial: the legacy EmptyState/ErrorState/Radio/Toast files remain, some features use native/custom elements, the top-level layout is not fully migrated, and generated component coverage/screenshots are not yet audited. Do not mark the design migration complete.
- Docker state at this continuation: the existing MongoDB container on 27018 was healthy; no new container was created. The E2E-managed smoke used the existing app configuration and did not edit `.env`.
- Demo seed initially hit an existing `occupiedKeys` claim. `scripts/seed.ts` now writes appointments sequentially and tries only free starts inside the seeded business hours; two consecutive `npm run seed` runs passed with the same 3 staff / 5 services / 10 customers / 32 appointments / 11 payments counts.

## 2026-10-08 — Animation skill setup

- Installed project-local `.agents/skills/motion` and `.agents/skills/awwwards-animations`; both follow the requested Motion-first, performance-aware workflow. The Awwwards skill's source CLI reported High Risk; manual content scan found instructional Markdown/references only, with no install hooks or executable scripts.
- The requested `emilkowal-animations` name is absent in the named repository. Installed that author's official `emil-design-eng` and `animate` skills as the matching animation/design guidance. The specified `DevMar/awwwards-animations` URL could not be cloned; installed the public `devmartinese/awwwards-animations-skill` repository instead.
- The skills and `skills-lock.json` are project-local and pending their Stage 2 documentation/commit. No animation packages have been installed yet; that is Stage 5 and remains explicitly scoped to `motion`, `gsap`, and `lenis`.

## 2026-10-08 — Stage 3 visual/runtime audit

- Added `docs/AUDIT.md` with 14 screen-state families, scores for design/structure/type/states/responsive/dark/a11y, architecture/runtime/tests/performance/security ratings, concrete defects, and a prioritized Stage 4 plan.
- Captured 42 real Chromium baseline images (light/dark): landing, login, register/verify, dashboard, calendar day/week/month, appointments, customer list/detail, staff list/detail, services, payments, settings, master my-day, public booking/completion/manage, appointment modal. Those historical baseline files were removed during final cleanup; findings remain in `docs/AUDIT.md`.
- Live findings: calendar grid events collapse because dynamic Tailwind row placement classes are not emitted; customer detail prints untranslated database keys, ISO timestamps, and unformatted minor units; payments table wraps columns severely; demo owner/master are unverified and show a persistent banner; appointment modal showed a generic error during reschedule view. Public booking and manage flow completed in Chromium.
- Stage 3 test evidence: typecheck ✅, lint ✅, Vitest 31 files / 115 tests ✅, race 2/2 ✅, build ✅, migrate ✅, full Chromium E2E 11/11 ✅, a11y suite 1/1 ✅, contrast ✅. Axe checked 13 key routes in light/dark; responsive checks covered 320/375/768/1024/1440, mobile navigation, skip-link, Escape and keyboard-only public booking. Full E2E uncovered and then verified fixes for sandbox Skeleton ARIA, inactive tab contrast (4.39:1 → darker muted foreground), and ambiguous dialog-close locator. Initial client bundle remains 1,257.12 kB minified / 365.26 kB gzip; FPS/production trace not measured.
- Stage 4 must fix the audit P0s before motion work. External app setup uses real seeded demo rows in the local development database; no hardcoded mock was added to runtime.

## 2026-10-08 — Stage 4 calendar P0

- Fixed week/day appointment-card placement. Tailwind row-start and row-span utilities are statically enumerated through row 52, with matching `gridRow`/`gridRowStart` theme values; the production CSS was checked for rows 25 and 52. Removed runtime-generated arbitrary classes.
- Calendar card now fits a 30-minute booking, exposes full appointment context to assistive tech, and shows the master when duration allows. Real Chromium regression completed registration, staff/service/schedule setup and public booking, then asserted a visible 40px grid card.
- Captured after images were consolidated as `docs/screenshots/calendar-light.png` and `calendar-dark.png`. Targeted card E2E ✅ (1/1), typecheck ✅, lint ✅, build ✅. Static placement classes confirmed in production CSS.

## 2026-10-08 — Stage 4 calendar mobile + collision layout

- Mobile day view now uses the available viewport width instead of a hidden 780px inner minimum; the 08:00 axis label is no longer clipped, and touchable free slots fill their 20px row. Upcoming rows stack on phones and the payment action stays a single line at desktop widths.
- Added `assignCalendarLanes` interval grouping and grid columns. Simultaneous different-staff bookings render in independent lanes; completed lanes are reused for later visits. A unit test covers concurrent, nested, adjacent, and disconnected intervals.
- Chromium E2E created two public bookings at the same available time for different seeded masters, checked separate card bounds, then canceled both fixtures. The responsive a11y suite asserts day view/no internal horizontal overflow; widths 320/375/768/1024/1440 and both themes pass.
- Evidence: lane unit tests ✅ (3/3), overlap E2E ✅ (1/1), full Chromium E2E ✅ (13/13), `npm run test:a11y` ✅ (2/2), typecheck ✅, lint ✅, `npm test` ✅ (32 files / 118 tests), race ✅ (2/2), build ✅, contrast ✅. Production CSS contains `grid-cols-1/2/12`, `col-start-2`, and `col-span-12`. Screenshots: `calendar-after-mobile.png`, `calendar-overlap-light.png`, `calendar-overlap-dark.png`.

## 2026-10-08 — Stage 4 customer detail

- Replaced raw summary object keys with Russian KPI labels; appointment statuses and payment methods/statuses are localized. Customer created date, visits, and payment timestamps use the business timezone; monetary values use the currency formatter. No API contract, model, or backend code changed.
- Mobile history/payment rows now stack without forcing desktop-width columns. A Chromium E2E uses the seeded owner and MongoDB data, confirms a visit row and localized screen values, checks light/dark axe, and asserts no horizontal overflow at 320/375/768/1024/1440px.
- Evidence: `tests/e2e/a11y/customer-detail.spec.ts` ✅ (1/1), `npm run typecheck` ✅, `npm run test:a11y` ✅ (2/2); current paired screenshots are indexed in `docs/screenshots/README.md`.
- Remaining customer work: responsive card view for the customer list and separate master/error-state coverage. Next Stage 4 priorities stay in `docs/AUDIT.md`.

## 2026-10-08 — Stage 4 customer list

- Replaced the narrow-screen customer list with linked cards containing name, phone, email fallback, source, and created date formatted in the business timezone; desktop retains the compact table.
- Added real Chromium coverage against seeded MongoDB rows for card metadata, detail navigation, expected table/card visibility and no overflow at 320/375/768/1024/1440px. Light/dark axe found no serious or critical issues. Screenshots are consolidated into the current gallery in `docs/screenshots/README.md`.
- Fixed the unnamed mobile topbar “new appointment” link exposed by axe: localized accessible name and decorative icon hidden from the accessibility tree.
- `tests/e2e/a11y/customer-list.spec.ts` ✅ (1/1), `npm run typecheck` ✅, `npm run lint` ✅. Customer empty/API-error and master-specific states remain unaudited.

## 2026-10-08 — Stage 4 demo verification state

- Fixed the local seed account state that caused an irrelevant persistent “Подтвердите email” banner: owner/master demo users are marked verified, and stale verification hashes/expiry are cleared on reseed. Scope is limited to the development seed; auth behavior/contracts are unchanged.
- `npm run seed` ✅ against the existing MongoDB container (3 staff, 5 services, 19 customers, 41 appointments, 11 payments). The customer-list Chromium E2E asserts the banner is absent for the demo owner.
- Checks: targeted customer-list E2E ✅ (1/1), `npm run typecheck` ✅, `npm run lint` ✅.

## 2026-10-08 — Stage 4 payments responsive layout

- Replaced the narrow-shell payment rows with responsive cards through 1535px; retained the nine-column table once the content shell can fit it at 1536px. Cards label transaction date, appointment time, method, amount, refunded total, staff member, customer and service, plus the existing permitted actions and a mobile empty state.
- All payment dates now use the active business timezone. Replaced raw customer/appointment database IDs in temporary missing-detail fallbacks with readable labels.
- Real Chromium test checks seeded payment actions/content, no page overflow at 320/375/768/1024/1439/1440/1535/1536px, no table-region overflow at desktop width, and axe in both themes. Current paired screenshots: `docs/screenshots/payments-{light,dark}.png`.
- `tests/e2e/a11y/payments-list.spec.ts` ✅ (1/1), `npm run typecheck` ✅, `npm run lint` ✅. Appointment and service lists still need responsive table treatment.

## 2026-10-08 — Stage 4 appointments responsive layout

- Added day-grouped appointment cards for shells narrower than 1280px; cards keep customer, time, service, master, price, source, status and details action. Payment links retain the existing permission/status gate. The desktop table and appointment detail dialog remain in use on wide layouts.
- Real Chromium checked cards/table at 320/375/768/1024/1279/1280/1440px, no page overflow, no internal table overflow at desktop, appointment details navigation, and axe in light/dark. Historical screenshots were consolidated; see `docs/screenshots/README.md` for the retained gallery.
- `tests/e2e/a11y/appointments-list.spec.ts` ✅ (1/1), `npm run typecheck` ✅, `npm run lint` ✅, `npm run build` ✅. Services list remains to be made responsive.

## 2026-10-08 — Stage 4 services responsive layout

- Replaced the narrow-shell service rows with cards below 1120px. Cards expose full service description, duration, buffer, price, assigned staff names, active state, online-booking state, and contextual edit action. The desktop table remains above that breakpoint.
- Chromium used seeded MongoDB service/staff data, checked edit dialog, cards/table at 320/375/768/1023/1119/1120/1280/1440px, no page overflow, no inner table overflow, and axe in light/dark. Historical screenshots were consolidated; see `docs/screenshots/README.md` for the retained gallery.
- `tests/e2e/a11y/services-list.spec.ts` ✅ (1/1), `npm run typecheck` ✅, `npm run lint` ✅, `npm run build` ✅, `npm run check:contrast` ✅. Service loading/error and filtered-empty states remain unverified.

## WIP 2026-10-07 — shadcn/ui migration paused

- `shadcn@latest` и `radix-nova` конфигурация добавлены в `packages/client`; theme variables light/dark добавлены в `src/index.css`. Компоненты установлены/перегенерированы: Button, Input, Select, NativeSelect, Dialog, Table, Card, Badge, Tabs, Skeleton, DropdownMenu, Avatar, Sheet, Checkbox, RadioGroup, Pagination, Textarea, Label, Sonner. Часть generated classes адаптирована к Tailwind 3 и некоторые icons переведены на Font Awesome.
- Кодмодом feature pages получили shadcn Button/Input/NativeSelect/Textarea/Label; несколько экранов используют shadcn Dialog через временный `DialogShell`. AppLayout частично использует shadcn Sheet/DropdownMenu/Avatar.
- **WIP, незавершено:** compile/lint/tests не запускались после правок; таблицы/карточки/табы не мигрированы последовательно; `UiSandbox`, старый UI barrel и самописные EmptyState/ErrorState/Radio/Toast требуют завершения или удаления. Провести аудит путей с учётом регистра, удалить Lucide usage/dependency и `iconLibrary: lucide`, подключить Sonner Toaster и Form, заменить остатки raw/custom components. Скриншоты нового UI не сделаны. Не утверждать, что дизайн Linear-ready.
- Текущие P0/P1 и подробная передача перечислены в `docs/HANDOFF.md` выше: persistent session cookie, Google OAuth UI, email-code login, полноценная shadcn feature migration и визуальная проверка — P0; поэкранная оценка 0–10, light/dark screenshots, walkthrough video и Docker E2E/a11y — P1.
- Все проверки после shadcn правок не запускались; предыдущие тесты — только baseline до WIP. Backend/contracts/architecture/.env не менялись.

### P0/P1 для следующего аккаунта

**P0:** проверить persistent cookie сессии (включая Max-Age/Expires); добавить UI-кнопку Google OAuth (backend готов); реализовать email-код именно для входа; завершить shadcn migration и подтвердить реальное использование компонентов в `features/*` — текущий Linear redesign не готов.

**P1:** оценить 0–10 и довести до 10/10 dashboard, calendar, customers, staff, services, payments, settings, landing, login, register, my-day, public booking и appointment modal; создать light+dark screenshots этих экранов; записать walkthrough video; прогнать полный E2E+a11y на реальном Docker/Mongo replica set.

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

## Финальная полировка — блок 1 (2026-10-05)

- Проверка `git ls-files` не обнаружила закоммиченных `dist/`, `coverage/`, `.next/`, `outputs/`, `work/`, `tmp/`, `.gitkeep` или файлов логов/сборки. Удалять отслеживаемые артефакты не потребовалось.
- `.gitignore` дополнен правилами для `node_modules/`, `dist/`, `coverage/`, `.next/`, `outputs/`, `tmp/`, `work/`, `*.log`, `.env*` и `.DS_Store`; `.env.example` остаётся разрешённым.
- Поиск импортов не нашёл ссылок из `packages/client` в `packages/server` и из `packages/server` в `packages/client`. README уже содержит раздел «Структура» с описанием трёх пакетов.
- В git нет `.gitkeep`; пустые tracked directories невозможны. Локальные игнорируемые `dist/` и `test-results/` будут удалены после финальных проверок, которые могут их пересоздать.

## Финальная полировка — блок 2 (2026-10-05)

- Удалены только комментарии, повторявшие имя/действие функции или очевидный шаг адаптера; инварианты, ссылки на спецификации, доменный JSDoc и комментарии о гонках/tenant exceptions сохранены.
- Проверки кода и тестов после комментариев: выполняются вместе с блоком 3.

## Демо-данные — блок 1 (2026-10-06)

- `scripts/seed.ts` теперь наполняет `demo-salon` владельцем и мастером, 3 мастерами, 5 услугами, 10 клиентами, 30 записями (10 completed, 3 cancelled, 2 no_show, 10 confirmed, 5 pending) и 8 оплатами (6 paid, включая одну с частичным возвратом, 2 pending).
- Заполнение использует idempotent upsert и booking-engine `occupiedKeysFor`; записи с terminal статусом не сохраняют занятость. Журнал содержит 6 charge и 1 refund, без изменения существующих transaction записей.
- Проверено двумя последовательными запусками `npm run seed` и запросом к MongoDB: tenant и все количества/status-группы совпадают. Логин: `owner@demo.local` / `demo-password-123`.
- `npm run typecheck` и `npm run lint` — ✅.
- Ограничение схемы: 8 Payment документов могут ссылаться только на 8 отдельных записей; поэтому два completed визита остаются без оплаты, а частичный возврат сохраняет статус `paid` согласно PAYMENTS_SPEC.

## Clay polish — блок 2 (2026-10-06)

- Усилен объём clay: пастельный фиолетовый фон, глубокие raised/pressed/hover тени, карточки 32px, controls 20px, поля 18px; hover/active переходы учитывают reduced motion.
- Button/Card/Input/Select/Textarea используют clay состояния; sidebar получает clay поверхность и активное pressed состояние, верхняя панель сохраняет glass. Dashboard KPI получили цветные градиенты и иконки.
- Добавлен toggle светлой/тёмной темы с сохранением выбора; системная тёмная тема применяется автоматически. Добавлены dark токены и контрастные переопределения базовых поверхностей.
- `npm run typecheck`, `npm run lint`, `npm run check:contrast` — ✅. Contrast показывает text на clay 5.65–6.30:1, neutral-900 на clay 14.06–15.68:1; фокус/граница clay 3.05–3.40:1.
- Визуальное ручное сравнение экранов во всех размерах и скриншоты будут сделаны после блока тёмной темы и очистки.

## Clay polish — блок 3 (2026-10-06)

- Scroll reveal использует IntersectionObserver с threshold 0.15, hero mockup сохраняет лёгкое CSS floating движение, KPI цифры считаются при входе в область видимости.
- Добавлены переходы появления страниц, диалогов и toast, underline для ссылок; `prefers-reduced-motion` отключает keyframes/transitions и оставляет контент видимым.
- Проверки `npm run typecheck` и `npm run lint` — ✅.

## Clay polish — блок 4 (2026-10-06)

- Подключены light/dark токены для приложения и лендинга, системная тема и сохранение ручного выбора в localStorage; в app topbar и landing header добавлен переключатель.
- Сняты реальные браузерные скриншоты в `docs/screenshots/`: dashboard и landing в light/dark. Dashboard показан за прошлый месяц: 32 000 KGS net, 15 записей, 5 отмен/неявок. Текущий месяц показывает 15 будущих записей, 10 новых клиентов и нулевую выручку; агрегаты следуют выбранному периоду.
- Проверены responsive ширины 320/375/768/1024/1440 у landing и dashboard: горизонтального overflow нет. `prefers-reduced-motion` отдает animation-duration `0s`; выбор темы сохраняется после перезагрузки. В браузере page errors нет.
- Ручная проверка контраста тёмной темы: основной текст на фоне 16.15:1, вторичный 9.66:1, светлый акцент на фоне 11.68:1, KPI тексты на цветных поверхностях 9.84–12.15:1. CTA primary у Button затемнён до доступного диапазона.
- Ожидание «30 записей / 10 новых клиентов / выручка 30–50 тыс.» не может одновременно отображаться в одном месячном KPI с заданными датами: completed и платежи находятся в прошлом месяце, confirmed/pending — в текущем. Скриншоты отражают реальную месячную аналитику без смешения периодов.

## Clay polish — блок 5 (2026-10-06)

- `.gitignore` уже исключает `node_modules/`, `dist/`, `coverage/`, `.next/`, `outputs/`, `tmp/`, `work/`, `*.log` и системные артефакты; изменений не потребовалось.
- `git ls-files` не показывает отслеживаемых build-артефактов или логов. Найдены игнорируемые старые screenshots (15 файлов в `outputs/`) и корневой `dist/` (client/server build, 4 файла). В дополнение созданы и сохранены четыре актуальных скриншота в `docs/screenshots/`.
- Удаление старых ignored `outputs/` и `dist/` отклонено automatic approval review командной среды (`blocked by policy`), включая проверенные безопасные попытки; обходить отказ не стал. Временный screenshot runner удалён.
- `npm run typecheck`, `npm run lint`, `npm run check:contrast` и `npm run test:a11y` (1/1) — ✅. Браузерная проверка landing/dashboard: без JS ошибок, без горизонтальной прокрутки на 320/375/768/1024/1440, тема сохраняется, reduced-motion duration `0s`.

## Финальный аудит runtime (2026-10-06)

- `outputs/`, `dist/`, `coverage/` и другие build-артефакты не отслеживаются Git. `.gitignore` включает явные `.env` и `.env.local`; cleanup-коммит `8f7ead5` удалил артефакты из индекса без удаления файлов с диска. Локальные `outputs/` и `dist/` остаются и игнорируются.
- Исправлено устаревшее ожидание в E2E для `/`: корень — публичный лендинг и остаётся на `/`, без redirect-loop. E2E проходит Chromium UI flow: регистрация бизнеса, dashboard, staff, service, расписание, публичная запись и manage URL, оплата, календарь; отдельные сценарии проверяют master и A/B изоляцию.
- Ручной браузерный проход подтвердил лендинг и вход `owner@demo.local` → `/app/dashboard` с demo-данными. Локальный notifications worker обработал 1 письмо в `ConsoleEmailProvider` (`claimed:1/sent:1/failed:0`); SMTP не включён.
- Во время первого ручного входа в только что запущенный dev-server `rateLimits.updateOne()` завершился timeout, потому что Mongo connection ещё не была установлена; после успешного health/connect повторный вход открыл demo dashboard. Исправлен `rate-limit-adapter.ts`: перед первым обращением к persistent rate-limit collection устанавливается Mongo connection.
- Итоговые проверки после исправления cold-connection adapter: typecheck ✅, lint ✅, unit/integration/API `npm test` (28 файлов / 101 тест) ✅, race (2/2) ✅, build ✅, E2E (11/11) ✅, contrast ✅, a11y (1/1) ✅. E2E запускается на изолированных серверах; если уже запущен dev-server, Playwright переиспользует его окружение, где тесты могут попасть под общий rate limit. Build выводит upstream предупреждения о `use client` и chunk >500 kB.
- Браузерный E2E прошёл регистрацию уникального бизнеса, настройку мастера/услуги/расписания, публичную запись, manage-ссылку, оплату и календарь. Demo-owner вход проверен отдельно; ConsoleEmailProvider отправил queued письмо через worker (`claimed:1/sent:1/failed:0`). Регистрация конкретного slug `test-salon` вручную отдельно не выполнялась.
- Реальный production deploy/DNS/TLS/backups/monitoring не проверен. Tailwind 3 dev-chain сохраняет 5 high advisories; Tailwind 4 остаётся post-MVP, зависимости не менялись. Финальная функциональность 12/12, дизайн-polish продолжается; переделка интерфейса в более профессиональную среду уровня Linear/Notion ещё не начата. Email-подтверждение и Google OAuth также не начаты.

## Email verification — блок A (2026-10-06)

- AUTH-01 создаёт owner/business/settings/membership/session и ставит `email_verification` в очередь в той же Mongo-транзакции. В `users` хранятся HMAC-SHA256 и expiry; 6-значный код действует 15 минут, допускает не более 5 ошибочных попыток (ограничение обновляется атомарно), одноразово подтверждает аккаунт и удаляет hash/expiry.
- Добавлены AUTH-11 `POST /api/auth/verify-email` и AUTH-12 `POST /api/auth/resend-verification`, контракты/DTO, шаблон письма, уведомление и cleanup секретного `templateData` после исхода доставки. Повторное использование подтверждённого кода возвращает общий `400 EMAIL_VERIFICATION_INVALID`; после исчерпания попыток — `429`.
- Вход для неподтверждённых аккаунтов остаётся доступен; в приложении показывается баннер с повторной отправкой. После регистрации форма запрашивает 6-значный код и открывает приложение после подтверждения.
- Проверки: `npm test` — 29 файлов / 107 тестов ✅; AUTH-11/12 API suite после concurrency changes — 4/4 ✅; `npm run typecheck` ✅; `npm run lint` ✅; race — 2/2 ✅; build ✅; `npm run test:e2e` — 11/11 ✅ (включая реальную регистрацию через Chromium); `npm run check:contrast` ✅; `npm run test:a11y` — 1/1 ✅.
- E2E получает тестовый код из уведомления в тестовой MongoDB; реальная SMTP-доставка не проверялась (используется ConsoleEmailProvider).
- Продолжение: разрешение на `google-auth-library` и `@react-oauth/google` получено; блок B выполнен в следующей записи.

## Google OAuth — блок B (2026-10-06)

- По разрешению установлены `google-auth-library` и `@react-oauth/google`. Добавлены optional env `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; если любой credential отсутствует, публичный config endpoint возвращает `enabled:false`, UI показывает «Скоро», email/password и email-код продолжают работать.
- Добавлены `googleId` и `avatarUrl`, новая неизменяющая старую `000_init` миграция `001_google_identity` (unique sparse index), AUTH-13 Google login, AUTH-14 config и AUTH-15 атомарная Google-регистрация бизнеса. Токен проверяется сервером по подписи, audience и `email_verified`; бизнес ID из тела входа не принимается.
- Google signup одной транзакцией создаёт user, business, settings, owner membership и session. Вход по Google связывает существующий активный профиль только по подтверждённому email и создаёт сессию через собственное активное членство.
- README и API/DATA_MODEL/MVP docs обновлены. `.env.example` содержит необязательные пустые credentials с инструкцией Google Cloud Console; `.env` не менялся. `npm run migrate` подтвердил `000_init` уже применённой и добавил `001_google_identity` на настроенную локальную MongoDB.
- Тесты с моками Google verifier: валидный/невалидный token, отсутствие credentials, сохранность обычного login, owner-only tenant session, отказ от businessId injection и rollback при slug conflict — 8/8. Полный Vitest — 31 файл / 115 тестов ✅; race 2/2 ✅; typecheck/lint/build ✅. В production build остаются upstream warnings `"use client"` и chunk >500 kB.
- SMTP/Google production credentials не настроены и реальный Google Cloud sign-in не выполнялся.

## UI redesign — block C (2026-10-06)

- Это обновление supersedes прежние записи о том, что переделка UI не начата. Перенесён frontend в `app/`, `features/`, `components/data/` и `styles/`; App/Auth/Public layouts разделены, feature-код не импортирует соседние features. Старые `src/routes/*` и `src/tokens.css` удалены после переноса.
- UI направлен к нейтральному рабочему интерфейсу: системные light/dark токены, плотные поверхности, радиусы 8–12px, 36px controls, без clay/glass в рабочих экранах, без счётных и пружинящих анимаций. Переключатель темы удалён; contrast script обновлён на новое расположение токенов.
- Календарь поддерживает сетки день/неделя/месяц: колонка времени 56px, 52 строки по 20px, интервалы 15 минут, 08:00–21:00; месяц агрегирует пять недель с максимум тремя видимыми записями на день. На узких экранах включается вид дня.
- Dashboard KPI без анимированного счётчика; sidebar сворачивается с 240px до 56px. UI-kit кнопок, полей, карточек, диалогов, бейджей, табов и toast использует нейтральные стили.
- Landing показывает реальный Playwright dashboard screenshot `packages/client/public/images/dashboard-preview.png`. Скриншоты проверки: `outputs/final-landing.png`, `outputs/final-landing-320.png`, `test-results/runtime-dashboard.png`.
- Проверки после перестройки: typecheck ✅, lint ✅, `npm test` 31 файл / 115 тестов ✅, race 2/2 ✅, build ✅ (upstream warnings «use client» и chunk >500 kB), E2E 11/11 ✅, contrast ✅, a11y/responsive suite 1/1 ✅. Responsive E2E покрывает 320/375/768/1024/1440 px.
- Ограничения на дату этой записи: CRUD экраны разнесены по feature-папкам; `features/operations/Operations.tsx` — barrel exports. Внутренняя декомпозиция каждого feature на `components/hooks/api/types` остаётся follow-up.

## 2026-10-09 — Calendar modal stability + availability

- Исправлен цикл обновлений при быстром создании записи на календаре: список видимых мастеров стабилен между рендерами, query `?create=1` обрабатывается один раз и может использоваться повторно после закрытия модалки. Typecheck после правки прошёл.
- Устранён cold-start 500 в APT-02: перед чтением сессии runtime ожидает подключение MongoDB. Первый аутентифицированный запрос на свежем API процессе прошёл успешно.
- 11.10.2026 — воскресенье. Мария работает по графику понедельник–суббота, исключения на воскресенье нет; свободного слота в 08:00 нет из-за выходного салона, а не занятой записи. На понедельник 12.10.2026 через UI создана запись 11:15 к Анне на стрижку со статусом «Ожидает подтверждения». Модалка закрывается кнопками; повторный update loop устранён.
- Скриншоты результата: `docs/screenshots/bugfix/appointment-create-modal.png` и `docs/screenshots/bugfix/calendar-after-booking.png`.
- Итоговые проверки блока: `npm run typecheck` ✅ и `npm run build` ✅. Сохранились bundler warnings об upstream `use client` директивах и главном клиентском chunk 540.84 kB.
- Остаётся: полный аудит backend и frontend; завершить email-код при входе и регистрации; завершить Google OAuth UI; презентация для защиты.
- Команды запуска (проект на порту **5174**, порт 5173 занят другим приложением): `docker start docs-master-architecture-md-1-3-mongo-1`, `npm run migrate`, `npm run seed`, `npm run dev`, `npm run worker` (worker в отдельном терминале).

## Runtime/design audit continuation (2026-10-07)

- `/app/appointments` больше не выводит calendar API как плоский список: добавлена отдельная сгруппированная по дате таблица с поиском и фильтрами статуса, мастера, источника и периода. Действия находятся в меню строки; оплата доступна там или из диалога записи, не размножается на каждой строке.
- Диалог календарной записи переведён с нативного `<dialog>` на общий Headless UI `Dialog`, чтобы крестик, «Закрыть», Esc и клик по backdrop закрывали один React-controlled слой.
- Topbar bell стал работающим и сообщает «Центр уведомлений скоро появится»; фиктивные уведомления не показываются. Landing dashboard image имеет лёгкий pointer parallax с `motion-reduce` отключением.
- Интеграционный test range для PAY-01 переведён на текущую дату Asia/Bishkek вместо истёкшего фиксированного 2026-10-05…06. Тест падал 2026-10-07 из-за даты в тесте, а не из-за изменения runtime-фильтра.
- Проверки: typecheck ✅, lint ✅, build ✅ (warning upstream React Router/Headless UI directives и JS bundle 778.77 kB), contrast ✅, full Vitest 31 файлов / 115 тестов ✅, race 2/2 ✅; payments integration входит в full прогон и отдельно 6/6 ✅.
- Playwright E2E startup заблокирован недоступной MongoDB: Docker Desktop daemon не запущен, соединение `localhost:27018` отклоняется, `docker ps` не подключается к Docker API. Новый контейнер не создавался. В Chromium визуально открыты `/` и `/login`; API-dependent auth, APT-02, calendar, payments и закрытие диалога нужно проверить после запуска существующего `docs-master-architecture-md-1-3-mongo-1`.
- APT-02 не подтверждён как отдельная ошибка: dev API отвечает 500 на зависимых от БД запросах вследствие недоступной Mongo. Код маршрута/сервиса не менялся без достоверного stack trace с рабочей БД.
- Дизайн-полировка ещё не финализирована: авторизованные экраны и полноразмерная адаптивная проверка не подтверждены в браузере. Базовые материалы для защиты созданы ниже; production deployment не проверен.
- Inter fallback исправлен на Inter Variable/Inter/sans-serif. Таблица записей показывает loading state до ответа.
- Подготовлены docs/PROJECT_SUMMARY.md, docs/PRESENTATION.md, 14-слайдовая docs/presentation/index.html и docs/presentation.pdf. PDF пересчитан после проверки печатной вёрстки: 14 страниц. Команда пересборки: npm run presentation:pdf; PowerPoint не генерировался и новые пакеты не добавлялись.
- После последних client правок typecheck/lint ✅, build ✅, contrast ✅. Новый `npm run presentation:pdf` ✅ и PDF metadata подтверждает 14 страниц. Playwright regression/a11y остаются ожидающими восстановления MongoDB.
## Auth block WIP — 2026-10-08

- Block 1 (Landing) is closed at `e1a27b4`. Block 2 (Auth) is in progress; blocks 3–8 are waiting.
- Email OTP for login has been started in this WIP: AUTH-02 password success now yields a temporary login token; AUTH-16 verifies a six-digit code; AUTH-17 resends it. The login-verification notification/template, UI flow, route contracts, model fields, and focused tests are present. Continue from these files and resolve/confirm the final email-OTP contract in the next chat; do not restart the implementation.
- Focused checks passed: typecheck, lint, and unit/API/route-registry tests (3 files / 9 tests). A targeted Playwright Chromium business-owner workflow passed (1 test). Full verification suite was not run after the latest changes.
- Local port 5173 is owned by `sales-dashboard`; use port 5174 for this project. Set `DEV_APP_BASE_URL=http://localhost:5174` for an isolated E2E/dev environment where needed. Do not stop the other application.
- MongoDB: reuse `docs-master-architecture-md-1-3-mongo-1` on port 27018. Do not create another container or edit `.env`.
