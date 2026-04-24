# kmn — стратегические заметки

_Зафиксировано: 21 апреля 2026_
_Статус: идеи и решения из серии обсуждений. Не план реализации._
_Следующий шаг: POC одного MCP App для Revenue Intelligence._

---

## Зачем этот документ

Это заметки для личной идеи-базы, не product spec. Здесь собраны решения и идеи из нескольких сессий обсуждения стратегии kmn. Цель — не потерять контекст и иметь к чему вернуться после POC.

**Важно:** большая часть этого — стратегическое видение на 6-18 месяцев. Сейчас приоритет — протестировать один MCP App. Всё остальное имеет смысл обсуждать после того как proof-of-concept покажет что подход работает.

---

## Ключевое изменение стратегии — MCP-first architecture

### Что изменилось

Было: строим классический React + Supabase портал для клиентов KAMANIN.

Стало: строим MCP-first продукт где:
- UI шипится через MCP Apps spec (не генерируется динамически, а заранее написан как React компоненты компилированные в HTML bundles)
- Работает одновременно в трёх местах: portal.kamanin.at, Claude Desktop, ChatGPT
- Использует готовые external MCP серверы (Klaviyo, GA4, GSC) вместо написания своих REST wrappers
- Наш сервер это оркестратор, не реализатор каждой интеграции с нуля

### Почему это правильное направление

Основано на:
- Выступление David Soria Parra (co-creator MCP, Anthropic) AI Engineer 2026
- Официальный блог MCP: MCP Apps launched 26 января 2026, production-ready
- Google Cloud официальная поддержка MCP (декабрь 2025)
- OpenAI Apps SDK = один стандарт с MCP Apps
- Anthropic передал MCP в Linux Foundation (декабрь 2025)

2026 — год connectivity. Knowledge workers нуждаются в агентах которые подключаются к их SaaS инструментам. MCP это стандарт для этого.

---

## Продуктовая структура — четыре модуля

### 1. SEO Guardian
Cross-source SEO мониторинг:
- Sitebulb или Screaming Frog Cloud (технический аудит)
- Google Search Console (позиции, клики)
- GA4 (поведение на страницах)
- WooCommerce (revenue attribution)

Ключевая фишка: показывает SEO проблемы с привязкой к реальным деньгам. Не "у тебя 47 issues", а "у тебя 12 issues на страницах которые ранжируются в топ-15 Google, потенциал +2000 кликов/месяц".

### 2. Content Intelligence / Blog Builder
AI написание статей с интеграцией каталога:
- GSC keyword opportunities (что ищут но нет контента)
- Brand voice skills per client
- Автоматический подбор продуктов из каталога
- Вставка product blocks в Gutenberg
- Генерация изображений

Самый инновативный модуль. Никто не делает AI блог-редактор который сам находит продукты в каталоге и вставляет как блоки.

### 3. Revenue Intelligence
Cross-source "где лежат твои деньги":
- Stuck orders (WooCommerce)
- Out-of-stock published products (WooCommerce)
- Упущенный трафик (GSC + GA4)
- Неэффективные Ads (Google Ads)
- Brand-aware non-converting клиенты (Klaviyo)

**Выбран как первый POC модуль** — проще всего технически, не требует Maxi AI, сразу даёт value.

### 4. Bulk Actions
Массовые операции через Maxi AI:
- Mark out-of-stock bulk
- Bulk price changes (с HITL и undo)
- Bulk SEO meta (Yoast)
- Seasonal switch
- Alt text через Vision

Требует Phase 0: Maxi security fixes, DPA с Anthropic, licensing с Michael.

---

## Архитектурные решения

### Инфраструктура (зафиксировано)

- **MCP сервер**: Vercel Node.js (быстрый старт, streamable HTTP из коробки)
- **Existing portal**: остаётся как есть, новые модули добавляются поверх
- **Database**: shared Supabase (уже есть на Coolify) с RLS
- **Продукт**: один продукт со слоями, client_workspaces toggle модулей
- **Exit plan**: self-hosted Kubernetes через 6-12 месяцев если понадобится

### Authentication (зафиксировано частично)

- **Identity provider**: Supabase Auth
- **MCP OAuth 2.1**: нужен свой OAuth server layer поверх Supabase Auth
- **Hierarchy**: agencies → clients → users
- **RLS**: через agency_id + client_id resolution
- **Открыто**: писать свой OAuth layer (1-2 недели) или Scalekit (платный, быстрее) — решается в POC

### External MCP Connections

Существующие готовые серверы, которые мы подключаем:
- **Klaviyo MCP** — официальный, remote, OAuth
- **Google Analytics MCP** — официальный Google, read-only
- **GSC MCP** — community (ahonn/mcp-server-gsc)
- **Maxi AI** — когда security fixed

Паттерн: наш kmn MCP — это **оркестратор**, который является клиентом для этих серверов. Мы не пишем Klaviyo wrapper — мы вызываем их MCP.

Connection strategy: per-tenant (каждый клиент имеет свои connections). On-demand (открываем при запросе, не держим постоянно).

### Data Storage

- **Cache**: TTL-based per source
  - WooCommerce orders: 60 секунд
  - GA4 metrics: 15 минут
  - GSC keywords: 24 часа
  - Sitebulb audits: 7 дней
  - Klaviyo campaigns: 15 минут
- **Skills**: Supabase Storage `client-skills/{tenant_id}/*.md` + `client_skills_index` table
- **Audit log**: `agent_invocations` table (все tool calls)
- **External tokens**: encrypted в Supabase, RLS по tenant
- **Все новые таблицы**: RLS по tenant_id

### Новые таблицы

```
agencies                      — агентства-тенанты
agency_clients                — клиенты агентств
agency_domains                — hostnames per agency (для white-label)
agency_branding               — logo, colors per agency
client_users                  — пользователи клиентов
external_auth_tokens          — encrypted OAuth tokens для Klaviyo, GA4, GSC
external_data_cache           — TTL-based cache external MCP responses
client_skills_index           — метаданные skills (content в Storage)
agent_invocations             — audit log tool calls
mcp_oauth_clients             — OAuth clients для Claude Desktop registrations
agent_sessions                — conversation sessions с агентом
```

### Deployment

- **Production**: main branch auto-deploy на Vercel
- **Staging**: feature flags на production через client_workspaces toggle
- **Preview**: Vercel preview URLs для PR тестирования

### UI Strategy — три уровня

1. **Фиксированные дашборды** (React компоненты, заранее написанные)
2. **Заготовленные quick-prompt кнопки** (10-20 интересных вопросов)
3. **Свободный чат** (agent с progressive discovery tools)

Все три уровня работают с одним MCP сервером. Структура жёсткая, содержимое динамическое.

---

## Product Vision (нужно уточнить потом)

### Стратегическое видение

Портал продаётся как SaaS продукт для WordPress/WooCommerce агентств. Не только для KAMANIN.

Модель:
- KAMANIN продаёт агентствам kmn Platform
- Агентства white-label для своих клиентов (их subdomain, их бренд)
- AI слой остаётся branded как kmn ("Powered by kmn")
- Revenue share: агентства платят KAMANIN, продают клиентам по своей цене

### Layers продукта

1. **Core platform** (white-labeled per agency)
   - Client management: tickets, support, files, projects, credits
   - Branded experience для клиентов агентств

2. **AI modules** (Powered by kmn — не whitelabeled)
   - SEO Guardian, Content Intelligence, Revenue Intelligence, Bulk Actions

3. **Integrations** (технические, невидимые)
   - ClickUp per agency
   - Nextcloud shared или per agency
   - External MCP servers per client
   - Maxi AI per WooCommerce store

### White-label позиция

Full white-label нужен. Уровень 2 из трёх:
- Свой subdomain агентства (portal.agency-42.com)
- Свой бренд в UI
- AI features получают "Powered by kmn" badge
- Клиент агентства видит "инструмент Agency-42"

**AI брендинг не whitelabel-ится** — это правильное решение, работает как Intel Inside / Powered by Stripe модель.

---

## Открытые вопросы (решать после POC)

### Продуктовые

1. **Product name** — kmn Platform или отдельное имя, а kmn только AI слой?
2. **Pricing tiers** — $99 / $299 / $999 или другие? Что входит в каждый?
3. **Go-to-market** — есть ли конкретные агентства-кандидаты или стратегическое видение?
4. **Agency persona** — small freelance (5 employees) или established (20+)?

### Технические

5. **OAuth implementation** — свой layer или Scalekit?
6. **AI billing model** — BYOK, KAMANIN платит, или hybrid?
7. **Existing portal multi-tenancy upgrade** — когда обновлять tickets/support/files до multi-tenancy?
8. **ClickUp per agency** — как абстрагировать hardcoded workspace?
9. **Nextcloud strategy** — shared или per agency?
10. **Data residency** — EU-only или multi-region?

### Операционные

11. **Support model** на 50+ агентствах
12. **Self-service onboarding** когда нужен
13. **Stripe billing integration** когда нужен
14. **Triage Agent** — остаётся отдельным треком вне kmn MCP? (склоняюсь к да)

---

## План работы (обновлённый)

### Этап 1: POC одного MCP App (СЕЙЧАС)

**Цель:** проверить что MCP Apps архитектура работает технически.

**Scope:**
- Один модуль — Revenue Intelligence
- Один external connector — WooCommerce (через WC REST или community MCP)
- Один tool — "revenue-today" или "stuck-orders"
- Один UI Resource — Money Card dashboard
- Локальный test через basic-host из ext-apps repo
- Или быстрый test на Vercel + Claude Desktop

**Длительность:** 1-2 недели

**Что учимся:**
- Работает ли MCP Apps spec на практике
- Насколько сложно writing UI Resources
- Как выглядит integration с existing portal кодом
- Supabase Auth + MCP OAuth совместимость
- Performance characteristics

**Не делаем:**
- Multi-tenancy (один tenant — KAMANIN)
- White-label
- Multiple modules
- Agency management
- Billing
- Любые external MCP кроме WooCommerce

### Этап 2: Расширение POC (если POC работает)

- Добавляем GA4 MCP connection
- Доделываем Revenue Intelligence модуль
- Тестируем с реальным клиентом (Summerfield)
- Собираем feedback

### Этап 3: Архитектурная foundation (только после успешного Phase 2)

- Hierarchical multi-tenancy в schema
- OAuth 2.1 layer
- UI Resource pipeline для branding
- Hostname-based tenant resolution

### Этап 4+: Масштабирование

Зависит от результатов предыдущих этапов и решений по открытым вопросам.

---

## Критичные принципы

Эти принципы зафиксированы и не меняются от разговора к разговору:

1. **MCP-first architecture** — строим не web app с MCP сбоку, а MCP сервер с web host как один из клиентов
2. **Используем готовые MCP серверы** — не пишем Klaviyo/GA4/GSC wrappers
3. **Наша ценность в оркестрации** — cross-source insights, skills layer, UI, авторизация, billing
4. **Hierarchical multi-tenancy заложена с первого дня** — даже если MVP single-agency
5. **AI branding — kmn, не whitelabel** — это правильная стратегия differentiation
6. **Phase 0 обязательно** — Maxi security fixes, DPA с Anthropic, licensing (before Bulk Actions в production)
7. **Existing portal не ломаем** — новые модули поверх, не переделка
8. **Progressive discovery mandatory** — не все tools в контексте сразу
9. **Skills layer с первого дня** — per-client brand voice, rules
10. **Production quality** — не experiment shortcuts, продукт будет продаваться

---

## Ключевые источники для справки

### Авторитетные источники MCP
- https://modelcontextprotocol.io/docs/extensions/apps — официальная MCP Apps docs
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps — launch announcement
- https://github.com/modelcontextprotocol/ext-apps — SDK и примеры
- https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services — Google MCP support
- https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation — Linux Foundation transfer

### External MCP серверы
- Klaviyo: https://developers.klaviyo.com/en/docs/klaviyo_mcp_server
- Google Analytics: https://developers.google.com/analytics/devguides/MCP
- GSC: https://github.com/ahonn/mcp-server-gsc

### OAuth best practices
- https://devblogs.microsoft.com/ise/aca-secure-mcp-server-oauth21-azure-ad/ — Microsoft MCP OAuth guide
- https://www.scalekit.com/blog/implement-oauth-for-mcp-servers — Scalekit MCP OAuth

### Видео трансформировавшее стратегию
- David Soria Parra, AI Engineer 2026 — "The Future of MCP" (транскрипт в контексте проекта)

---

## Что значит "успех POC"

Критерии по которым решаем идти дальше с MCP-first подходом:

**Технический успех:**
- [ ] MCP сервер разворачивается на Vercel без проблем
- [ ] UI Resource рендерится в Claude Desktop
- [ ] UI Resource рендерится в portal.kamanin.at (как embedded)
- [ ] Tool call end-to-end работает от UI до WooCommerce и обратно
- [ ] OAuth 2.1 flow работает хотя бы в hack режиме
- [ ] Performance acceptable (< 2s для tool call)

**Продуктовый успех:**
- [ ] Реальный пользователь (Nadine в Summerfield) использует POC
- [ ] Feedback positive на UX в portal.kamanin.at
- [ ] Feedback positive на UX в Claude Desktop
- [ ] Видна value от cross-source аспекта (даже с 1-2 sources)

**Стратегический успех:**
- [ ] Понятно как добавить второй модуль без major refactoring
- [ ] Понятно как добавить второго клиента без major refactoring
- [ ] Косты на token usage управляемые
- [ ] Нет fundamental blockers которых мы не видели

Если POC проходит — пишем FOUNDATION_SPEC и идём дальше.
Если POC показывает fundamental problems — переосмысливаем подход (например падаем обратно на обычный React portal с MCP endpoints, без MCP Apps).

---

## Файлы в контексте проекта для справки

### Существующие documents в проекте
- `DECISIONS.md` — ADR портала (25 решений)
- `SPEC.md` — design/component spec existing portal
- `ARCHITECTURE.md` — existing portal architecture
- `DATABASE_SCHEMA.md` — existing database schema
- `domain-model-v1.md` — domain model
- `current-state-map.md` — historical state map
- `NOTIFICATION_MATRIX.md`, `STATUS_TRANSITION_MATRIX.md` — operational matrices
- `CLICKUP_INTEGRATION.md`, `TECH_CONTEXT.md`, `SYSTEM_CONSTRAINTS.md` — technical context
- `PRODUCT_VISION.md` — existing portal vision (до kmn platform расширения)

### Созданные в предыдущих сессиях (в outputs)
- `TRIAGE_AGENT_V1_PROMPT.md` — Claude Code prompt для Triage Agent
- `MAXI_AI_ANALYSIS_PROMPT.md`, `MAXI_AI_CODE_REVIEW_PROMPT.md` — prompts для анализа Maxi
- `WOOCOMMERCE_INTELLIGENCE_ANALYSIS.md` — rounds 1-4 hypothesis testing prompts
- `PORTAL_INTELLIGENCE_ROADMAP.md` — предыдущая версия roadmap (до MCP-first shift)

---

## Последнее — важное напоминание

Это стратегические заметки. Не переоценивай их вес в текущем момент. Единственная реальная задача сейчас — **протестировать один MCP App для Revenue**. Всё остальное может измениться после того как станет понятно как это работает на практике.

Если POC покажет что MCP-first подход работает хорошо — эти заметки станут базой для FOUNDATION_SPEC.
Если POC покажет что подход не тянет наш use case — эти заметки станут артефактом того как мы размышляли, прежде чем пойти другим путём.

Оба варианта приемлемы. Главное — не планировать дальше чем мы проверили.
