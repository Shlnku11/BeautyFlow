# HANDOFF.md — Передача проекта

## Стек
Vite + React + Express 5 + MongoDB 8.0 + Node 24 (monorepo: packages/client, packages/server, packages/shared).

## Текущее состояние
- Этап по PHASED_PLAN: 6 — Booking (частично).
- Подэтап: 6a/6b, рабочие интервалы/слоты, AVL-01, APT-02, идемпотентность и race-защита создания записи.
- Последний коммит: 14c7aa630a58c3228c71cbcb075edd3b64f0b16b Fix: race в rate-limit upsert + сериализация Playwright race-тестов.
- Рабочее дерево: чистое после коммита.

## Что сделано (по этапам)
- Этап 1 (фундамент): ✅ базовый каркас; текущие проверки проходят.
- Этап 2 (модели, Zod, интерфейсы, UI-kit): частично — модели, миграция, схемы и UI-kit есть; полнота слоя репозиториев/сервисов и A/B fixtures не достигнута.
- Этап 3 (auth): частично — AUTH-01…04 и основные регистрация/вход/сессия реализованы; AUTH-06…09 и полный набор ролей не реализованы.
- Этап 4 (staff, services, schedule): частично — STF-01…04, SVC-01/02/04, STF-06…10; деактивация STF-04, STF-11/12, BLK-01…03 и MEM-* остаются.
- Этап 5 (customers, settings): частично — CUS-01/02/04 и SET-01…03; CUS-03/06 остаются.
- Этап 6 (booking): частично — occupancy, DST-aware working intervals, slots, AVL-01, APT-02, идемпотентный повтор и 20-конкурентный race-сценарий. Остальные appointment и public-booking контракты не готовы.
- Этапы 7–12: не завершены. Этапы 7–10 не начаты; в 11 есть UI-kit/axe smoke; в 12 есть ограниченный smoke/E2E и race набор, полной security/E2E проверки нет.

## Что НЕ сделано в текущем подэтапе
- APT-01, APT-03…06 и остальные переходы/изменения записи.
- Публичные PUB-* маршруты и полный 6c.
- Полный набор booking-engine сценариев из спецификации (включая всю матрицу DST/границ).
- Расширенная матрица конкурентных сценариев; текущий race API проверяет 20 одновременных запросов на один слот.

## Известные проблемы и TODO
- Значительная часть 64 MVP route contracts пока остаётся заглушками (501); зарегистрированный контрактный путь не означает готовую бизнес-логику.
- Не завершены A/B tenant isolation fixtures и полный isolation/security набор; текущий E2E проверяет отдельные tenant-sensitive сценарии.
- Rate-limit persistence имеет исправленный duplicate-key upsert race; соответствие всех контрактных rate-limit политик ещё нужно проверить.
- Email/SMTP не интегрирован и не проверен.
- Vite build успешен, но сообщает предупреждения про модульные директивы `"use client"` в зависимостях React Router/TanStack Query.
- Docker MongoDB и health проверены в текущем окружении; реальные SMTP и production deployment не проверялись.

## Зелёные тесты на момент остановки
- typecheck ✅
- lint ✅
- unit (17) ✅
- integration (5) ✅
- api (2) ✅
- race (1 suite; includes DB unique-index contention) ✅
- build ✅
- E2E (5; feature E2E includes 20 competing booking requests, expecting one success) ✅

## Команды запуска
- `docker-compose up -d mongo`
- `npm run migrate`
- `npm run dev:server`
- `npm run dev:client`
- `npm run typecheck && npm run lint && npm test`

## Правила работы (жёсткие)
- Контракты (DATA_MODEL, API_CONTRACTS, PERMISSIONS_MATRIX, BOOKING_ENGINE_SPEC, PAYMENTS_SPEC, NOTIFICATIONS_SPEC, DASHBOARD_SPEC, PRODUCT_SPEC, MVP_SCOPE) — НЕ меняются.
- Стек менять нельзя (Vite + Express, monorepo).
- Комментарии — по CODING_STANDARDS §15 (инварианты, ссылки на документы).
- Не трогать: reference-проект, beautyflow-контейнеры (27017, 6379), .env.
- Каждый подэтап — коммит + короткий отчёт.

## Что дальше
Сначала завершить незакрытые контракты этапов 4 и 5 согласно PHASED_PLAN, затем закончить этап 6b (APT-01, APT-03…06 и тесты переходов), после чего реализовать 6c public booking. Перед дальнейшим продвижением свериться с PHASED_PLAN и не считать частично реализованные этапы закрытыми.
