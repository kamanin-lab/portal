# Feature Idea: Admin Dashboard (Operator Panel)

> Status: Idea | Priority: High | Target: Phase 5

## Проблема

С каждой новой функцией растёт количество клиентских настроек, которые сейчас управляются вручную через Supabase таблицы. Это уже неудобно и подвержено ошибкам.

## Что сейчас менеджерится через Supabase вручную

| Настройка | Таблица | Что нужно |
|-----------|---------|-----------|
| Клиентские профили | `profiles` | email, name, company, nextcloud_client_root |
| Проекты | `project_config` | name, clickup_list_id, nextcloud_root_path, phase_field_id |
| Фазы проектов | `chapter_config` | title, sort_order, narrative, clickup_cf_option_id |
| Кредитные пакеты | `credit_packages` | package_name, credits_per_month, is_active |
| Quick Actions | `project_quick_actions` | label, url, icon, sort_order, is_enabled |
| Workspace доступ | `client_workspaces` | module_key, display_name |
| Project доступ | `project_access` | profile_id ↔ project_config_id |
| Уведомления | `profiles.email_notifications` | toggle |
| General message task | `project_config.general_message_task_id` | ClickUp task ID |
| ClickUp Chat канал | `profiles.clickup_chat_channel_id` | ID канала Chat v3 для уведомлений о новых задачах |
| ClickUp Workspace | env var `CLICKUP_WORKSPACE_ID` | Space/Workspace ID — требуется для Chat v3 API (сейчас только в Coolify env) |

> **Заметка (2026-03-30):** `CLICKUP_WORKSPACE_ID` сейчас задаётся как глобальная env var в Coolify и нигде не хранится в БД. При масштабировании до нескольких агентств/клиентов с разными ClickUp workspaces — это поле должно стать конфигурируемым в Admin Dashboard. Аналогично `clickup_chat_channel_id` — сейчас per-profile, в будущем per-organization. Оба поля должны быть редактируемы через Admin Dashboard в разделе "Клиенты" / "Организации".

## Концепция

Внутренний (не клиентский) admin dashboard для операторов (Yuri + команда):

### Клиенты
- Список клиентов с поиском
- Карточка клиента: профиль, пакет кредитов, баланс, проекты
- Создание/редактирование клиента
- Назначение Nextcloud root path
- Настройка уведомлений

### Проекты
- Создание проекта для клиента
- Настройка фаз (chapters)
- Quick actions конфигурация
- Привязка к ClickUp list

### Кредиты
- Текущий баланс каждого клиента
- История транзакций
- Ручное пополнение / списание / корректировка
- Смена пакета (Small → Medium → Large)

### Мониторинг
- Активные задачи по клиентам
- Webhook health status
- Nextcloud connectivity check
- Last sync timestamps

## Технические варианты

1. **Отдельный route в портале** (`/admin`) — защищён ролью `operator`
2. **Отдельное приложение** — standalone React app
3. **Supabase Studio** — продолжать пользоваться (не масштабируется)

### Project Memory / Context
- ProjectContextSection (client-visible read-only) — components exist (`ProjectContextSection.tsx`, `ProjectContextPreview.tsx`)
- ProjectContextAdminPanel (operator edit UI) — exists at 156 lines, needs refactor to < 150 (extract MemoryEntryForm)
- Integration into OverviewPage — deferred from Phase 5 (2026-03-29 decision)
- DATA-01 and DATA-05 requirements deferred to this scope

## Зависимости
- Роли пользователей (operator vs client) — пока только email-based check
- Все таблицы уже существуют — admin dashboard это UI поверх них
