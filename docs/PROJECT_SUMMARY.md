# BeautyFlow — краткое описание проекта

## Что это

BeautyFlow — SaaS CRM для салонов красоты: публичная онлайн-запись, календарь команды, клиенты, ручной учёт оплат, email-уведомления и аналитика.

## Стек и структура

Vite, React 19, Express 5, MongoDB 8.0 и Node 24. Monorepo разделён на packages/client, packages/server и packages/shared. Клиентские функции сгруппированы в features; сервер разделяет routes, services, repositories, domain и models; общий пакет содержит Zod-схемы, типы, коды ошибок и русские тексты.

## Дизайн

- Профессиональные нейтральные light/dark токены, акцентный фиолетовый цвет и Inter Variable.
- Единые компоненты, адаптивный layout и календарь день/неделя/месяц.
- Для текущих визуальных изменений нужно повторить Playwright/a11y и ручную responsive проверку после восстановления локальной MongoDB.

## Логика

- Booking engine рассчитывает слоты с учётом услуг, расписания, буферов и часовых поясов; DST gap/fold покрыты отдельной матрицей.
- occupiedKeys и unique multikey index защищают от двойной записи при конкурирующих запросах.
- Tenant context, Mongoose tenant plugin, проверки связанных сущностей и A/B тесты изолируют данные бизнесов.
- Payments хранят целые minor units; transactions — append-only; идемпотентность и транзакции защищают оплаты/возвраты.
- Notifications используют MongoDB queue, dedupe keys, lease/claim, retry/backoff и worker.
- Auth использует cookie-сессии, rate limiting, email verification, password reset/change; Google OAuth остаётся optional и включается credentials.

## Проверки

Состояние на 2026-10-07: typecheck ✅, lint ✅, full Vitest 31 файл / 115 тестов ✅, race 2/2 ✅, build ✅, contrast ✅. Build сохраняет upstream warnings React Router/Headless UI «use client» и JS bundle >500 kB.

В предыдущем UI baseline проходили 11 Playwright E2E и axe/responsive suite. Последний E2E прогон не смог запуститься: Docker daemon выключен, существующая MongoDB на 27018 недоступна. Production DNS/TLS/SMTP/backup restore/monitoring также не проверены.

## Особенности

- occupiedKeys + unique index защищают слот от конкурирующих бронирований.
- Мультитенантная изоляция проверяется на границе API и связанных сущностей.
- Платёжный журнал неизменяем, а гонки refund проверяются race-тестом.
- Worker повторяет временно неудачную доставку уведомлений с backoff.

## Известные ограничения и post-MVP

- 5 high advisories в dev dependency chain Tailwind 3; переход на Tailwind 4 отложен.
- Google OAuth требует credentials; email/password и email-code работают отдельно.
- Topbar пока сообщает, что центр уведомлений скоро появится.
- Не проверен production deploy; post-MVP: admin role, SMS/push, online acquiring, demo video.
