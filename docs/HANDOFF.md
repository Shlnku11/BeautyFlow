# HANDOFF.md

## Стек
Vite + React + Express 5 + MongoDB 8.0 + Node 24. Monorepo: packages/client, packages/server, packages/shared.

## Текущий этап
Этап 11: Cleanup + UI/a11y. Статус: завершён (11.1–11.4; E2E §11 сценарии 1–10 закрыты).

## Последний коммит этапа
будет записан после коммита блока 11.4.

## Что сделано (по этапам)
- Этап 1 (фундамент): ✅ базовый каркас; проверки typecheck/lint/build выполнялись.
- Этап 2 (модели, Zod, интерфейсы, UI-kit): ✅ модели, миграция, схемы и UI-kit; полнота репозиториев/сервисов и A/B fixtures требует дальнейшей проверки.
- Этап 3 (auth): ✅ основные AUTH-01…04 и регистрация/вход/сессия; AUTH-06…09 и полное ролевое покрытие остаются частичными.
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
- Этап 12: полный E2E/security/deploy и общая матрица роль × эндпоинт/A/B не завершены.

## Что НЕ сделано (важно для следующего исполнителя)
- Этап 11 закрыт. Автоматическая проверка ширин не заменяет ручной просмотр на реальных устройствах и скринридером.
- Полная матрица роль × эндпоинт и A/B изоляция (этап 12, обязательный gate).
- Этап 12 (полный E2E, security, deploy).
- Платёжные UI/API сценарии отдельно в E2E не проверялись; stage 9 unit/integration/race были зелёными.

## Известные проблемы / TODO
- Сверить оставшиеся частичные контракты этапов 4/5/6a с PHASED_PLAN и спецификациями.
- До финала построить полную матрицу ролей × эндпоинтов по PERMISSIONS_MATRIX.md, включая собственный/чужой tenant и чужие ID в path/query/body.
- SMTP требует домен/настройки; ConsoleEmailProvider использовался для тестовой доставки.
- Реальный production deployment не проверялся.
- Build выводит предупреждения о директивах `"use client"` в зависимости React; сборка успешна.

## Зелёные тесты на момент остановки
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm test` — 26 файлов, 90 тестов ✅
- `npm run test:race` — 2 файла, 2 теста ✅
- `npm run build` ✅ (есть предупреждения `"use client"` от зависимостей)
- `npm run test:e2e` — 9 тестов ✅, включая E2E-3/E2E-5/E2E-7, axe/responsive/keyboard suite и auth/UI smoke.
- `npm run test:unit` — 11 файлов / 40 тестов ✅; `npm run test:integration` — 11 файлов / 46 тестов ✅; `npm run test:api` — 2/2 ✅.
- `npm run check:contrast` ✅
- `npm run test:a11y` ✅ — 1 сценарий; 12 маршрутов без serious/critical нарушений.

## Команды запуска
- Docker: использовать существующий контейнер `docs-master-architecture-md-1-3-mongo-1` (healthy, порт 27018). Новый не создавать.
- `npm run migrate`
- `npm run typecheck && npm run lint && npm test`
- `npm run test:race`
- `npm run build`
- `npm run test:e2e`
- `cd packages/server && npm run dev`
- `cd packages/client && npm run dev`

## Правила для следующего исполнителя
- Контракты (DATA_MODEL, API_CONTRACTS, PERMISSIONS_MATRIX, BOOKING_ENGINE_SPEC, PAYMENTS_SPEC, NOTIFICATIONS_SPEC, DASHBOARD_SPEC, PRODUCT_SPEC, MVP_SCOPE) — НЕ менять.
- Архитектура (tenantPlugin, occupiedKeys, withTransaction, cookie-сессии) — НЕ менять.
- Комментарии — по CODING_STANDARDS §15 (инварианты, ссылки на документы).
- Не трогать reference-проект, beautyflow-контейнеры (27017, 6379), `.env`.
- Работать блоками. Коммит после каждого.

## Что дальше
Продолжить с этапа 12.1: полная матрица роль × эндпоинт + A/B gate, затем security checklist §10 и deploy/README.
