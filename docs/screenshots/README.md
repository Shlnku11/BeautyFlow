# Скриншоты интерфейса

Ниже перечислены актуальные финальные кадры для демонстрации продукта. Основные экраны сняты Playwright в Chromium в viewport 1440×1000, в светлой и тёмной темах. Исторические промежуточные файлы ещё лежат в каталоге и не включены в этот индекс.

| Экран | Светлая тема | Тёмная тема |
|---|---|---|
| Лендинг | `landing-light.png` | `landing-dark.png` |
| Вход | `login-light.png` | `login-dark.png` |
| Обзор | `dashboard-light.png` | `dashboard-dark.png` |
| Календарь | `calendar-light.png` | `calendar-dark.png` |
| Публичная запись | `public-booking-light.png` | `public-booking-dark.png` |
| Оплаты | `payments-light.png` | `payments-dark.png` |
| Команда | `staff-light.png` | `staff-dark.png` |
| Клиенты | `customers-light.png` | `customers-dark.png` |

В `modals/` лежат светлые и тёмные кадры создания/переноса записи, командного поиска и центра уведомлений. В `bugfix/` сохранены кадры проверки исправления календарной записи, а в `mobile-defense/` — четыре узких экранных сценария для показа адаптива.

Изображения соответствуют реально отрисованному интерфейсу; чувствительные cookies и storage state в этот каталог не включаются. Чтобы переснять кадры, запускайте соответствующий Playwright E2E после восстановления тестовой MongoDB.
