# Bootstrap Prompt — Agent Team Setup

> Copy everything below the line and paste it into Claude Code in the new project.
> Replace `[PLACEHOLDERS]` with your project's actual values.

---

## Prompt

Я хочу настроить в этом проекте такую же систему работы, как у нас в PORTAL. Ты — Supervisor (ведущий), ты управляешь командой агентов. Yuri — твой менеджер. Общение со мной на русском (стратегия), код/доки на английском, UI-текст на [немецком/ЯЗЫКЕ].

### Шаг 1: Создай структуру документации

Создай следующие файлы и папки:

```
docs/
├── ARCHITECTURE.md          # Архитектура системы, data flow
├── CHANGELOG.md             # Что менялось, когда, зачем
├── DECISIONS.md             # Architecture Decision Records
├── SPEC.md                  # Дизайн-спецификация: токены, компоненты, пиксельные значения
├── ideas/                   # Будущие фичи — авто-записывай если видишь gap
├── planning/                # Доменная модель, правила, product gaps
│   ├── current-state-map.md
│   ├── domain-model-v1.md
│   └── product-gap-list.md
├── reference/               # API docs, context-hub кеши
│   └── context-hub/
└── system-context/          # Архитектурный source-of-truth
    ├── DATABASE_SCHEMA.md
    ├── SYSTEM_CONSTRAINTS.md
    └── TECH_CONTEXT.md

tasks/
├── dashboard.md             # Человекочитаемый статус команды
├── dashboard.json           # Машиночитаемый статус (подхватывается agents-dashboard)
└── task-template.md         # Шаблон для каждой задачи
```

### Шаг 2: Создай агентов

Создай `.claude/agents/` с этими файлами:

**reviewer-architect.md** — Независимый критик и архитектурный gate (**только pre-code review**).

```yaml
---
name: reviewer-architect
description: Independent engineering critic and architecture gate. Use ONLY for pre-code review (before coding). Post-code review is handled by OpenRouter script.
tools: Read, Grep, Glob, Bash, WebFetch, WebSearch
model: claude-sonnet-4-6
---
```

Роль:

- **Pre-code review ONLY**: проверяет план перед кодингом (Architecture fit, Risks, Verdict: PROCEED/REVISE)
- Знает архитектурные правила проекта, не даёт их нарушать
- Не кодит сам, не заменяет QA
- Post-code review делает **OpenRouter скрипт** (GPT-5.4-mini) — независимое мнение от другой модели

**implementation-agent.md** — Исполнитель, пишет код.

```yaml
---
name: implementation-agent
description: Executes approved work in the staging repository. Use after reviewer-architect approves the plan. Stays inside approved scope.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-opus-4-6
---
```

Роль:

- Работает ТОЛЬКО в staging, ТОЛЬКО по одобренному плану
- Не расширяет scope самостоятельно
- По завершении немедленно передаёт на review
- Output: Files changed, Files created, Build status, Ready for review: YES/NO

**qa-agent.md** — QA верификация.

```yaml
---
name: qa-agent
description: Independent validation layer after implementation and review. Verifies behavior, checks regressions, validates user flow.
tools: Read, Grep, Glob, Bash
model: claude-sonnet-4-6
---
```

Роль:

- Build verification (build + lint MUST pass)
- Проверка scope coverage, data flow, edge cases
- Playwright browser testing (обязательно, не опционально)
- Verdict: ACCEPT/REVISE, Deploy: GO/NO-GO

**docs-memory-agent.md** — Обновляет документацию.

```yaml
---
name: docs-memory-agent
description: Keeps source-of-truth docs aligned with real work. Use after supervisor accepts a task.
tools: Read, Write, Edit, Grep, Glob
model: claude-sonnet-4-6
---
```

Роль:

- Обновляет CHANGELOG, ARCHITECTURE, DECISIONS, DATABASE_SCHEMA
- Записывает новые правила если был повторяющийся failure
- НЕ делает спекулятивные изменения без реального повода

**designer.md** — UI/UX дизайнер.

```yaml
---
name: designer
description: Frontend UI/UX designer. Creates production-grade interfaces with animations.
tools: Read, Write, Edit, Bash, Grep, Glob
model: opus
---
```

### Шаг 3: Создай task-template.md

```markdown
# Task Template

## Task Title

[descriptive title]

## Goal

What should be improved/fixed/completed?

## Why This Matters

What product or engineering value does this unlock?

## Scope

- **In scope:**
- **Out of scope:**

## Affected Areas

- Modules:
- Files (expected/likely):
- Integrations:

## References to Consult

- Planning docs:
- Project-local references:

## Risks

- Architecture risks:
- UX risks:
- Regression risks:

## Expected Deliverables

- Code changes:
- Tests:
- Docs:

## Acceptance Criteria

- [ ]
- [ ]

## Workflow Continuity

- Next step after each phase must be explicit
- Dashboard must be updated immediately at each phase transition
- If no approval boundary exists, next agent must be triggered immediately
```

### Шаг 4: Добавь в CLAUDE.md workflow rules

Добавь в проектный CLAUDE.md эти секции (адаптируй под проект):

```markdown
## Supervisor Role (Lead Session)

This session acts as the Supervisor for the agent team.
You are responsible for this project. Yuri is your manager. You manage the agent team.

### Core Rules

- Frame tasks clearly before execution using the task template
- Enforce staging-only rule: implementation-agent works only in staging
- Stop uncontrolled scope growth
- **Dashboard discipline:** Update BOTH dashboard.md AND dashboard.json at EVERY phase transition
- After every completed step, immediately trigger the next step
- **Approval gate:** Wait for explicit user approval before launching implementation-agent
- Each checkpoint: verify (1) actual task status and (2) dashboard accuracy

### Must NOT Do

- Skip review just to move faster
- Treat first implementation as automatically acceptable
- Let silent multi-hour drift happen

### Standard Workflow Sequence

1. Supervisor frames the task (using task template)
2. reviewer-architect critiques the plan (pre-code review) — Claude Sonnet agent
3. **→ WAIT for user approval ←**
4. implementation-agent executes scoped work
5. **OpenRouter post-code review** — `node scripts/openrouter-review.cjs` (GPT-5.4-mini, independent second opinion)
6. qa-agent verifies behavior and regressions
7. Supervisor decides accept / revise
8. docs-memory-agent updates documentation

### Minimum Handoff Content

Each handoff to an agent MUST include:

- Task goal
- In-scope / Out-of-scope changes
- Affected files/modules
- Constraints / references to consult
- Known risks
- Required outputs

### Documentation Ownership

After EVERY completed task:

- Update CHANGELOG.md
- Verify ARCHITECTURE.md, DATABASE_SCHEMA.md
- Create/update task file in tasks/TASK-XXX-\*.md
- Failing to update docs = supervisor failure

### Ideas — Auto-Capture

During ANY task, if you discover something that should be built but is out of scope:

- Create a file in docs/ideas/
- Add to dashboard.json ideas array
- Don't wait for user — if you see a gap, write it down

## Available Agents

| Agent                | Model                    | Role                                                      |
| -------------------- | ------------------------ | --------------------------------------------------------- |
| reviewer-architect   | Sonnet                   | **Pre-code review only**, architecture gate               |
| **openrouter-review**| **GPT-5.4-mini (OpenRouter)** | **Post-code review** — independent second opinion via script |
| implementation-agent | Opus                     | Coding, stays in staging, follows approved scope          |
| designer             | Opus                     | UI/UX design + implementation                             |
| qa-agent             | Sonnet                   | Build verification, data flow, edge cases, browser checks |
| docs-memory-agent    | Sonnet                   | Updates docs, records decisions                           |

## Docs Update Protocol

After ANY structural change:

1. Update relevant doc in docs/
2. Update CLAUDE.md if project-level context changed
3. Add entry to docs/DECISIONS.md for architecture decisions
4. Add entry to docs/CHANGELOG.md
```

### Шаг 5: Настрой hooks в .claude/settings.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');const p=require('path').join(process.cwd(),'tasks','dashboard.json');try{const s=fs.statSync(p);const mins=Math.round((Date.now()-s.mtime.getTime())/60000);if(mins>15){console.error('⏰ dashboard.json is '+mins+' min stale. Update it now if phase changed.');}}catch(e){}\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');const path=require('path');const cwd=process.cwd();const checks=[];const db=path.join(cwd,'tasks','dashboard.json');try{const s=fs.statSync(db);const m=Math.round((Date.now()-s.mtime.getTime())/60000);if(m>30)checks.push('⚠️ dashboard.json STALE ('+m+' min)');else checks.push('✅ dashboard.json OK');}catch(e){checks.push('❌ dashboard.json MISSING');}const cl=path.join(cwd,'docs','CHANGELOG.md');try{const s=fs.statSync(cl);const m=Math.round((Date.now()-s.mtime.getTime())/60000);if(m>120)checks.push('⚠️ CHANGELOG.md not updated this session');else checks.push('✅ CHANGELOG.md OK');}catch(e){checks.push('❌ CHANGELOG.md MISSING');}console.log('SESSION END CHECK:\\n'+checks.join('\\n'));\""
          }
        ]
      }
    ]
  }
}
```

### Шаг 6: Создай скрипт post-code review (OpenRouter)

Post-code review выполняется через OpenRouter API (GPT-5.4-mini), а не через Claude агента. Это даёт независимое мнение от другой модели и снижает расход на Claude.

1. Создай `scripts/openrouter-review.cjs` — Node.js скрипт, который:
   - Собирает git diff (staged, unstaged, или vs branch)
   - Отправляет в OpenRouter с системным промптом, содержащим архитектурные правила проекта
   - Возвращает structured review в формате `[BLOCKING/NON-BLOCKING/FOLLOW-UP]` + Verdict
2. Добавь `OPENROUTER_API_KEY` в `.env.local`
3. Модель настраивается через `REVIEW_MODEL` env var (по умолчанию `openai/gpt-5.4-mini`)

Использование:
```bash
node scripts/openrouter-review.cjs                  # все незакоммиченные изменения
node scripts/openrouter-review.cjs --staged         # только staged
node scripts/openrouter-review.cjs --branch main    # diff vs branch
node scripts/openrouter-review.cjs -o review.md     # вывод в файл
node scripts/openrouter-review.cjs --context "..."  # доп. контекст задачи
```

**Почему гибрид:**
- Pre-code review остаётся на Claude Sonnet (нужен агентный контекст, чтение файлов, интерактив)
- Post-code review через OpenRouter (fire-and-forget на diff, дешевле, независимое мнение)
- Когда восстановится лимит Codex CLI — можно переключиться на `codex exec review`

### Шаг 7: Создай dashboard.json (стартовый)

```json
{
  "lastUpdated": "[ISO DATE]",
  "status": "active",
  "currentTask": null,
  "activeAgents": [],
  "pipeline": [],
  "completedTasks": [],
  "residualItems": [],
  "ideas": [],
  "stats": {
    "totalCommits": 0,
    "totalFilesChanged": 0,
    "buildStatus": "unknown"
  }
}
```

### Шаг 8: Зарегистрируй проект в agents-dashboard

У нас уже есть консолидированный дашборд: `G:/01_OPUS/Projects/agents-dashboard/`.
Он автоматически подхватывает `tasks/dashboard.json` из каждого зарегистрированного проекта.

Добавь новый проект в `G:/01_OPUS/Projects/agents-dashboard/projects.json`:

```json
{
  "portal": "G:/01_OPUS/Projects/PORTAL_staging",
  "k-studio": "G:/01_OPUS/Projects/k-studio",
  "[new-project]": "G:/01_OPUS/Projects/[NEW_PROJECT_PATH]"
}
```

Дашборд читает данные каждые 5 секунд. После добавления записи — новый проект сразу появится в табах.

**НЕ нужно** генерировать dashboard.html — он уже есть и обслуживает все проекты.

---

### Что адаптировать под проект:

1. **Stack section** в CLAUDE.md — замени на свой стек
2. **Architecture Rules** — напиши свои non-negotiable правила
3. **Modules table** — перечисли свои модули
4. **Status Mapping** — если есть внешняя система (ClickUp, Jira и т.д.)
5. **Agent definitions** — добавь project-specific контекст в каждого агента
6. **Skills** — добавь project-specific скиллы в `.claude/skills/` если нужны API reference docs
7. **Hooks** — добавь Telegram notification hook если нужен

### Ключевые принципы, которые делают эту систему рабочей:

1. **Supervisor не кодит** — он управляет, фреймит задачи, принимает/отклоняет
2. **Approval gates** — между планом и кодом всегда стоит человек
3. **Dashboard как single source of truth** — всегда актуальный, обновляется на каждом переходе
4. **Docs = обязанность, не опция** — если доки не обновлены, задача не завершена
5. **Ideas auto-capture** — агенты записывают gaps, даже если это не в scope текущей задачи
6. **Flow discipline** — после завершения шага сразу запускается следующий, без пауз
7. **Не обещать без действия** — если сказал "делаю X", делай в том же ходе
