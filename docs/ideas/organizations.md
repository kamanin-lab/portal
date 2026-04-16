# Feature Idea: Organizations (Multi-User Clients)

> Status: IMPLEMENTED (Phases 9-14, 2026-04-14 to 2026-04-16) | Priority: High | Target: Phase 5

## Проблема

Сейчас каждый пользователь — отдельная сущность. Кредиты, пакеты, задачи привязаны к `profile_id`. Если у клиента 2-3 сотрудника, каждому нужен свой пакет и свои кредиты — это неправильно. Компания = одна организация с общим бюджетом.

## Концепция

```
Organization (e.g. MBM GmbH)
├── Credit package (shared)
├── Billing contact (= admin)
├── Nextcloud root (shared: /clients/mbm/)
├── ClickUp list_ids (shared)
├── Support chat (one per org)
├── Users:
│   ├── admin@mbm.de — role: admin (manage package, invite users, billing)
│   ├── hans@mbm.de — role: member (create tasks, approve credits)
│   └── viewer@mbm.de — role: viewer (view only, comment)
└── Tasks (shared across all org members, cached per-user)
```

## Иерархия (текущая vs будущая)

**Сейчас строим:**
```
Portal (KAMANIN — единственный оператор)
└── Organization (клиент: MBM GmbH, Summerfield, ...)
    └── Users (сотрудники клиента: admin, member, viewer)
```

**Будущее (SaaS-продукт, НЕ строим сейчас, но не блокируем):**
```
Portal (продукт)
└── Agency/Freelancer (KAMANIN, другие агентства)
    └── Organization (клиенты агентства)
        └── Users (сотрудники клиента)
```

Архитектура должна позволить добавить Agency-слой позже без переписывания org/members.

## Решения (утверждены 2026-03-27)

| Вопрос | Решение | Обоснование |
|---|---|---|
| Support chat | Один на организацию | Общий контекст для всей команды |
| Notification preferences | Per-user | Каждый сотрудник настраивает свои уведомления |
| task_cache | Per-user | В будущем — привязка задач к конкретным юзерам внутри org |
| Billing contact | Admin автоматически | Упрощение — нет отдельной роли billing |
| Multi-org для клиентов | Нет — один юзер = одна org | Сотрудник клиента работает в одной компании |
| Admin UI для org | Отдельная страница `/organisation` (admin only) | "Ihre Organisation" — team, invite, roles, org info |
| SaaS multi-tenant | Не строим, но не блокируем | Архитектура позволит добавить agency-слой позже |

## Схема данных

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                    -- "MBM GmbH"
  slug text NOT NULL UNIQUE,             -- "mbm"
  clickup_list_ids jsonb DEFAULT '[]',
  nextcloud_client_root text,            -- "/clients/mbm/"
  support_task_id text,                  -- один support task на org
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);

-- RLS helper
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id FROM org_members WHERE profile_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

## Что меняется (по таблицам)

### Переходят на organization_id

| Таблица | Текущий FK | Новый FK | Стратегия |
|---|---|---|---|
| `credit_packages` | `profile_id` | `organization_id` | Добавить org_id, мигрировать, убрать profile_id |
| `credit_transactions` | `profile_id` | `organization_id` | Добавить org_id, оставить profile_id для audit trail |
| `client_workspaces` | `profile_id` | `organization_id` | Shared across all org members |
| `profiles` | — | + `organization_id` (nullable) | Для быстрого lookup текущей org |

### Переходят с profiles на organizations

| Поле | Откуда | Куда |
|---|---|---|
| `clickup_list_ids` | `profiles` | `organizations` |
| `nextcloud_client_root` | `profiles` | `organizations` |
| `support_task_id` | `profiles` | `organizations` |
| `clickup_chat_channel_id` | `profiles` | `organizations` |

> **Заметка (2026-03-30):** `clickup_chat_channel_id` — ID канала ClickUp Chat v3, куда летит уведомление при создании новой задачи клиентом. Сейчас хранится в `profiles`. При переходе на organizations — должен перейти на org-уровень (один канал на всю org). Помимо channel ID, функция `create-clickup-task` требует env var `CLICKUP_WORKSPACE_ID` (Space ID в терминах ClickUp) — это глобальный параметр сейчас, но в SaaS-структуре станет per-agency/per-org полем в `organizations` таблице.

### Остаются per-user (без изменений)

| Таблица | Причина |
|---|---|
| `task_cache` | Персональный кэш, будущее: per-user видимость |
| `comment_cache` | Read state персональный |
| `notifications` | Bell state персональный |
| `read_receipts` | Read tracking персональный |
| `notification_preferences` | Per-user настройки |

## Фазы внедрения

### Фаза 1: Foundation — DB + Migration (zero downtime)

- Создать `organizations` + `org_members` таблицы
- Мигрировать данные: каждый profile → org из одного admin
- Добавить nullable `organization_id` на затронутые таблицы
- Создать `user_org_ids()` helper
- **Не ломает фронт** — старые columns ещё работают

### Фаза 2: Backend — Edge Functions + RLS

- Новые RLS policies через `user_org_ids()`
- `fetch-clickup-tasks`: читать list_ids из org
- `clickup-webhook` / `findProfilesForTask()`: resolve через org_members
- `credit-topup`: group by organization_id
- `nextcloud-files`: root из org
- `handle_org_list_change()` trigger (замена profile-level trigger)

### Фаза 3: Frontend — UI для организаций

- Auth context: `organization` + `orgRole` (без org switcher — один юзер = одна org)
- `useWorkspaces`: query через organization_id
- `useCredits`: shared org balance
- Role-based visibility (admin/member/viewer)
- **Новая страница `/organisation`** — только для admin-роли, "Ihre Organisation":
  - `OrgInfoSection` — название org, slug, кредитный пакет (read-only инфо)
  - `TeamSection` — таблица members (имя, email, роль, дата добавления)
  - `InviteMemberDialog` — пригласить нового member (email → magic link)
  - Управление ролями — переключить member ↔ viewer (admin не может снять свой admin)
  - Удалить member из org
- Ссылка на `/organisation` в sidebar (Utilities zone) — видна только admin
- Для member/viewer — страница недоступна (redirect на /tickets)

### Фаза 4: Onboarding update

- Переписать `onboard-client.ts`: создаёт org + admin user + optional members
- Member invite flow работает и через script, и через UI (admin на /konto)

## Матрица ролей

| Действие | admin | member | viewer |
|---|---|---|---|
| Просмотр задач | ✅ | ✅ | ✅ |
| Создание задач | ✅ | ✅ | ❌ |
| Одобрение credits | ✅ | ✅ | ❌ |
| Комментирование | ✅ | ✅ | ✅ |
| Управление пакетом credits | ✅ | ❌ | ❌ |
| Приглашение members | ✅ | ❌ | ❌ |
| Просмотр/загрузка файлов | ✅ | ✅ | ✅ |
| Управление проектом | ✅ | ✅ | ❌ |

## Edge Functions — изменения

| Function | Что менять |
|---|---|
| `fetch-clickup-tasks` | `clickup_list_ids` из `organizations` через `org_members` |
| `clickup-webhook` | `findProfilesForTask()` → resolve через `org_members`, уведомить всех members |
| `credit-topup` | GROUP BY `organization_id` |
| `nextcloud-files` | `nextcloud_client_root` из `organizations` |
| `send-reminders` | Group по organization, один digest на member |
| `create-clickup-task` | list_id из org |

## Учёт будущих модулей

- `client_workspaces.module_key` на org-level → новый модуль = новый module_key для всей org
- Роли (admin/member/viewer) применяются универсально
- Для per-module permissions (Phase 5+): расширить role до JSONB `{ tickets: 'member', projects: 'admin' }`

## Зависимости

- Credit System (done — needs migration to org-level)
- Nextcloud folder structure (уже на org-level: `/clients/{slug}/`)
- Support chat (needs org-level routing)

## Риски

| Риск | Митигация |
|---|---|
| Downtime при migration | Фаза 1 additive only, nullable columns |
| RLS transition | Двойные policies (old + new), удалить старые после проверки |
| Notification spam (N users × N events) | Dedup per-org per-event |
| Future SaaS layer | Архитектура не блокирует: agency_id на organizations добавится без переписывания |
| Viewer role enforcement | Frontend guards + RLS (defense in depth) |
