# Feature Idea: Кредитная система оценки задач (Task Credit System)

> Status: **IMPLEMENTED** (TASK-010, 2026-03-23) | Phase 1 shipped
> Spec: `docs/superpowers/specs/2026-03-23-credit-system-design.md`
> Remaining: Phase 2 (AI estimation), Phase 3 (budgets/limits/reports)

## Проблема

Клиенты отправляют задачи через портал без понимания их трудоёмкости. Агентство не имеет стандартизированного механизма оценки и тарификации задач внутри портала. Сейчас оценка происходит вне системы.

## Концепция

Каждая задача, созданная клиентом, оценивается в **кредитах** — внутренней единице трудоёмкости. Кредиты заменяют абстрактные часы и позволяют:

- Стандартизировать оценку задач
- Дать клиенту прозрачность по стоимости запросов
- В будущем — автоматизировать оценку через AI-агента

## Архитектура

### ClickUp: кастомное поле

Добавить **Custom Field** в ClickUp:

| Параметр | Значение |
|----------|----------|
| Название | `Credits` |
| Тип | Number |
| Область | Space или Folder уровень (чтобы было на всех списках задач) |
| Кто заполняет | Разработчики / Юрий (Phase 1), AI-агент (Phase 2+) |

### Supabase: синхронизация через webhook

Кредиты попадают в портал через существующий механизм:

```
ClickUp Custom Field "Credits"
    │
    ▼ webhook: taskUpdated / customFieldChanged
    │
    ▼ clickup-webhook Edge Function
    │
    ▼ task_cache.raw_data (JSON содержит custom fields)
    │
    ▼ UI: отображение кредитов на карточке задачи
```

**Опционально:** выделить top-level колонку `task_cache.credits INTEGER` для удобства фильтрации и сортировки (по аналогии с `status`, `priority`).

### Portal UI: отображение для клиента

- **TaskCard** — бейдж с количеством кредитов (например: `⚡ 3 Credits`)
- **TaskDetail** — секция "Оценка" с кредитами и пояснением
- **Фильтрация** — возможность сортировки/фильтрации по кредитам
- **Итоги** — суммарные кредиты за период (месяц / проект)

## Фазы реализации

### Phase 1: Ручная оценка

1. Создать Custom Field `Credits` (Number) в ClickUp
2. Обновить `clickup-webhook` для парсинга custom field из payload
3. Добавить `credits` колонку в `task_cache` (или читать из `raw_data.custom_fields`)
4. Отобразить кредиты в UI: TaskCard badge + TaskDetail секция
5. Разработчики / Юрий выставляют оценку вручную в ClickUp

### Phase 2: AI-оценка (автоматическая)

1. AI-агент анализирует текст задачи при создании
2. На основе:
   - Описание задачи (текст + вложения)
   - Тип задачи (баг, фича, контент)
   - Knowledge Base клиента (контекст проекта)
   - Историческая статистика (средние кредиты по типу)
3. Предлагает оценку в кредитах
4. Edge Function `estimate-task-credits` → записывает в ClickUp Custom Field через API
5. Разработчик может скорректировать оценку

### Phase 3: Бюджеты и лимиты

- Месячный бюджет кредитов на клиента (пакетная модель)
- Уведомления при приближении к лимиту (80%, 100%)
- Dashboard для клиента: использовано / осталось / история
- Автоматическое предупреждение при создании задачи, превышающей остаток
- Отчёты по расходу кредитов за период

## Схема данных (расширение)

```sql
-- Колонка в task_cache (Phase 1)
ALTER TABLE task_cache ADD COLUMN credits INTEGER;

-- Таблица бюджетов (Phase 3)
CREATE TABLE credit_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES client_workspaces(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_credits INTEGER NOT NULL,
  used_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE credit_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own budgets" ON credit_budgets FOR SELECT
  USING (profile_id = auth.uid());
```

## Поток данных

```
Клиент создаёт задачу в портале
    │
    ├─► Phase 1: Разработчик оценивает в ClickUp → Credits field
    │
    └─► Phase 2: AI-агент анализирует → предлагает оценку
            │
            ▼ Edge Function: estimate-task-credits
            │
            ▼ ClickUp API: set custom field "Credits"
            │
            ▼ Webhook → task_cache.credits
            │
            ▼ UI: клиент видит оценку на карточке задачи
```

## Интеграция с существующими модулями

| Модуль | Изменения |
|--------|----------|
| `tickets/` | TaskCard — бейдж кредитов, TaskDetail — секция оценки |
| `clickup-webhook` | Парсинг Custom Field `Credits` из payload |
| `task_cache` | Новая колонка `credits` |
| `NewTicketDialog` | (Phase 2) Предварительная AI-оценка при создании |
| Sidebar / Dashboard | (Phase 3) Виджет остатка кредитов |

## Зависимости

- ClickUp Custom Fields API (уже доступен через Edge Functions)
- Knowledge Base (для AI-оценки в Phase 2) — см. `docs/ideas/knowledge-base.md`
- Система рекомендаций (кредиты используются для оценки) — см. `docs/ideas/recommendations.md`
- Webhook infrastructure (уже работает)

## Открытые вопросы

1. **Шкала кредитов:** Фибоначчи (1, 2, 3, 5, 8, 13) ✅
2. **Видимость для клиента:** Показывать кредиты сразу или только после подтверждения?
3. **Споры по оценке:** Может ли клиент оспорить оценку? Workflow для этого?
4. **Пакеты:** Фиксированные пакеты (50/100/200 кредитов/мес) или индивидуальные?
5. **Ретроактивная оценка:** Оценивать уже существующие задачи?
