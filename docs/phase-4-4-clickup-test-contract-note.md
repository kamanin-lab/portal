# Phase 4.4 ClickUp Test Contract Note

Frozen for first-wave hardening work only.

- Approved ClickUp test folder: `https://app.clickup.com/90152151415/v/f/901513727289/90159069069`
- Visibility field contract: `Visible in client portal`
- Safe default: unverifiable visibility is treated as hidden
- Public comment contract: top-level `@client:` starts the only client-facing thread used during hardening
- Project phase contract: `phaseOptionId` must resolve to `chapter_config.id` via shared mapping before cache writes

This note is local implementation documentation only. No live ClickUp mutations were performed by this change set.
