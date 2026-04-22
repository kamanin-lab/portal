# Feature Idea: Rotation of Leaked Service Role JWT + Repo Visibility Review

> Status: Idea | Priority: High | Target: Ad-hoc (security debt)

## Проблема

2026-04-21 GitGuardian пометил несколько коммитов с утёкшими секретами:

| Коммит | Файл | Что утекло | Давность |
|--------|------|------------|----------|
| `21b9330` | `seed_dev.js` | **service_role JWT** для self-hosted Supabase `portal.db.kamanin.at` (exp=2126) | ~40 дней |
| `a0d92c5` | `.planning/debug/verify-migration.mjs` | Supabase Management API token `sbp_fb903bfc...` (staging) | ~дни |
| `da9b722` | `scripts/kmcg.json` | Пароли клиентов KMCG (Norbert, Elena) | ~сутки |

**Ключевое:** репо `kamanin-lab/portal` **публичный**. Все коммиты с момента push уже прочитаны security-ботами (GitGuardian, trufflehog scanners, dark-web aggregators). Секреты нужно считать утёкшими всему интернету.

Частичный fix (commit `86e941e`, 2026-04-21):
- Файлы удалены из git tracking
- `.gitignore` обновлён whitelist-подходом для `scripts/`
- **Ключи НЕ ротированы** — отложено на будущее

## Риск

Самый опасный — **service_role JWT для prod Supabase** (`portal.db.kamanin.at`):
- Полный обход RLS
- Read/write ко всем таблицам (`profiles`, `task_cache`, `credit_transactions`, `organizations`, всё)
- Данные всех клиентов: MBM, KMCG, Hämmerle, Summerfield, Helferportal
- exp=2126 — ключ живёт 100 лет

Если кто-то с злым умыслом (не бот, а человек) наткнётся на коммит `21b9330` — одним `curl` сольёт всю БД.

Пароли KMCG (Norbert, Elena) — менее критично: клиенты могут сменить пароль сами.

Supabase Management token — staging, ограниченный blast radius.

## Варианты решения

### Option A — Полная ротация service_role JWT (максимальная защита)

Единственный способ «убить» утёкший HS256 ключ — сменить `JWT_SECRET` в Coolify. Это инвалидирует все активные пользовательские сессии.

**Шаги:**
1. Coolify → Supabase stack env:
   - `JWT_SECRET` → новый 40+ char random
   - `ANON_KEY` → новый JWT подписанный новым секретом
   - `SERVICE_ROLE_KEY` → новый JWT подписанный новым секретом
2. `docker compose up --force-recreate` (НЕ `docker restart` — см. memory `project_coolify_env_rotation.md`)
3. Все 15+ Edge Functions — обновить `SUPABASE_SERVICE_ROLE_KEY` в Coolify EF secrets
4. Frontend `.env` на Vercel — обновить `VITE_SUPABASE_ANON_KEY`, redeploy
5. Локальный `.env.local` Юрия — обновить оба ключа
6. Проинформировать всех клиентов о необходимости повторного логина

**Downtime:** ~5-15 минут (пока перезапускаются контейнеры)
**Impact:** все клиенты (MBM, KMCG, Hämmerle, Summerfield, Helferportal) разлогинены, должны залогиниться заново паролем.

### Option B — Перевести репо в private + rewrite истории

- `gh repo edit kamanin-lab/portal --visibility private`
- `git filter-repo --path seed_dev.js --path scripts/kmcg.json --path .planning/debug/verify-migration.mjs --invert-paths`
- Force push на `main` и `staging`

**Что это даёт:**
- GitGuardian перестанет постоянно жаловаться
- Новые боты репо не увидят
- НЕ отзывает утёкшие ключи — они уже в руках у тех, кто успел скачать за 40 дней

**Минус:**
- Потеряется публичное портфолио кода
- SHA-ссылки на коммиты в CHANGELOG могут сломаться (т.к. SHA меняются после rewrite)
- Всем, у кого есть локальный clone, надо переклонировать

### Option C — Комбинация A + B (рекомендуется)

Сделать репо приватным (Option B без rewrite истории) + ротировать service_role JWT (Option A). Rewrite не обязателен — GitHub через пару недель сам прочистит кэш по SHA, а GitGuardian остановит сканирование приватного репо.

**Защита:** максимальная
**Стоимость:** downtime портала + переход на private

## Решение Юрия (на 2026-04-21)

Пока отложено. Причины:
- Ротация JWT требует координации downtime с клиентами
- Публичный репо — часть портфолио; перевод в private надо обдумать

**Триггер для возврата:** либо:
1. Появятся подозрения активной атаки (аномальный трафик к Supabase, странные записи в БД)
2. Плановое окно обслуживания, в которое можно уложить downtime портала
3. Утечка более свежего/опасного секрета

## Открытые вопросы

1. Делать ли репо приватным (теряем портфолио-ценность)?
2. Если оставлять публичным — нужна ли ротация? (защищает от human attacker, не от ботов, которые уже скачали)
3. Есть ли monitoring на аномальную активность в Supabase (попытки использования service_role JWT извне Coolify сети)?

## Notes

- Memory: `feedback_gitignore_whitelist.md` документирует whitelist-подход для `scripts/`
- Memory: `project_coolify_env_rotation.md` документирует процесс обновления env в Coolify
- Изначальный fix commit: `86e941e` (2026-04-21) — `chore(security): untrack leaked config files and whitelist scripts/`
