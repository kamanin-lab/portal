# 🎨 Status & Priority Color System — FINAL

## Context

This document defines the **canonical color system** for the Client Portal.
It covers **task statuses** (primary signal) and **task priorities** (secondary signal).

Colors are a **semantic UX tool**, not decoration.

The system must:
- feel calm and professional for clients
- be predictable for the team
- avoid visual overload (“traffic light effect”)
- work consistently across the entire portal

---

## Core UX Principles (Strict)

1. **Status > Priority**
2. **Color = information, not action**
3. **Buttons represent actions, not states**
4. **Never stack multiple strong colors**
5. **Calm first, attention second, alarm never**

---

## Portal Statuses

The client portal exposes only these statuses:

- Open  
- In Progress  
- Needs Your Attention  
- Approved  
- Done  
- On Hold  
- Cancelled  

Statuses are derived from ClickUp and are never stored independently.

---

## Status → Color Mapping (Authoritative)

| Status | Color Name | HEX | Meaning |
|------|-----------|-----|--------|
| Open | Soft Blue Grey | `#CBD5E1` | Exists, no action yet |
| In Progress | Calm Blue | `#3B82F6` | Work is ongoing |
| Needs Your Attention | Amber | `#F59E0B` | Client action required |
| Approved | Emerald | `#10B981` | Confirmed |
| Done | Deep Green | `#16A34A` | Finished |
| On Hold | Slate Grey | `#64748B` | Paused intentionally |
| Cancelled | Soft Red | `#EF4444` | Stopped |

---

## Priority Levels

Priorities are a **secondary signal** and must never override status meaning.

Available priority levels:
- Low
- Normal
- High
- Urgent

---

## Priority → Color Mapping

| Priority | Color Name | HEX |
|--------|------------|-----|
| Low | Cool Grey | `#94A3B8` |
| Normal | Neutral Grey | `#64748B` |
| High | Warm Amber | `#F59E0B` |
| Urgent | Controlled Red | `#DC2626` |

---

## Visual Hierarchy Rules

- Status colors may be used for:
  - chips / badges
  - subtle card accents
- Priority colors must be:
  - smaller
  - less saturated
  - badges or icons only
- Never combine:
  - filled priority badge on filled status background
  - red priority with amber status as large surfaces

---

## Buttons & Actions (Critical Rule)

Buttons must **not inherit status or priority colors**.

Buttons represent **actions**, not states.

### Button color rules

**Primary action**
- Approve  
  - Solid green `#10B981`
  - White text

**Secondary actions**
- Request Changes  
  - Outline  
  - Border/Text: `#F97316`

- Put on Hold / Resume  
  - Outline / ghost  
  - Border/Text: `#64748B`

- Cancel Task  
  - Outline only  
  - Border/Text: `#EF4444`  
  - Never solid red

---

## Tabs / Filters / Navigation

- Tabs must remain **neutral**
- Selected tab may use a subtle neutral highlight
- Never apply status colors to navigation elements

Reason: navigation ≠ state.

---

## Accessibility

- All text must meet WCAG AA contrast
- No flashing, pulsing, or animated color signals
- Dark mode must reuse the same semantic meanings

---

## Explicit UX Verdict

✅ Cards, chips, badges → colored  
❌ Buttons, tabs, controls → neutral  

---

## Result

Users must understand:
- **status by color**
- **priority by subtle hint**
- **actions by shape and placement**

Not by a traffic-light interface.
