
## [ERR-20260321-001] project-panel-build-type-drift

**Logged**: 2026-03-21T18:32:00+01:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
Build failed after extending the project Step contract because mock data and a duplicated React key spread were not updated in lockstep.

### Error
`
TS2783: 'key' is specified more than once
TS2739: mock Step objects missing rawStatus, portalCta, milestoneOrder, isClientReview
` 

### Context
- Command: npm run build
- Trigger: first implementation batch for project panel redesign

### Suggested Fix
Whenever shared project types gain required fields, immediately update mock fixtures and scan JSX spreads for React-only props like key.

### Metadata
- Reproducible: yes
- Related Files: src/modules/projects/types/project.ts,src/modules/projects/lib/mock-data.ts,src/modules/projects/components/overview/QuickActions.tsx

### Resolution
- **Resolved**: 2026-03-21T18:32:00+01:00
- **Notes**: Updated fixtures and removed duplicated key spread before rerunning build.
---

