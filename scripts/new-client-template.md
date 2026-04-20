# New Client Template — инструкция

Шаблон: [`new-client-template.json`](./new-client-template.json)

Скопируй его в `scripts/<client-slug>.json`, заполни все `FILL_ME` поля и скажи Claude: **"создай клиента по файлу `scripts/<client-slug>.json`"**.

Claude автоматически:
1. Создаст организацию в `organizations`
2. Создаст auth user'а для админа + дополнительных участников
3. Пропишет профили (`profiles`) с `company_name` = name организации
4. Добавит всех в `org_members` с нужными ролями
5. Активирует модули (`client_workspaces`)
6. Создаст credit package + первичное начисление
7. Создаст проекты (`project_config` + `chapter_config`) с правильными ClickUp IDs
8. Добавит quick links (`project_quick_actions`)
9. Выдаст `project_access` указанным участникам
10. Добавит все ClickUp list IDs к `organizations.clickup_list_ids`
11. Пришлёт пароли в чат (не клиенту)

---

## Поля

### `organization` — данные организации

| Поле | Описание | Пример |
|------|----------|--------|
| `name` | Полное юридическое название (пойдёт в `profiles.company_name` и `project_config.client_name`) | `"MBM Münchener Boulevard Möbel GmbH"` |
| `slug` | `null` = автогенерация из домена email. Можно задать вручную | `"mbm-moebel"` |
| `supportTaskId` | ClickUp task ID для support chat. Создай в ClickUp: Space Support → List Clients → новая задача с именем клиента. Скопируй ID из URL (без префикса `t/`) | `"86c81kdgk"` |
| `clickupChatChannelId` | Опционально. ClickUp Chat v3 channel ID для уведомлений о новых задачах. Формат `5-{teamId}-{num}`. `null` = выключено | `"5-901512910505-8"` |
| `nextcloudClientRoot` | Корневая папка клиента в Nextcloud. **Всегда начинается с `/01_OPUS/clients/`** | `"/01_OPUS/clients/mbm/_portal"` |

### `admin` — главный пользователь (role: admin)

| Поле | Описание |
|------|----------|
| `email` | Рабочий email админа клиента |
| `fullName` | Полное имя (например `"Nadin Bonin"`) — не оставлять как в email |
| `password` | `null` = сгенерируется и показан в чате. Если задать строкой — будет использован |
| `sendWelcomeEmail` | `false` = не слать письмо, просто создать. `true` = послать magic-link |

### `additionalMembers` — остальные пользователи организации

Массив. Можно оставить пустым `[]`. Для каждого указать:
- `email`, `fullName`, `role` (`member` / `viewer` / `admin`)
- `password` — `null` для автогенерации
- `sendWelcomeEmail` — как у admin

Роли:
- **admin** — полный доступ, видит всё в org, админит участников
- **member** — обычный сотрудник клиента, видит тикеты/проекты, создаёт задачи
- **viewer** — только чтение, не получает action-emails типа `task_review`

### `modules` — какие вкладки в sidebar

Возможные значения: `"tickets"`, `"support"`, `"files"`, `"projects"`

По умолчанию — все 4. Убери ненужные. Например, если клиент без собственных файлов → убери `"files"`.

### `creditPackage` — часы в месяц

| Поле | Описание |
|------|----------|
| `name` | Название тарифа (для UI, любой текст) — `"Small"`, `"Standard 10h"`, `"Premium"` |
| `creditsPerMonth` | Кредиты, добавляемые каждый месяц через `credit-topup` cron |
| `initialTopup` | Первое начисление при создании. Обычно = `creditsPerMonth` |

Можешь поставить `null` если credits не нужны.

### `tickets` — модуль Aufgaben

`clickupListId` — ID листа в ClickUp для тикетов клиента. Создай: Space → Folder (имя клиента) → List `Tickets`. ID из URL `/v/li/XXX`.

### `projects` — массив проектов (может быть пустым `[]`)

Каждый проект:

| Поле | Описание | Пример |
|------|----------|--------|
| `name` | Название для портала | `"MBM Blog"` |
| `type` | Тип проекта | `"Website"`, `"Blog"`, `"SEO"`, `"App"` |
| `clickupListId` | ClickUp list с задачами проекта | `"901522832965"` |
| `nextcloudRootPath` | **ВАЖНО:** всегда начинается с `/01_OPUS/clients/{slug}/_portal/Projekte/{ProjectFolderName}`. Должен существовать в Nextcloud — создай папку заранее | `"/01_OPUS/clients/mbm/_portal/Projekte/Blog"` |
| `startDate` | Дата начала — немецкий формат | `"1. April 2026"` |
| `targetDate` | Дата завершения | `"30. Juni 2026"` |
| `phases` | `"standard"` = автоматом 4 фазы Konzept/Design/Entwicklung/Launch с правильными ClickUp option IDs. `"custom"` = использовать `customChapters` ниже | `"standard"` |
| `customChapters` | Используется если `phases: "custom"`. Массив объектов: `{title, sortOrder, clickupOptionId, narrative, nextNarrative}`. Если стандартные фазы — оставить `null` | `null` |
| `quickLinks` | Массив объектов `{label, url, icon}` для project_quick_actions. Можно `[]` | `[{label: "Link zum Konzept", url: "https://...", icon: "file-text"}]` |
| `grantAccessTo` | Кому выдать доступ. Значения: `"admin"`, `"all-members"`, или массив email'ов типа `["nadin@mbm.de"]` | `["admin", "all-members"]` |

---

## Пример заполненного файла

Смотри `scripts/mbm-production.json` (старый формат) или попроси Claude показать пример заполнения.

## Где брать ID'ы в ClickUp

- **List ID:** URL листа `https://app.clickup.com/{team}/v/li/{listId}` → `listId`
- **Task ID (для supportTaskId):** URL задачи `https://app.clickup.com/t/{taskId}` или кнопка "Copy ID" в меню задачи
- **Chat Channel ID:** в Chat-интерфейсе ClickUp → меню канала → "Channel Info" → копировать ID (формат `5-{team}-{num}`)
- **Phase custom field option IDs:** для стандартных 4 фаз — **не нужны** (Claude знает). Для custom — получить из `GET /list/{listId}/field` → найти поле "Phase" → массив `options[].id`

## Фиксированные агентские константы (не спрашивать)

- `clickup_phase_field_id` = `64344b61-21e2-451c-ba72-33955954d6d9` (одно на все проекты агентства)
- Стандартные фазы Konzept/Design/Entwicklung/Launch → option IDs известны Claude

См. skill [`portal-ops`](../.claude/skills/portal-ops/SKILL.md) для деталей по ClickUp IDs.
