# Bug Batch: Sidebar Badge Fixes + MeineAufgaben Line Strip

**Date:** 2026-04-14  
**Found during:** Phase 7 human verification  
**Priority:** High (UX regression — badges are a key navigation signal)

---

## Bug 1 — MeineAufgaben: лишняя линия с именем ClickUp-листа

**Where:** `src/shared/pages/MeineAufgabenPage.tsx`  
**Symptom:** В верхней части страницы отображается горизонтальная линия с названием ClickUp-листа.  
**Fix:** Найти и убрать рендер названия листа (вероятно заголовок группы или divider из группировки задач).

---

## Bug 2 — Sidebar: нет бабла у "Meine Aufgaben"

**Where:** Sidebar компонент, навигационная ссылка на `/meine-aufgaben`  
**Symptom:** Баббл не отображается, хотя на самой странице счётчик показывает `2`.  
**Expected:** Баббл = `attentionTasks.length + visibleRecommendations.length + unreadMessages`  
**Fix:** Подключить тот же источник данных, что использует страница, в sidebar badge.

---

## Bug 3 — Sidebar: нет бабла у "Aufgaben" (Tickets/Support)

**Where:** Sidebar компонент, навигационная ссылка на `/aufgaben`  
**Symptom:** Баббл отсутствует.  
**Expected:** Баббл = `Ihre Rückmeldung задачи + unread messages в задачах`  
**Note:** В sidebar у Support-кнопки баббл есть — логика уже существует, нужно подключить к Aufgaben.

---

## Bug 4 — Страница Aufgaben: кнопка "Support" без бабла

**Where:** `src/modules/tickets/pages/TicketsPage.tsx` — кнопка Support  
**Symptom:** На странице у кнопки Support нет бабла, хотя в sidebar он есть.  
**Fix:** Добавить тот же badge что в sidebar.

---

## Bug 5 — Sidebar: нет баблов для проектов

**Where:** Sidebar, раздел Workspaces/Projects  
**Symptom:** Если в проекте есть задача на принятие (`CLIENT REVIEW`) или новое сообщение — баббл рядом с проектом не показывается.  
**Expected:** Баббл рядом с проектом = `client_review tasks + unread project messages`  
**Note:** Нужно проверить, какие данные уже есть в хуках и что нужно докинуть в sidebar.

---

## Bug 6 — MeineAufgaben: карточка задачи растянута на всю ширину

**Where:** `src/shared/pages/MeineAufgabenPage.tsx` — список attention tasks  
**Symptom:** Карточка задачи (не рекомендация) занимает всю ширину контейнера вместо того, чтобы выглядеть как карточка. Карточки рекомендаций при этом отображаются корректно.  
**Expected:** Карточки attention tasks должны иметь такой же вид, как TaskCard на других страницах — с border, скруглениями, максимальной шириной и отступами.  
**Fix:** Проверить, как список attention tasks рендерится в MeineAufgabenPage — вероятно, TaskCard обёрнут без нужного контейнера или используется другой компонент без card-стилей.

---

## Scope notes

- Все изменения — frontend only, без Edge Functions и DB
- Баббл-логика уже частично реализована (Support в sidebar работает) — нужно распространить на остальные пункты
- Проверить `useUnreadCounts`, `useNotifications`, `useClickUpTasks` — они уже используются на страницах
