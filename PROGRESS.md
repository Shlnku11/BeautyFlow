# Progress

| Этап | Статус | Дата |
|---|---|---|
| 0 — Спайк `occupiedKeys` | Частично: уникальный multikey race на MongoDB прошёл 20 × 20; расширенный отчёт и остальные пункты §0.occupiedKeys ещё не выполнены | 2026-10-04 |
| 1 — Фундамент Vite + Express | Каркас перенесён, typecheck/lint/unit/integration/build и health проходят; повторная финальная проверка после перепланировки ожидается | 2026-10-04 |
| 2 — Модели, Zod, интерфейсы, UI-компоненты | Частично: модели, миграция, Zod и UI-kit перенесены; репозитории, сервисы и A/B фикстуры не завершены | 2026-10-04 |
| 3 — Auth, AppShell, login/register | Частично: AUTH-01…04, регистрация/вход и базовый AppShell работают; AUTH-06…09 и role tests отсутствуют | 2026-10-04 |
| 4 — Staff + Services + Schedule | Частично: добавлены STF-02 email-приглашение/AUTH-06, STF-04 деактивация, STF-11/12, BLK-01…03 и MEM-01/03/04 с транзакционными интеграционными тестами; экранные UI и полная route×role/A/B матрица ещё не завершены | 2026-10-05 |
| 5 — Customers + Settings | Частично: CUS-01 теперь возвращает activity/pagination и сохраняет master A/B-scope; добавлены CUS-03 summary и CUS-06 history с transaction totals/master DTO; UI и полная route×role матрица ещё не завершены | 2026-10-05 |
| 6 — Booking | 6a/6b: AVL-01 и APT-01…06 реализованы, включая транзакционные переносы, role transition rules и постановку подтверждений/напоминаний/отмены/follow-up в MongoDB notifications; test:race прошёл 20×20. 6c (PUB-01…10 и UI записи/управления) ещё не начат | 2026-10-05 |
| 7 — Calendar | Не начат | 2026-10-04 |
| 8 — Notifications + email | Не начат | 2026-10-04 |
| 9 — Payments | Не начат | 2026-10-04 |
| 10 — Dashboard | Не начат | 2026-10-04 |
| 11 — Финальный UI/a11y | Частично: UI kit и компонентный axe smoke-тест; конечные экраны не реализованы | 2026-10-04 |
| 12 — E2E, безопасность, деплой | Частично: Playwright smoke/auth, health, race DB-index проходят; полного набора security/E2E нет | 2026-10-04 |
