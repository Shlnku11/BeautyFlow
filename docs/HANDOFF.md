# HANDOFF.md

## Стек
Vite + React + Express 5 + MongoDB 8.0 + Node 24. Monorepo: packages/client, packages/server, packages/shared.

## Текущий этап
Этапы функциональности 1–12/12: реализованы. Статус проекта: функционально готов; claymorphism и тёмная тема реализованы, финальная дизайн-переделка в сторону более профессиональной среды Linear/Notion уровня ещё в работе и не начата. Реальный production deployment не выполнен; 5 high dev-only advisories остаются открытым security risk.

## Последний коммит этапа
`9d3e274 feat(stage-12): AUTH-07/08/09 and security checklist`

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
- Полная визуальная переделка UI в сдержанную профессиональную среду уровня Linear/Notion ещё НЕ начата. Приоритет следующего блока: календарная временная сетка, карточки записей, кнопки, шрифты и дизайн-токены, затем более сдержанный лендинг. Сохранять рабочие сценарии и clay/glass принципы, если они подходят новому направлению.
- Email-подтверждение пользователей и Google OAuth не начаты.
- Этап 11 закрыт. Автоматическая проверка ширин не заменяет ручной просмотр на реальных устройствах и скринридером.
- Full `npm audit --audit-level=high` сообщает 5 high в dev-only Tailwind 3.4.19 dependency chain (chokidar/micromatch/braces); `npm audit --omit=dev` чист. По указанию не менять зависимости; Tailwind 4 post-MVP. Это остаётся открытым security release risk.
- Content-Security-Policy — заголовок установлен и проверен API-тестом.
- `npm audit --audit-level=high` находит 5 high в Tailwind 3 dev dependency цепочке (chokidar/micromatch/braces); исправление npm предлагает breaking upgrade на Tailwind 4, который не применялся.
- Gitleaks 8.30.1 clean по текущим source/docs/tests directories. Git history retains 4 generic-api-key false positives in prior test fixture versions (`tests/unit/env.test.ts`, `tests/unit/notifications.test.ts`); they were dummy test-only values and current fixtures are replaced with low-entropy values. No actual credential was identified.
- Production container boot/HTTP 404/security-header smoke прошли; Mongo был намеренно недоступен, health readiness не подтверждалась. Нет production/staging target, DNS/TLS, SMTP и backup destination; реальный deploy/restore/monitoring не проверялись.
- Общая матрица проверяет handler ID всех 64 endpoint contracts, все session routes для owner/admin/master/anonymous и representative A/B path/body/cross-entity isolation probes; staging role/security exercise остаётся непроверенным.
- Платёжные UI/API сценарии отдельно в E2E не проверялись; stage 9 unit/integration/race были зелёными.

## Известные проблемы / TODO
- При последующих изменениях поддерживать route×role/A/B gate в соответствии с PERMISSIONS_MATRIX.md; staging security exercise ещё не проводился.
- SMTP требует домен/настройки; ConsoleEmailProvider использовался для тестовой доставки.
- Реальный production deployment не проверялся.
- Build выводит предупреждения о директивах `"use client"` в зависимости React; сборка успешна.

## Зелёные тесты на момент остановки
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm test` — 28 файлов, 101 тест ✅
- `npm run test:race` — 2 файла, 2 теста ✅
- `npm run build` ✅ (есть предупреждения `"use client"` от зависимостей)
- `npm run test:e2e` — 11 тестов ✅, включая E2E-3/E2E-5/E2E-7, axe/responsive/keyboard suite, landing, registration, dashboard, booking/manage, payments и calendar UI. E2E следует запускать без уже работающих dev-серверов, чтобы Playwright поднял изолированное тестовое окружение.
- `npm run test:unit`, `npm run test:integration` — включены в полный прогон; `npm run test:api` — 4 файла / 13 тестов ✅.
- `npm run check:contrast` ✅
- `npm run test:a11y` ✅ — 1 сценарий; 12 маршрутов без serious/critical нарушений.
- Итоговый прогон 2026-10-06: typecheck ✅, lint ✅, `npm test` 28 файлов/101 тест ✅, race 2/2 ✅, build ✅, E2E 11/11 ✅, contrast ✅, a11y 1/1 ✅. ConsoleEmailProvider доставил 1 очередь через worker. Build выдаёт предупреждения dependency `use client` и chunk >500kB.

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
По приоритету — начать полную переделку UI: профессиональная календарная сетка и карточки записей, типографика/кнопки/токены, затем сдержанный лендинг. Email-подтверждение и Google OAuth не начинать без отдельного scope. Перед production выпуском провести deploy по `docs/DEPLOY.md`, проверить replica set, TLS, секреты, backup restore, мониторинг и реальные email; получить решение по 5 high dev-only npm audit advisories. До появления VPS/domain/backup target эти действия остаются непроверенными. Сохранять ограничения проекта и проверять `PROGRESS.md`.
