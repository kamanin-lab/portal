---
status: investigating
trigger: "Пользователь с profile_id c9200188-e6ab-4c65-a804-b5bc29575f70 не может создавать задачи. Получает ошибку Edge Function. Никогда не работало."
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
---

## Current Focus

hypothesis: Profile c9200188 has empty clickup_list_ids array in profiles table — Edge Function returns 400 "No list configured" when listIds.length === 0
test: Query profiles table for clickup_list_ids field of this user; compare with working users
expecting: clickup_list_ids is NULL or empty array [] for c9200188 while working profiles have a non-empty array
next_action: Execute DB query to confirm clickup_list_ids value for profile c9200188

## Symptoms

expected: Пользователь создаёт задачу через портал → задача появляется в ClickUp и в portal task_cache
actual: Ошибка при создании задачи (Edge Function возвращает 2xx с ошибкой, или задача не создаётся)
errors: "Error 2xx" — необычный ответ, возможно 202 или нестандартный код
reproduction: Любая попытка создать задачу через NewTicketDialog для этого профиля
started: Никогда не работало — проблема изначальная, не регрессия

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-03T00:00:00Z
  checked: supabase/functions/create-clickup-task/index.ts lines 279-308
  found: |
    Edge Function reads profile.clickup_list_ids (array). If empty/null, returns HTTP 400:
    { error: "No list configured. Please contact your administrator." }
    This is NOT a 2xx — so the "Error 2xx" symptom likely refers to a different code path
    or the frontend treats it as such.
  implication: Root cause is almost certainly missing clickup_list_ids on this profile

## Resolution

root_cause:
fix:
verification:
files_changed: []
