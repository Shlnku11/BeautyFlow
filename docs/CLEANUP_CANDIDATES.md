# Кандидаты на безопасную очистку

Инвентаризация на 2026-10-09. **Ничего из перечисленного не удалялось.** Удаление выполнять отдельным решением после просмотра списка.

## Временные артефакты

- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\test-results\` — Playwright-результаты; сейчас внутри только `.last-run.json`. Папка пересоздаётся при следующем прогоне.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\outputs\` — папки сейчас нет, поэтому `outputs/*.mjs` и `outputs/*.log` отсутствуют.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\tmp\` и `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\work\` — отсутствуют.
- Файлы `*.log`, `*.tmp`, `*.bak` вне `node_modules/` и `.git/` не найдены; `dist/` тоже отсутствует.

## Устаревшие скриншоты

- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\audit-before\` — 42 старых baseline-кадра до аудита; прямых ссылок на каталог в документации не найдено.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\before\` — 34 кадра до редизайна; прямых ссылок на каталог в документации не найдено.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\historical-dashboard-clay-dark.png` и `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\historical-dashboard-clay-light.png` — старый Clay-вариант dashboard, не используется финальным walkthrough.

## Точные дубликаты изображений

SHA-256 совпадает полностью. Оставить каноническую копию, удалить можно только дублирующий путь:

- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-appointment-detail-reschedule-dark.png` — копия `docs/screenshots/modals/appointment-reschedule-dark.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-appointment-create-modal-dark.png` — копия `docs/screenshots/modals/appointment-create-dark.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-appointment-detail-reschedule-light.png` — копия `docs/screenshots/modals/appointment-reschedule-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-notifications-modal-light.png` — копия `docs/screenshots/modals/notifications-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-command-search-modal-dark.png` — копия `docs/screenshots/modals/command-search-dark.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-appointment-create-modal-light.png` — копия `docs/screenshots/modals/appointment-create-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-command-search-modal-light.png` — копия `docs/screenshots/modals/command-search-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\owner-notifications-modal-dark.png` — копия `docs/screenshots/modals/notifications-dark.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\defense\mobile-public-booking.png` — копия `docs/screenshots/mobile-defense/public-booking.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\defense\mobile-master-my-day.png` — копия `docs/screenshots/mobile-defense/master-my-day.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\defense\mobile-owner-dashboard.png` — копия `docs/screenshots/mobile-defense/owner-dashboard.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\defense\mobile-owner-calendar-month.png` — копия `docs/screenshots/mobile-defense/owner-calendar-month.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\public-reset-password.png` — копия theme-specific `public-reset-password-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\public-verify-email.png` — копия theme-specific `public-verify-email-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\screenshots\redesign\after\public-forgot-password.png` — копия theme-specific `public-forgot-password-light.png`.
- `C:\Users\abdul\Documents\Codex\2026-10-04\NextAppointments\docs\comparison\landing-ours.png` — байтовая копия `landing-before-light.png`; markdown comparison ссылается на latter.

## Сохранить

- `docs/comparison/landing-before-dark.png`, `landing-before-light.png`, `landing-linear-vs-ours.png` и `landing-linear-vs-ours-after.png` используются сравнительным документом или нужны как финальный side-by-side.
- Кадры в `docs/screenshots/redesign/after/`, на которые ссылается `docs/DEFENSE_WALKTHROUGH.md`, сохранить. Дубли выше перечислены отдельно.
- При начале этого блока 36 отслеживаемых screenshot-файлов уже имели статус удаления в Git. Они не менялись в рамках этой инвентаризации и не включены в кандидаты; перед любым следующим коммитом проверить `git status`.
