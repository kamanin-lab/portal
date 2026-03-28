# Feature: Credit System Evolution (Kreditverlauf + Verbesserungen)

> Status: Plan Ready | Priority: Medium | Target: Next Sprint
> Date: 2026-03-27

## Текущее состояние

Кредитная система уже работает в продакшене:

| Компонент | Статус | Файл |
|---|---|---|
| credit_packages (таблица) | ✅ | migration |
| credit_transactions (ledger) | ✅ | migration |
| get_credit_balance (RPC) | ✅ | SQL function |
| useCredits hook | ✅ | `hooks/useCredits.ts` |
| CreditBalance (sidebar + header) | ✅ | `components/CreditBalance.tsx` |
| CreditBadge (task cards) | ✅ | `components/CreditBadge.tsx` |
| CreditApproval (Kostenfreigabe) | ✅ | `components/CreditApproval.tsx` |
| credit-topup edge fn | ✅ | `supabase/functions/credit-topup/` |
| Webhook integration | ✅ | `clickup-webhook/index.ts` |
| Onboarding script | ✅ | `scripts/onboard-client.ts` |

**Что отсутствует:** клиент видит только баланс (число). Нет истории транзакций, нет месячного обзора, нет ссылок на задачи.

---

## План развития

### Фаза 1: Credit-Verlauf (история кредитов) — основное

**Цель:** Клиент может видеть историю всех движений кредитов, сгруппированную по месяцам, с привязкой к задачам.

#### 1.1. Новый раздел "Guthaben" на странице Konto

Добавить секцию на `KontoPage.tsx` между `NotificationSection` и кнопкой "Abmelden":

```
┌─────────────────────────────────────────────────┐
│ ⚡ Guthaben                                      │
│                                                   │
│  12.5 Credits verfügbar                          │
│  Medium · 25/Monat                               │
│                                                   │
│  ─── März 2026 ────────────────────────────────  │
│  +25   Monatliche Gutschrift          01.03.     │
│   -3   SEO Audit durchführen →        15.03.     │
│   -2   SSL-Zertifikat erneuern →      18.03.     │
│  -1.5  Cookie Banner updaten →        22.03.     │
│                                                   │
│  Gesamt März: -6.5 / 25 Credits                  │
│                                                   │
│  ─── Februar 2026 ─────────────────────────────  │
│  +25   Monatliche Gutschrift          01.02.     │
│   -8   Website Redesign Phase 2 →    05.02.     │
│   -4   Performance Optimierung →      12.02.     │
│  +2    Korrektur: SEO Audit →         14.02.     │
│                                                   │
│  Gesamt Feb: -10 / 25 Credits                    │
│                                                   │
│  [Weitere laden...]                               │
└─────────────────────────────────────────────────┘
```

**Компоненты:**
- `CreditHistorySection.tsx` — основной контейнер на Konto page
- `CreditMonthGroup.tsx` — группа транзакций за месяц + итог
- `CreditTransactionRow.tsx` — одна строка (дата, описание, сумма, ссылка на задачу)

**Данные:**
- Запрос к `credit_transactions` с `order by created_at desc`
- Группировка по `YYYY-MM` на фронтенде
- Пагинация: первые 3 месяца, потом "Weitere laden"
- Ссылка на задачу: `task_id` → клик → `navigate(/tickets?taskId=${task_id})`

#### 1.2. Hook: useCreditHistory

```typescript
interface CreditTransaction {
  id: string
  amount: number
  type: 'monthly_topup' | 'task_deduction' | 'manual_adjustment'
  task_id: string | null
  task_name: string | null
  description: string | null
  created_at: string
}

interface MonthGroup {
  month: string      // "2026-03"
  label: string      // "März 2026"
  items: CreditTransaction[]
  totalSpent: number  // negative sum
  totalAdded: number  // positive sum
}

function useCreditHistory(monthsToLoad: number = 3): {
  months: MonthGroup[]
  hasMore: boolean
  loadMore: () => void
  isLoading: boolean
}
```

**Реализация:** простой запрос к `credit_transactions` с `limit` по дате. Группировка на клиенте (транзакций мало — десятки в месяц, не сотни).

#### 1.3. Типы транзакций → немецкие описания

| type | Описание в UI | Иконка |
|---|---|---|
| `monthly_topup` | Monatliche Gutschrift | `+` зелёный |
| `task_deduction` | {task_name} → (ссылка) | `-` красный |
| `manual_adjustment` | {description} | `±` серый |

---

### Фаза 2: Месячный обзор (Monthly Summary) — опционально

**Цель:** Простой индикатор использования за текущий месяц.

#### 2.1. Progress bar на CreditBalance

Расширить существующий `CreditBalance.tsx` — добавить мини-прогрессбар:

```
⚡ 12.5 Credits verfügbar
Medium · 25/Monat
[████████░░░░░░░░] 6.5 / 25 diesen Monat
```

- Считаем: сумма отрицательных транзакций за текущий месяц
- Прогрессбар: `spent / creditsPerMonth`
- Цвет: зелёный < 50%, жёлтый 50-80%, красный > 80%

**Данные:** одна RPC функция или запрос:
```sql
SELECT COALESCE(SUM(ABS(amount)), 0) as spent_this_month
FROM credit_transactions
WHERE profile_id = :userId
  AND amount < 0
  AND created_at >= date_trunc('month', now())
```

#### 2.2. Hook: useCreditMonthly

```typescript
function useCreditMonthly(): {
  spentThisMonth: number
  creditsPerMonth: number | null
  ratio: number  // 0-1
}
```

Расширение `useCredits` — один дополнительный запрос.

---

### Фаза 3: Уведомления о низком балансе — опционально

**Цель:** Клиент получает email когда баланс падает ниже 20%.

#### 3.1. Логика в webhook

В `clickup-webhook/index.ts`, после вставки `task_deduction` транзакции:

1. Получить новый баланс
2. Получить `credits_per_month`
3. Если `balance / credits_per_month < 0.2`:
   - Проверить: не отправляли ли уже за этот месяц (простой флаг в `credit_packages.last_low_balance_alert`)
   - Отправить email через Mailjet
   - Обновить флаг

#### 3.2. Email template

```
Betreff: Ihr Guthaben ist niedrig

Hallo {firstName},

Ihr aktuelles Guthaben beträgt {balance} Credits
({packageName} · {creditsPerMonth} Credits/Monat).

Guthaben unter 20% — bitte kontaktieren Sie uns,
falls Sie Ihr Paket anpassen möchten.

Ihr KAMANIN-Team
```

Добавить `low_balance` в `emailCopy.ts`.

---

## Что НЕ нужно делать (over-engineering)

| Идея | Почему нет |
|---|---|
| Графики/чарты расходов | Мало данных, нет смысла в визуализации |
| Package upgrade/downgrade UI | Юрий делает это вручную, клиентов мало |
| PDF-инвойсы из портала | Бухгалтерия идёт отдельно |
| AI-оценка кредитов | Phase 2+ из design spec, не сейчас |
| Export в CSV/Excel | Нет запроса |
| Аналитика конверсии | Внутренний инструмент, не для клиента |
| Running balance column | Считается на лету, хранить не нужно |

---

## Техническая реализация (Фаза 1 только)

### Новые файлы

| Файл | Назначение |
|---|---|
| `src/shared/components/konto/CreditHistorySection.tsx` | Секция на Konto page |
| `src/shared/components/konto/CreditMonthGroup.tsx` | Месячная группа |
| `src/shared/components/konto/CreditTransactionRow.tsx` | Строка транзакции |
| `src/modules/tickets/hooks/useCreditHistory.ts` | Hook для истории |

### Модифицируемые файлы

| Файл | Изменение |
|---|---|
| `src/shared/pages/KontoPage.tsx` | Добавить `<CreditHistorySection />` |

### База данных

Никаких миграций не нужно — `credit_transactions` уже содержит все данные:
- `amount` — сумма
- `type` — тип
- `task_id` + `task_name` — привязка к задаче
- `description` — описание
- `created_at` — дата

RLS уже настроен — пользователь видит только свои транзакции.

### Edge Functions

Никаких новых функций не нужно для Фазы 1. Данные уже в базе.

---

## Оценка сложности

| Фаза | Файлы | Сложность | Время |
|---|---|---|---|
| **Фаза 1: Credit-Verlauf** | 5 файлов (4 новых + 1 edit) | Низкая | 1 сессия |
| Фаза 2: Monthly Summary | 2 файла (1 new hook + 1 edit) | Низкая | 30 мин |
| Фаза 3: Low Balance Alert | 3 файла (webhook + email + migration) | Средняя | 1 сессия |

**Рекомендация:** Сделать Фазу 1, потом посмотреть нужна ли Фаза 2. Фаза 3 — когда будет больше клиентов.

---

## Порядок выполнения Фазы 1

1. `useCreditHistory` hook — запрос + группировка по месяцам
2. `CreditTransactionRow` — одна строка (иконка, описание, сумма, дата, ссылка)
3. `CreditMonthGroup` — заголовок месяца + итог + список строк
4. `CreditHistorySection` — баланс + список месяцев + "Weitere laden"
5. Интеграция в `KontoPage.tsx`
6. Тест: проверить с тестовым аккаунтом

---

## Связь с другими фичами

- **Recommendations** (`docs/ideas/recommendations.md`): при принятии рекомендации кредиты уже списываются через существующий webhook flow. История покажет эти списания.
- **Organizations** (`docs/ideas/organizations.md`): credit_packages привязан к profile_id. При переходе на орги — нужно будет решить: кредиты на уровне орги или пользователя.
