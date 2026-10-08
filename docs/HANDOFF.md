# HANDOFF.md

## Актуальная передача — 2026-10-08

- Блок 1 (Landing) закрыт: `e1a27b4 feat(landing): rebuild landing and add theme previews`.
- Блок 2 (Auth) в работе. Email-код для входа частично реализован в текущем WIP-коммите: AUTH-02 возвращает временный `loginToken`, добавлены AUTH-16 verify и AUTH-17 resend, уведомление `login_verification`, UI-код и тесты. Следующему исполнителю нужно продолжить с этого состояния, проверить изменения и решить вопрос о финальном контракте email-OTP в новом чате; не переписывать с нуля.
- В этой сессии прошли typecheck/lint и целевые unit/API/route registry тесты (3 файла / 9 тестов). Целевой Playwright Chromium сценарий регистрации бизнеса и полного owner workflow завершился успешно (1 passed, 44.9s). Полный набор проверок после Auth-изменений не запускался.
- Порт 5173 занят приложением `sales-dashboard`; для этого проекта использовать `5174` (в том числе `DEV_APP_BASE_URL=http://localhost:5174` при запуске соответствующего dev/E2E окружения). Не завершать чужой процесс.
- Блоки 3–8 ожидают.
- Для тестов с прокси учитывать `TRUSTED_PROXY_HOPS=1`, чтобы E2E запросы не делили один IP для rate limit.

Команды: существующий MongoDB-контейнер `docs-master-architecture-md-1-3-mongo-1` на `27018`; затем `npm run migrate`, `npm run dev`, проверки `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:race`, `npm run build`, `npm run test:e2e`, `npm run check:contrast`, `npm run test:a11y`. Не менять `.env` и не создавать новый MongoDB-контейнер.

## Передача работы — 2026-10-08 (актуальное состояние)

### Текущий этап

Этап 4 — радикальная доработка интерфейса: закрыто 8 из 13 экранов. Staff list + profile tabs реализованы и проверены в реальном Chromium. Последний коммит кода: `3878b18 feat(stage-4): redesign staff screens`. Routing и 404 в этой сессии не менялись и остаются отложенными.

### Что сделано в текущем этапе

- `12a44c7` — календарь: overlap и мобильная сетка.
- `a032027` — карточка клиента: русские подписи, часовой пояс и валюта.
- `4c942e2` — локатор календаря в E2E; Chromium E2E 13/13.
- `8402bd8` — мобильный список клиентов.
- `d296de8` — убран демо-баннер email.
- `73cd4d3` — адаптивные оплаты до 1536px.
- `8ba183a` — адаптивные записи до 1280px.
- `a880043` — адаптивные услуги до 1120px.
- `3878b18` — Staff: responsive list, пять профильных вкладок, light/dark и mobile screenshots, axe/keyboard/error-state regression; подробности — в `PROGRESS.md` и `docs/AUDIT.md`.

### Что осталось

- Этап 4: Dashboard, Landing, Login, Register/Verify-email, Settings, My-day и Public-booking. Routing/404 не менять без отдельного решения.
- Этап 5: анимации Motion + GSAP — установленные скиллы пока не применены.
- Этап 6: эскизы 24 страниц.
- Этап 7: презентация, walkthrough и финальные скриншоты.

### Команды запуска и проверок

- Использовать существующий MongoDB Docker-контейнер `docs-master-architecture-md-1-3-mongo-1` на порту 27018; не создавать новый контейнер и не затрагивать контейнеры/порты reference, 27017 и 6379.
- `docker start docs-master-architecture-md-1-3-mongo-1` (если остановлен), затем `docker ps`.
- `npm run migrate`
- `npm run seed` — локальные демо-данные; вход: `owner@demo.local` / `demo-password-123`.
- `npm run dev`
- `npm run typecheck && npm run lint && npm test`
- `npm run test:race`
- `npm run test:e2e`
- `npm run test:a11y`
- `npm run check:contrast`
- `npm run build`

После обновления handoff отдельные проверки не запускались; см. подтверждённые результаты в записях ниже и запускайте их заново перед дальнейшими изменениями.

## Обновление 2026-10-08 — Staff

- Реальная MongoDB на порту 27018 использована Playwright Chromium; новый контейнер не создавался.
- Staff list/detail проверены на 320/375/768/1024/1440px, в light/dark и axe без serious/critical; пять вкладок, arrow-key navigation, error/retry/empty/validation/save states; loading skeleton реализован. Отчёт и screenshots см. `docs/AUDIT.md` / `PROGRESS.md`.
- Typecheck/lint ✅; unit+integration+API 118/118 ✅; race 2/2 ✅; build ✅ с upstream `use client` и large client chunk warnings; contrast ✅; `test:a11y` 7/7 ✅; полный `test:e2e` ✅ 18/18.

## Обновление 2026-10-08 — стабилизация после WIP

- Предыдущий shadcn WIP-коммит содержал повреждённые исходники UI. `packages/client/src/app`, `src/features`, `src/components/data` и `main.tsx` восстановлены из последней компилируемой базы `d3f9021`, затем исправлены lowercase imports/Case-only пути компонентов, DialogShell и CSS entry.
- Проверки после восстановления: миграции уже применены; typecheck ✅, lint ✅, полный Vitest ✅ (31 файл / 115 тестов), race ✅ (2/2), build ✅; Playwright Chromium root redirect smoke ✅. Build сообщает о клиентском бандле 1.26 MB и upstream `use client` warnings.
- `npm run dev` поднимал Vite и API; прямые Chromium переходы на landing/login/register и перечисленные app/public URL открывали document shell; без сессии защищённые app routes ведут на `/login`. Authenticated CRUD walkthrough не запускался в этом smoke.
- Shadcn migration всё ещё частичная и visual-ready не считается: legacy EmptyState/ErrorState/Radio/Toast остаются, AppLayout и часть экранов ещё используют native/custom UI, все 24 эскиза и light/dark скриншоты отсутствуют.
- Seed data is available for real authenticated UI review: `npm run seed` twice succeeded and upserted 3 staff, 5 services, 10 customers, 32 appointments, and 11 payments. The seed now writes appointments sequentially and retries only occupied-key collisions using valid business-hour slots. Login: `owner@demo.local` / `demo-password-123`. The first seed invocation before this fix failed on a preexisting unique `occupiedKeys` value; its upserts were then completed by the successful reruns.
- Animation guidance installed project-locally: `.agents/skills/motion`, `.agents/skills/awwwards-animations`, `.agents/skills/emil-design-eng`, `.agents/skills/animate`; installer lock is `skills-lock.json`. Exact `emilkowal-animations` was not present in the named repo; official Emil equivalents are installed. The given `DevMar` URL failed cloning, so the public `devmartinese/awwwards-animations-skill` repo was used. Its scanner said High Risk; content inspection found Markdown guidance and reference files only, no executable scripts or secret/network extraction behavior. No motion runtime packages installed yet.
- Stage 3 audit is in `docs/AUDIT.md`; 42 Chromium baseline screenshots are in `docs/screenshots/audit-before/`. At baseline, calendar placement classes were not emitted; customer detail output raw backend keys / ISO dates / minor-unit amounts; payments table wrapped badly; seeded demo accounts were unverified and showed a persistent banner; appointment modal could show a generic error. The calendar placement blocker is now fixed; remaining audit items are in `docs/AUDIT.md`. Baseline client chunk was 1.26 MB minified (365 KB gzip).
- Stage 4 calendar work is now complete for its priority layout findings: static 1–52 grid utilities; 30-minute cards readable at ≥39px; mobile automatically switches to Day and the 320/375px day grid has no inner horizontal overflow; first time label is visible; payment action no longer wraps; overlapping bookings from separate masters receive distinct calendar lanes. `assignCalendarLanes` has unit coverage for overlap, nested, adjacent, and disconnected intervals. Real Chromium E2E created two same-time bookings, verified side-by-side card bounds, captured light/dark, then canceled test records. Evidence/screenshots: `docs/screenshots/calendar-after-light.png`, `calendar-after-dark.png`, `calendar-after-mobile.png`, `calendar-overlap-light.png`, `calendar-overlap-dark.png`. Full a11y/responsive suite is 2/2; keyboard-only slot creation remains a separate audit item.
- Stage 4 localized the customer detail view and added a responsive customer list. Detail fields/statuses and amounts are localized in the business timezone; history/payment rows stack on mobile. The list uses cards below 768px with name, phone, email, source, and local created date, retaining the desktop table. Real Chromium verifies customer detail/list against seeded MongoDB, both themes, axe, 320/375/768/1024/1440px, and customer navigation. List screenshots: `docs/screenshots/customers-after-mobile-light.png`, `customers-after-mobile-dark.png`; detail screenshots: `customer-detail-after-light.png`, `customer-detail-after-dark.png`. The list run caught and fixed an unnamed icon-only topbar link.
- The persistent demo “Подтвердите email” banner came from seed owner/master users inheriting `emailVerified=false`. `scripts/seed.ts` now marks only local demo accounts verified and removes old verification hashes/expiry; production auth behavior and contracts are unchanged. `npm run seed` passed with 3 staff, 5 services, 19 customers, 41 appointments, and 11 payments; Chromium verifies the banner is absent after demo owner login.
- Payments now use business-timezone timestamps and readable fallback labels instead of exposing related-record IDs. The 9-column table is shown only at ≥1536px; below it, responsive payment cards preserve customer/service, status, transaction/appointment date, method, amount, refund, author and existing actions. Chromium confirms layout and no page overflow at 320–1536px, desktop table has no internal overflow, and axe finds no serious/critical violations in both themes. Screenshots: `docs/screenshots/payments-after-mobile-light.png`, `payments-after-mobile-dark.png`, `payments-after-wide-light.png`, `payments-after-wide-dark.png`. Targeted test ✅ 1/1, typecheck ✅, lint ✅. Appointments/services tables remain open.
- Appointment rows now become day-grouped cards below 1280px, preserving customer, time, service, master, price, source, status, detail-panel action, and permission-gated payment link. Chromium verified 320–1440px layouts, desktop table fit, dialog opening, and light/dark axe. Screenshots: `docs/screenshots/appointments-after-mobile-light.png`, `appointments-after-mobile-dark.png`. `tests/e2e/a11y/appointments-list.spec.ts` ✅ 1/1, typecheck ✅, lint ✅, build ✅.
- Services now use cards below 1120px, exposing description, duration/buffer, price, assigned staff names, active/online states, and a contextual edit action. The desktop table is kept only on wider shells. Chromium verified 320–1440px layouts, edit dialog, no inner table overflow, and both themes with axe. Screenshots: `docs/screenshots/services-after-mobile-light.png`, `services-after-mobile-dark.png`; `tests/e2e/a11y/services-list.spec.ts` ✅ 1/1, typecheck ✅, lint ✅, build ✅, contrast ✅. Remaining Stage 4 P0s are outer 404/error states and route-level code splitting; service loading/error and filtered-empty states still need explicit checks.
- Latest customer evidence: customer detail targeted E2E ✅ (1/1); customer list targeted E2E ✅ (1/1); typecheck ✅ and lint ✅. Both pages check seeded Mongo data, both themes, axe, and all five responsive widths. Separate master/no-payment and API-error states remain open.
- Calendar continuation evidence: `tests/unit/calendar-appointment-lanes.test.ts` ✅ (3/3), `tests/e2e/calendar-overlap.spec.ts` ✅ (1/1), mobile-day scroll width ✅ at 320/375px. A first full E2E pass exposed an obsolete title selector in `smoke.spec.ts`; it was changed to locate the appointment card by its accessible name and independently passed.
- Latest cumulative gate after both Stage 4 screens: migrate/typecheck/lint ✅; Vitest 32 files / 118 tests ✅; race 2/2 ✅; production build ✅; contrast ✅; Chromium E2E 13/13 ✅; a11y/responsive 2/2 ✅. Build outputs client CSS with overlap-lane utilities and warns about a single 1,261.02 kB minified client JS chunk / upstream `use client` directives. FPS/production Performance trace remains unmeasured. Stage 4 remaining screen priorities are in `docs/AUDIT.md`; keep public data changes in the development demo tenant.
- Historical baseline before Stage 4 screen fixes: migrate, typecheck, lint, Vitest 31 files / 115 tests, race 2/2, build, contrast, Chromium E2E 11/11 and a11y 1/1 passed. Axe checked 13 key routes in both themes; responsive suite covered 320/375/768/1024/1440, keyboard-only public booking, skip-link and Escape. FPS/production Performance trace remains unmeasured.

## Передача WIP на 2026-10-07 — shadcn/ui и P0/P1

Эта секция новее предыдущих заметок ниже и задаёт фактическое состояние рабочего дерева на последнем WIP-коммите.

### Текущая работа: shadcn/ui (частично, сборка стабилизирована 2026-10-08)

- CLI `shadcn@latest` запущен в `packages/client`; создан `packages/client/components.json` (preset `radix-nova`), Tailwind entry перенесён в `packages/client/src/index.css`, добавлены HSL theme variables для light/dark, цвета и aliases в Tailwind config.
- Добавлены/перегенерированы shadcn-компоненты Button, Input, Select, NativeSelect, Dialog, Table, Card, Badge, Tabs, Skeleton, DropdownMenu, Avatar, Sheet, Checkbox, RadioGroup, Pagination, Textarea, Label и Sonner. Часть классов приведена к Tailwind 3, часть иконок — к Font Awesome. `tailwindcss` объявлен devDependency клиентского workspace.
- В `features/*` механически заменены HTML-кнопки, поля, select, textarea и label на Button/Input/NativeSelect/Textarea/Label. Старые CRUD-экраны Staff/Services/Customers/Payments используют временный `DialogShell`-компонент, собранный поверх shadcn Dialog. AppLayout частично переведён на Sheet, DropdownMenu, Avatar и Button.
- **Стабилизация завершена, полный shadcn переход — нет.** Typecheck/lint/build проходят; unit/integration/API — 31 файл / 115 тестов, race — 2/2; root Chromium redirect smoke прошёл. Таблицы/карточки/табы ещё не проведены последовательно по экранам. `UiSandbox` использует прямые shadcn imports; старые EmptyState/ErrorState/Radio/Toast остаются. `components.json` указывает `iconLibrary: lucide`, `pagination.tsx` ещё импортирует Lucide. Sonner Toaster и shadcn Form требуют отдельной проверки/интеграции.
- Форматирование/контраст/визуальный результат shadcn после замены не подтверждены. Скриншоты этого WIP для dashboard/calendar/landing light+dark не создавались. Не считать дизайн Linear-ready.

## P0/P1 для следующего аккаунта

### P0 — блокеры

- **Сессия не сохраняется между заходами браузера** — проверить настройки cookie (в частности Max-Age/Expires и режим persistent session) и воспроизвести повторный вход после закрытия браузера. Архитектуру cookie-сессий не менять без проверки контрактов.
- **Google OAuth:** backend optional flow уже есть; кнопки входа через Google в UI нет. Без credentials должен оставаться безопасный fallback.
- **Email-код при входе:** новая фича для password login, пока не реализована; код при регистрации не считать закрытием этой задачи.
- **Shadcn/UI:** установка и migration частичные. Staff теперь проверен как реальный feature на shadcn primitives; в других feature ещё нужно последовательно проверить Table/Card/Tabs/Select/Dialog/Dropdown/Sheet/Avatar/Toast/Form, старые UI-обёртки и Lucide.
- **Дизайн не соответствует Linear-референсу.** Наличие shadcn dependency само по себе ничего не подтверждает. Проверить визуально и по коду, что компоненты реально используются в `features/*`; до этого дизайн не принимать.

### P1 — после P0

- Провести итоговый визуальный аудит остальных экранов: dashboard, landing, login, register, settings, my-day, public booking и 404/error states. Staff list/detail закрыт текущим этапом; предыдущие responsive-переделки перечислены в `docs/AUDIT.md`.
- Сделать скриншоты всех перечисленных экранов в light и dark темах.
- Записать walkthrough video.
- Full E2E (18/18) и a11y (7/7) теперь прошли на существующем Mongo Docker runtime на 27018. Production/staging deploy и replica-set restore всё ещё не проверены; новый контейнер не создавать.

### Проверки и следующая команда

- Latest gate после Staff: typecheck/lint ✅, unit+integration+API 118/118 ✅, race 2/2 ✅, build ✅, contrast ✅, `test:a11y` 7/7 ✅, `test:e2e` 18/18 ✅. Предыдущие записи в секциях ниже — исторические результаты recovery до этого прохода.
- Следующее продолжение — Dashboard как следующий экран этапа 4; учитывать список оставшихся экранов в актуальной передаче выше и обновить `PROGRESS.md` после завершения.
- Backend, API contracts, Mongo architecture and `.env` в этом WIP намеренно не менялись.

## Стек
Vite + React + Express 5 + MongoDB 8.0 + Node 24. Monorepo: packages/client, packages/server, packages/shared.

## Историческая сводка функциональности (обновлено в актуальной передаче выше)
Этапы функциональности 1–12/12 реализованы. Этот audit продолжает UI redesign после `9d5f50d`; актуальный статус Stage 4 находится в первых разделах handoff. Проект использует Inter Variable, нейтральные light/dark токены, feature-first frontend-разделение, календарные сетки day/week/month и реальные dashboard/calendar screenshots на landing. Production deployment не выполнен; остаются 5 high dev-only advisories.

## Последний коммит кода
`3878b18 feat(stage-4): redesign staff screens`

Предыдущие commits этого продолжения: `728884a fix(ui): improve appointment workflows and dialog behavior`, `c9eee18 docs(handoff): record runtime audit commit`. Redesign baseline до аудита: `9d5f50d WIP: design polish (tokens, layout, calendar) - limit reached`.

## Что сделано (по этапам)
- Этап 1 (фундамент): ✅ базовый каркас; проверки typecheck/lint/build выполнялись.
- Этап 2 (модели, Zod, интерфейсы, UI-kit): ✅ модели, миграция, схемы и UI-kit; полнота репозиториев/сервисов и A/B fixtures требует дальнейшей проверки.
- Этап 3 (auth): ✅ AUTH-01…04, AUTH-06…09 и регистрация/вход/сессия; AUTH-05 post-MVP.
- Этап 4 (staff, services, schedule): 🟡 backend и UI экранов сотрудников/услуг/команды готовы; полный route×role/A/B gate впереди.
- Этап 5 (customers, settings): 🟡 backend и UI клиентов/настроек готовы; полный route×role/A/B gate впереди.
- Этап 6a (booking engine): ✅ 15 unit-сценариев §13, шестизонная DST-матрица, проверка TZ процесса UTC/America/Los_Angeles.
- Этап 6b (внутренние записи): ✅ AVL-01, APT-01…06 и основные внутренние потоки; см. PROGRESS.md для race-проверок.
- Этап 6c (публичная запись): ✅ PUB-01…10, управление записью и базовые E2E потоки.
- Этап 7 (calendar): 🟡 CAL-01 и UI сетки/действий готовы; общий role×endpoint/A-B gate впереди.
- Этап 8 (notifications + email): ✅ очередь, dedupe/retry, worker, шаблоны, Console/SMTP providers и SYS-02; напоминания без manage-ссылок.
- Этап 9 (payments): ✅ PAY-01/02/04/05/06, /app/payments, целочисленные денежные суммы, идемпотентность, atomic refunds и append-only transactions.
- Этап 10 (dashboard): ✅ DSH-01/05 и MST-01; 4 KPI с previous, ближайшие записи, master day/upcoming/counts, локальные бизнес-периоды с Luxon/DST и tenant match-first агрегации. Master load делегирует CAL-01/общему booking-engine.
- Этап 11: 11.1 закрыл UI хвосты 4/5/7 и booking-engine §13/DST; 11.2 удалил неиспользуемый `packages/client/src/styles.css`; 11.3 добавил contrast/responsive/a11y/keyboard; 11.4 закрыл E2E §11 сценарии #3/#5/#7. Полный E2E 9/9.
- Этап 12: все 64 MVP route ID имеют concrete handlers; session role matrix + A/B probes добавлены. AUTH-07/08/09 подключены, Gitleaks и CSP checks проходят. Image build + production-mode HTTP header smoke проходят; deploy runbook и README подготовлены. Реальный production/staging deployment не выполнен.

## Что НЕ сделано (важно для следующего исполнителя)
- Интерфейс приведён к нейтральному направлению; `features/operations/Operations.tsx` — только barrel exports, экраны живут в своих feature-папках. Файловая декомпозиция компонентов/hooks/api внутри каждого feature остаётся дальнейшей архитектурной полировкой.
- Inter Variable установлен и используется; прежняя заметка о недостающем шрифте устарела.
- Email-подтверждение пользователей: AUTH-11/12 готовы; Google OAuth: AUTH-13/14/15 optional маршруты готовы. Настроенная Google Cloud application и production sign-in не проверены.
- Этап 11 закрыт. Автоматическая проверка ширин не заменяет ручной просмотр на реальных устройствах и скринридером.
- Full `npm audit --audit-level=high` сообщает 5 high в dev-only Tailwind 3.4.19 dependency chain (chokidar/micromatch/braces); `npm audit --omit=dev` чист. По указанию не менять зависимости; Tailwind 4 post-MVP. Это остаётся открытым security release risk.
- Content-Security-Policy — заголовок установлен и проверен API-тестом.
- `npm audit --audit-level=high` находит 5 high в Tailwind 3 dev dependency цепочке (chokidar/micromatch/braces); исправление npm предлагает breaking upgrade на Tailwind 4, который не применялся.
- Gitleaks 8.30.1 clean по текущим source/docs/tests directories. Git history retains 4 generic-api-key false positives in prior test fixture versions (`tests/unit/env.test.ts`, `tests/unit/notifications.test.ts`); they were dummy test-only values and current fixtures are replaced with low-entropy values. No actual credential was identified.
- Production container boot/HTTP 404/security-header smoke прошли; Mongo был намеренно недоступен, health readiness не подтверждалась. Нет production/staging target, DNS/TLS, SMTP и backup destination; реальный deploy/restore/monitoring не проверялись.
- Общая матрица проверяет handler ID всех 64 endpoint contracts, все session routes для owner/admin/master/anonymous и representative A/B path/body/cross-entity isolation probes; staging role/security exercise остаётся непроверенным.
- Платёжные UI/API сценарии отдельно в E2E не проверялись; stage 9 unit/integration/race были зелёными.

## Известные проблемы / TODO
- Текущая проверка использовала существующий контейнер MongoDB на 27018; новый контейнер не создавался. Полный E2E/a11y прошёл через реальный Docker runtime.
- Production/staging deployment, replica-set backup/restore, TLS/DNS/monitoring и SMTP не проверены.
- `/app/appointments` переведён на сгруппированные строки/карточки; responsive Chromium E2E проходил в последней проверке.
- Уведомления в topbar пока имеют честный текст «Центр уведомлений скоро появится», а не очередь пользовательских уведомлений.
- Добавлены `docs/PROJECT_SUMMARY.md`, `docs/PRESENTATION.md`, Reveal.js deck `docs/presentation/index.html`, экспорт `docs/presentation.pdf` (14 слайдов/страниц) и команда `npm run presentation:pdf`.
- При последующих изменениях поддерживать route×role/A/B gate в соответствии с PERMISSIONS_MATRIX.md; staging security exercise ещё не проводился.
- SMTP требует домен/настройки; ConsoleEmailProvider использовался для тестовой доставки.
- Реальный production deployment не проверялся.
- Build выводит предупреждения о директивах `"use client"` в зависимости React; сборка успешна.

## Исторические результаты тестов до текущего прохода
- Текущий audit (2026-10-07): `npm run typecheck` ✅, `npm run lint` ✅, `npm run build` ✅ (upstream directives и chunk >500kB warnings), `npm run check:contrast` ✅, `tests/integration/payments.test.ts` 6/6 ✅ после исправления тестового диапазона на динамическую дату.
- Full `npm test -- --maxWorkers=1` ✅ 31 файл / 115 тестов; `npm run test:race` ✅ 2/2.
- Focused Playwright run остановлен: webServer ждёт HTTP health/readiness, потому что Mongo недоступна. В браузере вручную открыты и визуально проверены `/` (landing) и `/login`; `/app/*` требует работающей Mongo/session. В `tests/e2e/smoke.spec.ts` добавлена регрессия на таблицу записей и закрытие appointment dialog; она пока не прогнана.
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm test` — 28 файлов, 101 тест ✅
- `npm run test:race` — 2 файла, 2 теста ✅
- `npm run build` ✅ (есть предупреждения `"use client"` от зависимостей)
- `npm run test:e2e` — 11 тестов ✅, включая E2E-3/E2E-5/E2E-7, axe/responsive/keyboard suite, landing, registration, dashboard, booking/manage, payments и calendar UI. При переиспользовании локального dev server для Playwright задайте `TRUSTED_PROXY_HOPS=1`; без него X-Forwarded-For из E2E не распознаётся и shared rate limit может блокировать регистрации.
- `npm run test:unit`, `npm run test:integration` — включены в полный прогон; `npm run test:api` — 4 файла / 13 тестов ✅.
- `npm run check:contrast` ✅
- `npm run test:a11y` ✅ — 1 сценарий; 12 маршрутов без serious/critical нарушений.
- Итоговый прогон 2026-10-06: typecheck ✅, lint ✅, `npm test` 28 файлов/101 тест ✅, race 2/2 ✅, build ✅, E2E 11/11 ✅, contrast ✅, a11y 1/1 ✅. ConsoleEmailProvider доставил 1 очередь через worker. Build выдаёт предупреждения dependency `use client` и chunk >500kB.
- UI redesign commit `2c301a7`: typecheck ✅, lint ✅, `npm test` 31 файла/115 тестов ✅, race 2/2 ✅, build ✅, E2E 11/11 ✅, contrast ✅, a11y/responsive 1/1 ✅. Build сохраняет upstream `use client` и chunk size warnings.

## Команды запуска
- Docker: использовать существующий контейнер `docs-master-architecture-md-1-3-mongo-1` (healthy, порт 27018). Новый не создавать.
- `npm run migrate`
- `npm run typecheck && npm run lint && npm test`
- `npm run test:race`
- `npm run build`
- `npm run test:e2e`
- `npm run check:contrast`
- `npm run test:a11y`
- `npm run seed` — повторно создаёт demo-данные idempotently; demo credentials см. README / PROGRESS.
- `npm run dev` — запускает API и Vite клиент.
- `npm run worker` — локальный notifications worker.
- `cd packages/server && npm run dev`
- `cd packages/client && npm run dev`

## Правила для следующего исполнителя
- Контракты (DATA_MODEL, API_CONTRACTS, PERMISSIONS_MATRIX, BOOKING_ENGINE_SPEC, PAYMENTS_SPEC, NOTIFICATIONS_SPEC, DASHBOARD_SPEC, PRODUCT_SPEC, MVP_SCOPE) — НЕ менять.
- Архитектура (tenantPlugin, occupiedKeys, withTransaction, cookie-сессии) — НЕ менять.
- Комментарии — по CODING_STANDARDS §15 (инварианты, ссылки на документы).
- Не трогать reference-проект, beautyflow-контейнеры (27017, 6379), `.env`.
- Работать блоками. Коммит после каждого.

## Что дальше
Продолжить этап 4 со следующего экрана — Dashboard; актуальный список хвостов записан в начале этого файла и `PROGRESS.md`. После экранов 4-го этапа перейти к Motion/GSAP, эскизам и финальным материалам. Deploy по `docs/DEPLOY.md` (replica set, TLS, секреты, backup restore, мониторинг и production email) остаётся отдельным незакрытым блоком. Решение по 5 high dev-only npm audit advisories отложено, Tailwind 4 остаётся post-MVP. Google OAuth optional и работает только после настройки credentials; без них UI показывает «Скоро», email/password и email-код не затронуты. Сохранять ограничения проекта и проверять `PROGRESS.md`.
