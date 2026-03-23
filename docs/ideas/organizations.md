# Feature Idea: Organizations (Multi-User Clients)

> Status: Idea | Priority: High | Target: Phase 5

## Проблема

Сейчас каждый пользователь — отдельная сущность. Кредиты, пакеты, задачи привязаны к `profile_id`. Если у клиента 2-3 сотрудника, каждому нужен свой пакет и свои кредиты — это неправильно. Компания = одна организация с общим бюджетом.

## Концепция

```
Organization (e.g. MBM GmbH)
├── Credit package (shared)
├── Billing contact
├── Nextcloud root (shared: /clients/mbm/)
├── ClickUp list_ids (shared)
├── Users:
│   ├── admin@mbm.de — role: admin (manage package, invite users)
│   ├── hans@mbm.de — role: member (create tasks, approve credits)
│   └── viewer@mbm.de — role: viewer (view only, comment)
└── Tasks (shared across all org members)
```

## Что меняется

| Текущая модель | Новая модель |
|---|---|
| `profiles.clickup_list_ids` | `organizations.clickup_list_ids` |
| `credit_packages.profile_id` | `credit_packages.organization_id` |
| `credit_transactions.profile_id` | `credit_transactions.organization_id` |
| `profiles.nextcloud_client_root` | `organizations.nextcloud_client_root` |
| RLS: `profile_id = auth.uid()` | RLS: via `org_members` join |

## Схема данных

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  clickup_list_ids jsonb DEFAULT '[]',
  nextcloud_client_root text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE org_members (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  profile_id uuid REFERENCES profiles(id),
  role text NOT NULL DEFAULT 'member', -- admin, member, viewer
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);
```

## Зависимости
- Credit System (Phase 1 done — needs migration to org-level)
- Admin Dashboard (для управления организациями)
- Nextcloud folder structure (уже на org-level: /clients/{slug}/)
