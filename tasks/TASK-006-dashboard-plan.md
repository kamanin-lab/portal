# TASK-006: Interactive Team Dashboard

## Context
The `.md` dashboard works but is hard to scan visually. Need an HTML dashboard with timeline, live status, auto-refresh. This is a developer/supervisor tool, not a client-facing page.

## Architecture
- `tasks/dashboard.json` — machine-readable state (Supervisor writes this on every phase transition)
- `tasks/dashboard.html` — standalone HTML page, reads dashboard.json, auto-refreshes every 5s
- No build step, no npm, no framework — plain HTML + CSS + vanilla JS
- Opens directly in browser: `file:///G:/01_OPUS/Projects/PORTAL_staging/tasks/dashboard.html`

## dashboard.json Schema
```json
{
  "lastUpdated": "2026-03-22T15:30:00Z",
  "status": "active",
  "currentTask": {
    "id": "TASK-006",
    "title": "Interactive Dashboard",
    "description": "Build HTML dashboard with timeline"
  },
  "activeAgents": [
    { "name": "designer", "status": "working", "task": "Building dashboard UI" }
  ],
  "pipeline": [
    { "phase": "Task Framing", "status": "done", "agent": "Supervisor", "notes": "..." },
    { "phase": "Implementation", "status": "in_progress", "agent": "designer", "notes": "..." }
  ],
  "completedTasks": [
    {
      "id": "TASK-005",
      "title": "Real-Time Updates",
      "date": "2026-03-22",
      "commits": ["0e28a22"],
      "summary": "DB Realtime publication, subscription fixes, polling",
      "filesChanged": 5,
      "reviewCycles": 1
    }
  ],
  "residualItems": [
    { "item": "StepDetail.tsx 247 lines", "priority": "low" }
  ],
  "stats": {
    "totalCommits": 8,
    "totalFilesChanged": 80,
    "testsPassing": "77/77",
    "buildStatus": "clean"
  }
}
```

## dashboard.html Design

### Layout (dark theme, developer aesthetic)
```
┌─────────────────────────────────────────────────────┐
│ KAMANIN PORTAL — Team Dashboard          Last: 15s  │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌──────────────────────────┐   │
│ │ CURRENT TASK     │  │ ACTIVE AGENTS            │   │
│ │ TASK-006         │  │ 🟢 designer — building   │   │
│ │ Interactive...   │  │ 🟢 qa-agent — verifying  │   │
│ └─────────────────┘  └──────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│ PIPELINE TIMELINE                                    │
│ ●━━━●━━━●━━━◉━━━○━━━○━━━○                          │
│ Frame Review Plan  Impl  Review QA  Accept           │
│ ✅    ✅    ✅    🔄    ⬜   ⬜    ⬜              │
├─────────────────────────────────────────────────────┤
│ COMPLETED TASKS                                      │
│ ┌─────┬──────────────────────┬────────┬──────────┐  │
│ │ ID  │ Title                │ Date   │ Files    │  │
│ ├─────┼──────────────────────┼────────┼──────────┤  │
│ │ 005 │ Real-Time Updates    │ Mar 22 │ 5 files  │  │
│ │ 004 │ Account Page         │ Mar 22 │ 22 files │  │
│ │ ... │ ...                  │ ...    │ ...      │  │
│ └─────┴──────────────────────┴────────┴──────────┘  │
├─────────────────────────────────────────────────────┤
│ STATS: 8 commits · 80 files · 77/77 tests · clean  │
├─────────────────────────────────────────────────────┤
│ RESIDUAL ITEMS                                       │
│ • StepDetail.tsx 247 lines (low)                    │
│ • UpdatesFeed.tsx 170 lines (low)                   │
└─────────────────────────────────────────────────────┘
```

### Visual Style
- Dark background (#0d1117 GitHub dark), monospace font (DM Mono or JetBrains Mono)
- Pipeline as horizontal node timeline with colored dots
- Status colors: green (done), amber (in progress), red (blocked), gray (pending)
- Pulsing dot for active phase
- Auto-refresh indicator in header (countdown "Refresh in Xs")
- Responsive — works on phone too (Yuri checks from phone)

### Behavior
- Reads `dashboard.json` via fetch() every 5 seconds
- On error (file not found) — shows "Offline" state gracefully
- Pipeline nodes are clickable — show phase details in a tooltip
- Completed tasks expandable — click to see commits/summary
- Smooth transitions when data changes (CSS transitions)

## Files to Create
1. `tasks/dashboard.html` — standalone HTML page (~200-300 lines)
2. `tasks/dashboard.json` — initial state from current data

## Files to Modify
- None (this is additive)

## Verification
- Open `tasks/dashboard.html` in browser — renders correctly
- Edit `tasks/dashboard.json` manually — page auto-updates within 5s
- Check mobile layout (responsive)
