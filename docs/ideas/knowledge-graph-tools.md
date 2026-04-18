# Codebase Knowledge Graph Tools — Evaluated and Rejected

> Status: REJECTED (2026-04-18) | Reconsider: ~6 months or when blockers below are fixed

## TL;DR

Evaluated two codebase knowledge-graph tools — **code-review-graph** (MCP-based) and **graphify** (AST-based). Ran a controlled benchmark on two realistic tasks against the PORTAL codebase. Neither tool hit the 40%-files-read reduction threshold on both benchmark tasks. Plan quality with code-review-graph was modestly better, but not enough to justify the adoption and maintenance cost, and both tools' default install paths are hostile to a controlled agent pipeline.

Full experiment artifacts were preserved under `.experiments/graph-tools/` (git-ignored) during the run, then torn down.

## What was tested

| Tool | Version | Approach |
|---|---|---|
| [code-review-graph](https://github.com/tirth8205/code-review-graph) | 2.3.2 | Persistent SQLite graph + 30 MCP tools (`get_minimal_context_tool`, `get_impact_radius_tool`, etc.) |
| [graphify (`graphifyy`)](https://github.com/safishamsi/graphify) | 0.4.21 | Tree-sitter AST → networkx → `GRAPH_REPORT.md` + `graph.json` + HTML viz |

Both are AST-only — no LLM API calls for graph build (confirmed by dependency audit + source grep).

## Benchmark — real tasks in three modes

Tasks:
- **Task A**: "Add column `client_notes` to task_cache and surface it in TaskDetailSheet"
- **Task B**: "Add new priority level 'critical' with its own PriorityIcon rendering"

Modes:
1. Baseline (no graph, just CLAUDE.md + ad-hoc exploration)
2. With code-review-graph context pre-loaded
3. With graphify `GRAPH_REPORT.md` pre-loaded

Each of the six runs used an independent subagent with a clean context and was stopped after plan generation (no code written).

### Results

| Task | Baseline files / tool calls | crg files / tool calls | graphify files / tool calls |
|---|---|---|---|
| A | 9 / 18 | 8 / 11 (**-11% / -39%**) | 9 / 13 (0% / -28%) |
| B | 13 / 21 | 10 / 12 (-23% / **-43%**) | 8 / 14 (-38% / -33%) |

Plan accuracy (1-5): baseline 4, crg **5**, graphify 4.

## Why reject (ranked)

1. **40% files-read bar not cleared** on BOTH tasks by either tool. crg hit 40%+ on tool-call count only.
2. **Integration hostility.** Both tools' default install auto-writes to `CLAUDE.md`, `.mcp.json` at repo root, and/or PreToolUse hooks. Controlled pipeline would need to invoke install with careful flags and/or manually manage the MCP config under `.claude/`. During evaluation we captured the proposed `.mcp.json` content but did NOT let it write. A CI job running the install unattended would produce unexpected diffs in source-of-truth config files.
3. **graphify's write-path bug.** The tool writes `graphify-out/` inside the scanned directory (not at an `--output` flag). During Phase 2 this caused a leak into `src/modules/tickets/graphify-out/` that required manual cleanup. In real adoption, `graphify-out/` directories would scatter through `src/` after every scan.
4. **Shared TypeScript blind spot.** Tree-sitter extracts functions cleanly but not TypeScript interface/type declarations. On this codebase, every benchmark agent in graph mode still had to Read `types/tasks.ts` manually. For a heavily-typed React codebase, half the "orient the agent" value is missing.
5. **Weak community detection.** code-review-graph fell back to file-based detection (`igraph not available`) and produced directory-shaped clusters (huge "tests-chapter" / "tests-task" mixed-module blobs). graphify reported 58 communities but ~30 were empty placeholders and ~20 were flagged by the tool itself as "Knowledge Gaps".
6. **Small codebase size.** PORTAL is ~242 source files. Delta likely widens on larger codebases; on this one the improvement is marginal.

## Cheaper alternative (recommended instead)

Hand-maintained `docs/system-context/MODULE_MAP.md`:
- File list per module (components/hooks/lib/pages/types)
- One-line description per file
- Key cross-module edges noted prose-style
- Architecture rules that agents should know when touching each module

Cost: ~1h to write, ~15min/month to keep current. No tool dependency, no CLAUDE.md injection, no staleness risk beyond our own discipline.

## Reconsider adoption when

- Either tool ships an `install --readonly` mode that doesn't touch CLAUDE.md / `.mcp.json` / hooks.
- Either tool's tree-sitter queries surface TypeScript interfaces/types as queryable graph nodes.
- Our codebase grows past ~500-700 files where the baseline files-read count would be large enough for a graph to offer real leverage.

## Minimum viable CLAUDE.md change (if we DID adopt — NOT applied)

*Preserved here for future reference if the reconsider conditions are ever met.*

```markdown
## Codebase knowledge graph (optional)

A pre-built knowledge graph lives at `.code-review-graph/graph.db`. Agents can consult it
via MCP tools (`get_minimal_context_tool`, `get_review_context_tool`) to orient faster
on cross-module changes. The graph may be stale — verify file paths and references
against live code before acting.

Rebuild with `code-review-graph update` (fast, incremental).
```

No PreToolUse hooks. No auto-install. No `.mcp.json` at repo root — put MCP config under `.claude/`.

## Benchmark observations worth remembering

- **Graph pre-context replaces Grep/Glob, not Read.** Agents with graph context made fewer exploratory searches but still had to Read the actual files to draft changes. Read count reduction was modest (8-23%); Grep+Glob reduction was large (60-80%).
- **Baseline Task A over-engineered.** Without graph context, the agent proposed an editable-notes UI + new Edge Function — out of scope for "surface it". Graph-context agents stayed closer to the brief. The in-scope discipline may be worth something, but it can also be achieved with clearer task briefs.
- **Zero API cost.** Both tools build graphs locally. No hidden spend to fear if/when we revisit.
