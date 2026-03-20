# 🧩 Client Portal × ClickUp

## Task Lifecycle, Status Mapping & Actions — FINAL

### Context

We are building a **client-facing project portal** on top of **ClickUp**.

ClickUp is the **internal source of truth** used by the delivery team.  
The portal is a **simplified, responsibility-based UI** designed for clients.

**Core principle:**  
Clients must never see internal workflow complexity.  
The portal shows **only what matters for the client**, not how the team works internally.

---

## 1. ClickUp — Internal Statuses (Authoritative)

- TO DO
- IN PROGRESS
- INTERNAL REVIEW
- CLIENT REVIEW
- REWORK
- APPROVED
- COMPLETE
- ON HOLD
- CANCELED

**Semantics**

- INTERNAL REVIEW = internal QA / lead / manager check
- CLIENT REVIEW = waiting for client decision
- REWORK = universal rework
- ON HOLD = paused by decision
- CANCELED = task intentionally stopped

---

## 2. Client Portal — Visible Statuses

- Open
- In Progress
- Needs Your Attention
- Approved
- Done
- On Hold
- Cancelled

---

## 3. Status Mapping

| ClickUp Status  | Portal Status        |
| --------------- | -------------------- |
| TO DO           | Open                 |
| IN PROGRESS     | In Progress          |
| INTERNAL REVIEW | In Progress          |
| REWORK          | In Progress          |
| CLIENT REVIEW   | Needs Your Attention |
| APPROVED        | Approved             |
| COMPLETE        | Done                 |
| ON HOLD         | On Hold              |
| CANCELED        | Cancelled            |

Portal status is **derived**, never stored.

---

## 4. Lifecycle Rules

### Base flow

```
TO DO → IN PROGRESS → INTERNAL REVIEW → CLIENT REVIEW → APPROVED → COMPLETE
```

### Rework

```
Any change → REWORK → IN PROGRESS → INTERNAL REVIEW → CLIENT REVIEW
```

Rule: **After every REWORK → INTERNAL REVIEW**.

---

## 5. Portal Filter Order

1. Needs Your Attention (only if count > 0)
2. All
3. Open
4. In Progress
5. Approved
6. Done
7. More

**More menu**

- On Hold
- Cancelled

---

## 6. Task Ordering

- Order by `last_activity_at DESC`
- Applies inside each filter

---

## 7. Task Actions

### Always available

- Put on Hold / Resume
- Cancel Task

(Except Done / Cancelled)

### Only in Needs Your Attention

- Approve
- Request Changes

---

## 8. Action → ClickUp Status

| Action          | ClickUp     |
| --------------- | ----------- |
| approve         | APPROVED    |
| request_changes | REWORK      |
| put_on_hold     | ON HOLD     |
| resume          | TO DO       |
| cancel          | CANCELED    |

---

## 9. Actions UI

**Needs Your Attention**

- Primary: Approve, Request Changes
- Secondary (delicate): Put on Hold / Resume, Cancel

**Other statuses**

- Only secondary actions

Secondary buttons must be subtle (outline/ghost), same style as _Open Full Page_.

---

## 10. Confirmations

- Hold / Resume / Cancel → confirmation + optional comment
- Success → toast + refetch tasks

---

## 11. Backend (Edge Function)

Endpoint: `update-task-status`

```json
{
  "taskId": "string",
  "action": "approve | request_changes | put_on_hold | resume | cancel",
  "comment": "optional"
}
```

---

## 12. Non‑Goals

- No Internal Review / Rework in portal
- No duplicate meanings
- No arbitrary client status changes

---

## Result

A clean, predictable lifecycle:

- Powerful internally
- Calm and clear for clients
- Single attention trigger: **Needs Your Attention**
