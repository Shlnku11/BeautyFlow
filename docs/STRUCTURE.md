# BeautyFlow — структура проекта

Краткая карта монорепозитория: где находится интерфейс, API, предметная логика и путь создания записи.

## Дерево проекта

```text
NextAppointments/
├── packages/
│   ├── client/
│   │   ├── public/
│   │   │   ├── images/                 # Статические изображения интерфейса
│   │   │   ├── presentation-assets/    # Скриншоты и локальный Inter для защиты
│   │   │   └── presentation.html      # Автономная HTML-презентация
│   │   └── src/
│   │       ├── app/                    # Роутер, layouts и providers
│   │       ├── components/             # Общие UI и data-компоненты
│   │       ├── features/               # Экраны и пользовательские сценарии
│   │       ├── hooks/                  # React hooks для API и сессии
│   │       ├── lib/                    # API-клиент и форматирование
│   │       └── styles/                 # Дизайн-токены и стили редизайна
│   ├── server/
│   │   ├── scripts/                    # Серверные migrate/worker-скрипты
│   │   └── src/
│   │       ├── auth/                   # Токены, сессии и runtime-контекст
│   │       ├── config/                 # Валидация окружения
│   │       ├── db/                     # Подключение, модели, плагины, транзакции
│   │       ├── domain/                 # Чистые правила записи, денег и ролей
│   │       ├── http/                   # Express routes, middleware и ответы
│   │       ├── notifications/          # Очередь, провайдеры и шаблоны
│   │       ├── repositories/           # Tenant-scoped операции с MongoDB
│   │       └── services/               # Прикладные сценарии и проверки
│   └── shared/
│       └── src/
│           ├── schemas/                # Zod-контракты запросов
│           ├── types/                  # DTO и контекст доступа
│           └── constants.ts            # Общие перечисления и константы
├── docs/
│   ├── screenshots/                    # Скриншоты экранов и сравнений
│   ├── presentation/                   # Предыдущая версия материалов
│   ├── STRUCTURE.md                    # Эта карта проекта
│   └── ...                             # Контракты, модель данных, защита
├── scripts/                            # Seed, сборка и служебные сценарии
├── tests/
│   ├── unit/                           # Изолированные unit-тесты
│   ├── integration/                    # Бизнес-правила и MongoDB
│   ├── api/                            # HTTP-контракты и разрешения
│   ├── isolation/                      # Границы tenant-данных
│   ├── race/                           # Конкурентные операции
│   └── e2e/                            # Playwright-сценарии браузера
├── API_CONTRACTS.md                    # Контракты API
├── DATA_MODEL_MONGODB.md               # Модели и индексы MongoDB
├── PERMISSIONS_MATRIX.md               # Роли и разрешения
└── package.json                        # Команды монорепозитория
```

## Назначение ключевых папок

| Папка | Что в ней находится |
| --- | --- |
| `packages/client/src/app/` | Роутер, shell/layout-компоненты, общие providers. |
| `packages/client/src/features/` | Страницы dashboard, календаря, клиентов, оплат, услуг, команды и публичной записи. |
| `packages/client/src/components/` | Повторно используемые визуальные элементы, диалоги, состояния и таблицы. |
| `packages/client/src/lib/` | Вызовы API, преобразование ответов и форматирование значений. |
| `packages/client/public/` | Файлы, которые Vite публикует без сборки; `presentation.html` не подключён к роутеру приложения. |
| `packages/server/src/http/` | Express-маршруты, общая обработка запросов, CSRF, rate limit и ошибки. |
| `packages/server/src/services/` | Прикладные действия: создание визита, доступность, оплата, аутентификация. |
| `packages/server/src/repositories/` | Запросы к MongoDB с фильтрацией по tenant context. |
| `packages/server/src/domain/booking-engine/` | Чистая логика рабочих интервалов, кандидатов слотов, переходов статусов и занятости. |
| `packages/server/src/db/` | Подключение к MongoDB, модели, tenant plugin и транзакции. |
| `packages/shared/src/` | Общие Zod-схемы, DTO, типы контекстов и константы. |
| `tests/` | Unit, integration, API, tenant isolation, race и браузерные проверки. |
| `docs/screenshots/` | Снимки экранов и визуальные сравнения; источник файлов презентации. |

## Функция → файл

| Функция | Основные файлы |
| --- | --- |
| Маршрутизация приложения | `packages/client/src/app/router.tsx`, `packages/client/src/app/layouts/AppLayout.tsx` |
| Лендинг и auth-экраны | `packages/client/src/features/public-landing/Landing.tsx`, `packages/client/src/features/auth/AuthPage.tsx` |
| Обзор владельца | `packages/client/src/features/dashboard/Dashboard.tsx`, `packages/server/src/services/dashboard-service.ts` |
| Календарь | `packages/client/src/features/calendar/CalendarPage.tsx`, `packages/server/src/services/calendar-service.ts`, `packages/server/src/repositories/calendar-repository.ts` |
| Публичная запись | `packages/client/src/features/public-booking/PublicBooking.tsx`, `packages/server/src/http/public-booking-routes.ts`, `packages/server/src/services/public-booking-service.ts` |
| Внутреннее создание/изменение записи | `packages/server/src/http/appointment-routes.ts`, `packages/server/src/services/appointment-service.ts`, `packages/server/src/repositories/appointment-repository.ts` |
| Свободные слоты | `packages/server/src/services/availability-service.ts`, `packages/server/src/repositories/availability-repository.ts`, `packages/server/src/domain/booking-engine/slots.ts` |
| Ключи занятости и пересечения | `packages/server/src/domain/booking-engine/occupancy.ts`, `packages/server/src/db/models/appointments.ts` |
| Tenant-фильтрация Mongoose | `packages/server/src/db/plugins/tenant.ts`, `packages/server/src/db/models/common.ts` |
| Согласованные записи MongoDB | `packages/server/src/db/transactions.ts` |
| Email OTP, пароль и сессии | `packages/server/src/services/auth-service.ts`, `packages/server/src/repositories/auth-repository.ts`, `packages/server/src/auth/session-token.ts`, `packages/server/src/auth/login-verification.ts` |
| Оплаты и возвраты | `packages/server/src/http/payment-routes.ts`, `packages/server/src/services/payment-service.ts`, `packages/server/src/repositories/payment-repository.ts`, `packages/server/src/domain/payments.ts` |
| Общий HTTP-клиент UI | `packages/client/src/lib/api-client.ts` |
| Валидация публичной записи | `packages/shared/src/schemas/public-booking.ts` |
| Роли и права | `packages/server/src/domain/permissions.ts`, `PERMISSIONS_MATRIX.md` |

## Путь создания публичной записи

1. **Экран клиента:** `packages/client/src/features/public-booking/PublicBooking.tsx` собирает услугу, мастера, время и контакты. Он отправляет `POST /api/public/b/:slug/appointments` с idempotency key.
2. **Route:** `packages/server/src/http/public-booking-routes.ts` обрабатывает `PUB-06`, связывает slug с `PublicContext` и передаёт body через `PublicAppointmentSchema` из `packages/shared/src/schemas/public-booking.ts`.
3. **Общий route pipeline:** `packages/server/src/http/define-express-route.ts` делегирует в `define-route.ts`. Порядок проверок: rate limit → Origin/CSRF → route params → auth/context → permission/RBAC → query/body Zod → handler. Публичный маршрут получает контекст по slug; сессионная cookie ему не нужна.
4. **Public service:** `packages/server/src/services/public-booking-service.ts` проверяет публичную запись, услугу, мастера и согласие. Затем вызывает общий `AppointmentService.create`, чтобы публичный и внутренний путь использовали одну серверную проверку слота.
5. **Booking service и транзакция:** `packages/server/src/services/appointment-service.ts` повторно читает ссылки и рабочее расписание, проверяет пересечения, увеличивает `bookingVersion`, подготавливает customer/appointment и вызывает `withTransaction` из `packages/server/src/db/transactions.ts`.
6. **Repository:** `packages/server/src/repositories/appointment-repository.ts` читает и записывает по `ctx.businessId`; связанные customer/service/staff также проверяются внутри того же tenant. `packages/server/src/repositories/customer-repository.ts` обслуживает поиск/создание клиента.
7. **Booking engine и модель:** `packages/server/src/domain/booking-engine/occupancy.ts` строит `occupiedKeys`; `packages/server/src/db/models/appointments.ts` описывает Appointment и уникальные индексы. MongoDB фиксирует изменения транзакционно; конфликт уникальности переводится в ответ о недоступном слоте.
8. **Ответ UI:** `PublicBookingService` формирует публичный DTO и ссылку управления; `api-client.ts` передаёт результат экрану подтверждения.

Ключевой принцип: список времени в интерфейсе помогает выбрать слот, но окончательную доступность решает сервер во время записи.
