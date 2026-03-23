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

## Зависимости
- Роли пользователей (operator vs client) — пока только email-based check
- Все таблицы уже существуют — admin dashboard это UI поверх них
