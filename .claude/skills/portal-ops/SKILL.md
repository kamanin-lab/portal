---
name: portal-ops
description: >
  Операционные задачи портала: добавить пользователя в организацию,
  создать новый проект, выдать доступ. Использовать когда нужно онбордить
  нового клиента/пользователя или настроить новый проект.
---

# Portal Ops — Пользователи и Проекты

## A. Добавить пользователя в существующую организацию

### Собрать данные (спросить у Юрия)

| Поле | Пример | Примечание |
|------|--------|-----------|
| Email | m.pape@reachlab.com | |
| Полное имя | Marvin Pape | |
| Роль | `member` / `admin` | default: member |
| Организация | MBM | нужен org ID из БД |
| Отправлять welcome email? | нет/да | по умолчанию — спросить |

### Выполнение (через Node.js + Supabase Admin API)

```js
// 1. Найти org ID и company_name главного пользователя
SELECT id, name FROM organizations WHERE name ILIKE '%mbm%'
// company_name для нового профиля = organizations.name

// 2. Создать auth user (email_confirm: true — без письма)
POST /auth/v1/admin/users
{ email, password: <generated>, email_confirm: true }

// 3. Создать/обновить profile
// ⚠️ ВАЖНО: Supabase-триггер создаёт пустой профиль при создании auth user.
// ON CONFLICT нужно обновлять ВСЕ поля, включая company_name — иначе останется null.
INSERT INTO profiles (id, email, full_name, company_name, email_notifications)
VALUES (userId, email, fullName, orgName, true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  company_name = EXCLUDED.company_name,
  email_notifications = EXCLUDED.email_notifications

// 4. Добавить в org_members
INSERT INTO org_members (organization_id, profile_id, role)
VALUES (orgId, userId, 'member')
```

### После создания
- Сообщить пароль Юрию (НЕ слать пользователю, если не попросили)
- Если нужен доступ к проектам — см. раздел C

---

## B. Создать новый проект

### Собрать данные (спросить у Юрия — ВСЕ поля обязательны)

| Поле | Пример | Примечание |
|------|--------|-----------|
| Название | "MBM Blog" | display name в портале |
| Тип | "Blog" / "Website" / "SEO" | тип проекта |
| Организация | MBM | для client_name и client_initials |
| ClickUp List ID | `901522832965` | из URL списка в ClickUp |
| Nextcloud папка | `/01_OPUS/clients/mbm/_portal/Projekte/Blog` | **точный путь** — см. паттерн ниже |
| Дата начала | "1. April 2026" | обязательно спросить |
| Дата завершения | "30. Juni 2026" | обязательно спросить |
| Фазы | стандартные / нестандартные | если нестандартные — спросить ClickUp option IDs |

### Nextcloud path паттерн
```
/01_OPUS/clients/{org-slug}/_portal/Projekte/{ProjectFolderName}
```
⚠️ Всегда начинается с `/01_OPUS/` — без этого путь не работает.
**Всегда уточнять у Юрия точное имя папки** — не угадывать.

### Фиксированные ClickUp IDs (не меняются, не спрашивать)

**clickup_phase_field_id** (одно на всё агентство):
`64344b61-21e2-451c-ba72-33955954d6d9`

**Стандартные фазы** (chapter_config.clickup_cf_option_id):
| Фаза | ID |
|------|-----|
| Konzept | `cf29353e-fdca-4251-a58a-946402647805` |
| Design | `500fd8eb-b696-4230-bb32-93d7777c5539` |
| Entwicklung | `805391ea-c843-4c7e-910b-9d0c0545dde2` |
| Launch | `3099518a-fff0-4fdf-b907-7bdae7a239db` |

Если фазы нестандартные → спросить у Юрия option IDs перед созданием.

### Выполнение

```js
// 1. Создать project_config
INSERT INTO project_config (
  clickup_list_id, clickup_phase_field_id,
  name, type, client_name, client_initials,
  start_date, target_date,
  is_active, nextcloud_root_path
) VALUES (...) RETURNING id

// 2. Создать chapter_config для каждой фазы
INSERT INTO chapter_config (
  project_config_id, title, sort_order,
  clickup_cf_option_id, narrative, next_narrative, is_active
)

// 3. Добавить clickup_list_id к организации
UPDATE organizations
SET clickup_list_ids = clickup_list_ids || '"LIST_ID"'::jsonb
WHERE id = orgId AND NOT (clickup_list_ids @> '"LIST_ID"')

// 4. Активировать модуль 'projects' для орг (если ещё нет)
SELECT * FROM client_workspaces WHERE organization_id = orgId AND module_key = 'projects'
-- если нет:
INSERT INTO client_workspaces (organization_id, module_key, display_name, icon, sort_order, is_active)
VALUES (orgId, 'projects', 'Projekte', 'folder-kanban', <next_order>, true)
```

---

## C. Выдать доступ к проекту пользователям

```js
// Найти project_config_id
SELECT id FROM project_config WHERE name = 'MBM Blog'

// Выдать доступ каждому пользователю
INSERT INTO project_access (profile_id, project_config_id)
VALUES (userId, projectId)
ON CONFLICT DO NOTHING
```

---

## D. Очистить task_cache от проектного листа

Если проектный ClickUp-лист (например `MBM – Blog`) был случайно добавлен в список задач пользователя при онбординге — его задачи попадают в Tickets и Meine Aufgaben. Проектные задачи должны быть **только** в `project_task_cache`, не в `task_cache`.

### Диагностика — что попало

```sql
SELECT list_id, list_name, count(*) as cnt
FROM task_cache
WHERE profile_id = '<profile_id>'
GROUP BY list_id, list_name ORDER BY cnt DESC
```

Если видишь несколько листов — поддержка (`MBM – Tasks`) и проект (`MBM – Blog`) — проектный нужно удалить.

### Удаление для одного или нескольких пользователей

```sql
DELETE FROM task_cache
WHERE list_id = '<project_list_id>'
  AND profile_id IN ('<profile_id_1>', '<profile_id_2>')
RETURNING profile_id, clickup_id, name
```

### Профилактика при онбординге

⚠️ **Никогда не добавлять проектный ClickUp-лист в `organizations.clickup_list_ids`** — он используется для синхронизации `task_cache`. Проектные листы обслуживаются через `project_config.clickup_list_id` и попадают в `project_task_cache` через `fetch-project-tasks`.

Правило:
- `organizations.clickup_list_ids` → **только support-лист** (напр. `MBM – Tasks`)
- `project_config.clickup_list_id` → **проектный лист** (напр. `MBM – Blog`)

---

## Checklist перед завершением

- [ ] company_name профиля совпадает с organizations.name (не null)
- [ ] Пароль нового пользователя передан Юрию (не отправлен клиенту)
- [ ] project_config создан со всеми полями включая start_date / target_date
- [ ] clickup_phase_field_id заполнен
- [ ] chapter_config создан с правильными clickup_cf_option_id
- [ ] clickup_list_id добавлен в organizations.clickup_list_ids
- [ ] Модуль 'projects' активирован в client_workspaces (если нужен)
- [ ] project_access выдан всем нужным пользователям
- [ ] Nextcloud путь начинается с /01_OPUS/ и точно соответствует реальной папке
