# Feature Idea: Система рекомендаций (Proactive Recommendations)

> Status: IMPLEMENTED (260330-lvq, 2026-03-30) — Phase 1 complete: recommendations block on Needs Attention tab. Phase 2 (AI generation) + Phase 3 (analytics) remain future work.

## Проблема

Агентство регулярно находит проблемы или возможности для улучшения у клиентов (SEO, производительность, безопасность, UX). Сейчас это сообщается устно или по email — нет системного способа предложить, оценить и получить решение клиента.

## Решения (утверждены 2026-03-27)

| Вопрос          | Решение                                                                                 | Обоснование                                               |
| --------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Статус или тег? | Только тег `recommendation`                                                             | Не нужен новый ClickUp статус, проще настройка            |
| Где показывать? | Отдельная страница `/empfehlungen`                                                      | Уникальный UI (Accept/Decline), не мешает обычным задачам |
| Уведомления     | Email + bell при новой рекомендации                                                     | Клиент должен знать о новых предложениях                  |
| При принятии    | Убрать tag `recommendation`, добавить tag `ticket`, статус → READY, установить due_date | Задача уходит в обычный поток как "Bereit"                |
| При отклонении  | Статус → CANCELED + опциональный комментарий                                            | Чисто, задача уходит из активного списка                  |

## Поток

```
Агентство находит проблему / возможность
    │
    ▼ Создаёт задачу в ClickUp
    │   - Status: TO DO
    │   - Tag: "recommendation"
    │   - Custom Field "Credits": предварительная оценка
    │   - Description: что, почему, что будет если не сделать
    │
    ▼ Webhook → task_cache (tag сохраняется в raw_data)
    │
    ▼ Портал: фильтрация по tag → страница "Empfehlungen"
    │
    ├─► Клиент: "Annehmen" (Принять)
    │     1. Выбирает due_date (датапикер)
    │     2. Edge Function → ClickUp API:
    │        - Убрать tag "recommendation"
    │        - Добавить tag "ticket"
    │        - Статус: TO DO → READY
    │        - Установить due_date
    │     3. task_cache обновляется
    │     4. Задача появляется в обычном списке (статус "Bereit")
    │
    └─► Клиент: "Ablehnen" (Отклонить)
          1. Опциональный комментарий: "Warum nicht?"
          2. Edge Function → ClickUp API:
             - Статус: TO DO → CANCELED
             - Комментарий с причиной (если есть)
          3. Задача уходит из активного списка
```

## ClickUp: настройка

| Элемент                 | Значение                      |
| ----------------------- | ----------------------------- |
| Tag (рекомендация)      | `recommendation`              |
| Tag (после принятия)    | `ticket`                      |
| Статус до решения       | `TO DO` (стандартный)         |
| Статус после принятия   | `READY` (Portal: "Bereit")    |
| Статус после отклонения | `CANCELED`                    |
| Custom Fields           | `Credits` (Number, Fibonacci) |

## Portal UI

### Страница `/empfehlungen`

- Навигация: ссылка в sidebar (Utilities zone или Global nav)
- Badge с количеством активных рекомендаций
- Фильтр: `task.tags.some(t => t.name === 'recommendation')` + `status === 'open'`

### Карточка рекомендации

```
┌─────────────────────────────────────────┐
│ 💡 SSL-Zertifikat läuft am 15.04 ab    │
│                                         │
│ Ihr SSL-Zertifikat muss vor dem         │
│ 15. April erneuert werden, sonst        │
│ zeigen Browser eine Sicherheits-        │
│ warnung an.                             │
│                                         │
│ ⚡ 2 Credits                            │
│                                         │
│ [Annehmen]  [Ablehnen]  [Details →]     │
└─────────────────────────────────────────┘
```

### Действия клиента

**Annehmen (Принять):**

1. Модальное окно с датапикером: "Bis wann soll das erledigt werden?"
2. Edge Function → ClickUp API:
   - Убрать tag `recommendation`, добавить tag `ticket`
   - Статус → READY
   - Установить due_date
3. Задача уходит из Empfehlungen → появляется в обычном списке как "Bereit"

**Ablehnen (Отклонить):**

1. Опциональный комментарий: "Warum nicht?"
2. Edge Function → ClickUp API:
   - Статус → CANCELED
   - Комментарий с причиной
3. Задача уходит из активного списка

## Техническая реализация

### Что уже есть (не нужно строить)

| Компонент             | Статус                 | Файл                                     |
| --------------------- | ---------------------- | ---------------------------------------- |
| Tags в task_cache     | ✅ Хранятся в raw_data | `types/tasks.ts` (tags array)            |
| due_date на карточках | ✅ Отображается        | `TaskCard.tsx` (formatDueDate)           |
| Credits на карточках  | ✅ CreditBadge         | `CreditBadge.tsx`                        |
| Task actions pattern  | ✅ useTaskActions      | `hooks/useTaskActions.ts`                |
| Status update edge fn | ✅ update-task-status  | `supabase/functions/update-task-status/` |
| Webhook notifications | ✅ Паттерн есть        | `clickup-webhook/index.ts`               |
| Email templates       | ✅ emailCopy.ts        | `_shared/emailCopy.ts`                   |

### Что нужно построить

| Компонент             | Описание                                            | Файлы                                       |
| --------------------- | --------------------------------------------------- | ------------------------------------------- |
| Tag management        | Edge function для add/remove tags через ClickUp API | Расширить `update-task-status` или новая fn |
| due_date update       | Добавить поддержку due_date в update-task-status    | `update-task-status/index.ts`               |
| Recommendations page  | `/empfehlungen` — фильтр по tag, карточки, actions  | Новая страница + route                      |
| RecommendationActions | Accept (datepicker) / Decline (comment) компонент   | Новый компонент                             |
| Sidebar nav item      | "Empfehlungen" с badge count                        | `SidebarGlobalNav.tsx`                      |
| Email template        | `recommendation_new` тип в emailCopy                | `emailCopy.ts`                              |
| Webhook handler       | Уведомление при новой рекомендации (tag detection)  | `clickup-webhook/index.ts`                  |
| Status mapping        | Нет новых статусов — используем существующие        | —                                           |

### Edge Function: accept-recommendation

```
POST /update-task-status
{
  taskId: "abc123",
  action: "accept_recommendation",
  dueDate: "2026-04-15T00:00:00Z"  // NEW field
}

→ ClickUp API calls:
  1. PUT /task/{id} { status: "ready", due_date: timestamp }
  2. DELETE /task/{id}/tag/recommendation
  3. POST /task/{id}/tag/ticket
→ Update task_cache
```

### Edge Function: decline-recommendation

```
POST /update-task-status
{
  taskId: "abc123",
  action: "decline_recommendation",
  comment: "Nicht relevant im Moment"  // optional
}

→ ClickUp API calls:
  1. PUT /task/{id} { status: "canceled" }
  2. POST /task/{id}/comment (если есть комментарий)
→ Update task_cache
```

## Фазы реализации

### Phase 1: Базовый поток (текущий план)

1. Расширить `update-task-status` — поддержка due_date + tag management
2. UI: страница `/empfehlungen` с карточками (фильтр по tag)
3. Компонент RecommendationActions (Accept + Decline)
4. Sidebar nav item с badge count
5. Email template для новой рекомендации
6. Webhook: detection tag `recommendation` → notification + email

### Phase 2: AI-генерация рекомендаций (будущее)

1. AI анализирует сайт клиента периодически
2. Находит проблемы (SEO, скорость, безопасность, доступность)
3. Автоматически создаёт задачи в ClickUp с tag `recommendation`
4. AI оценивает кредиты

### Phase 3: Аналитика (будущее)

- Конверсия: принято / отклонено
- Среднее время принятия решения
- Revenue impact: принятые кредиты за период

## Интеграция с кредитной системой

- Каждая рекомендация имеет оценку в кредитах (Custom Field)
- Клиент видит стоимость до принятия решения (CreditBadge)
- При принятии — задача входит в обычный workflow с credit tracking
