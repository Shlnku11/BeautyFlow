# HANDOFF.md

## Стек
Vite + React + Express 5 + MongoDB 8.0 + Node 24. Monorepo: packages/client, packages/server, packages/shared.

## Текущий этап
Этап 11: Финальный UI/a11y. Статус: этап 10 (Dashboard) завершён; необходимо закрыть хвосты 4/5/6a/7 и продолжить этапы 11–12.

## Последний коммит
Обновить после коммита этапа 10.

## Что сделано (по этапам)
- Этап 1 (фундамент): ✅ базовый каркас; проверки typecheck/lint/build выполнялись.
- Этап 2 (модели, Zod, интерфейсы, UI-kit): ✅ модели, миграция, схемы и UI-kit; полнота репозиториев/сервисов и A/B fixtures требует дальнейшей проверки.
- Этап 3 (auth): ✅ основные AUTH-01…04 и регистрация/вход/сессия; AUTH-06…09 и полное ролевое покрытие остаются частичными.
- Этап 4 (staff, services, schedule): 🟡 backend ✅ для реализованных STF/SVC/BLK/MEM маршрутов; UI частично.
- Этап 5 (customers, settings): 🟡 backend ✅ для CUS/SET функций, перечисленных в PROGRESS.md; UI частично.
- Этап 6a (booking engine): 🟡 частично; не все 15 сценариев и DST из BOOKING_ENGINE_SPEC §13 покрыты.
- Этап 6b (внутренние записи): ✅ AVL-01, APT-01…06 и основные внутренние потоки; см. PROGRESS.md для race-проверок.
- Этап 6c (публичная запись): ✅ PUB-01…10, управление записью и базовые E2E потоки.
- Этап 7 (calendar): 🟡 backend ✅, UI частично.
- Этап 8 (notifications + email): ✅ очередь, dedupe/retry, worker, шаблоны, Console/SMTP providers и SYS-02; напоминания без manage-ссылок.
- Этап 9 (payments): ✅ PAY-01/02/04/05/06, /app/payments, целочисленные денежные суммы, идемпотентность, atomic refunds и append-only transactions.
- Этап 10 (dashboard): ✅ DSH-01/05 и MST-01; 4 KPI с previous, ближайшие записи, master day/upcoming/counts, локальные бизнес-периоды с Luxon/DST и tenant match-first агрегации. Master load делегирует CAL-01/общему booking-engine.
- Этапы 11–12: не завершены.

## Что НЕ сделано (важно для следующего исполнителя)
- UI экранов Staff/Services/Customers/Settings (этапы 4/5).
- Временная сетка календаря и полноценные действия с записью в панели (этап 7); сейчас принятие оплаты доступно через действие записи в календаре.
- Полные 15 сценариев booking-engine и DST (этап 6a).
- Полная матрица роль × эндпоинт и A/B изоляция (этап 12, обязательный gate).
- Этап 11 (очистка прототипа, финальный UI/a11y).
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
- `npm test` — 26 файлов, 77 тестов ✅
- `npm run test:race` — 2 файла, 2 теста ✅
- `npm run build` ✅ (есть предупреждения `"use client"` от зависимостей)
- `npm run test:e2e` — 5 тестов ✅ (включая отрисовку 4 KPI и upcoming)

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
Продолжить с этапа 11 (финальный UI/a11y и дозакрытие хвостов 4/5/6a/7) по PHASED_PLAN. На этапе 12 выполнить полную матрицу роль × эндпоинт и A/B isolation gate.
