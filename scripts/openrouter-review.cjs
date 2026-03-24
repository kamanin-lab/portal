#!/usr/bin/env node
/**
 * Post-code review via OpenRouter API (gpt-5.4-mini).
 * Replaces Claude reviewer-architect for post-code review step.
 *
 * Usage:
 *   node scripts/openrouter-review.js                  # review all uncommitted changes
 *   node scripts/openrouter-review.js --staged         # review only staged changes
 *   node scripts/openrouter-review.js --branch main    # review diff vs branch
 *   node scripts/openrouter-review.js --files "a.ts b.ts"  # review specific files
 *
 * Env:
 *   OPENROUTER_API_KEY  — required (or reads from .env.local)
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────────────
const MODEL = process.env.REVIEW_MODEL || "openai/gpt-5.4-mini";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_DIFF_CHARS = 120_000; // ~30k tokens budget for diff
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Load API key ────────────────────────────────────────────────────────────
function getApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // Try .env.local
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    const match = fs
      .readFileSync(envPath, "utf-8")
      .match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }

  console.error("ERROR: OPENROUTER_API_KEY not set. Export it or add to .env.local");
  process.exit(1);
}

// ── Parse args ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: "all", branch: null, files: null, output: null, context: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--staged":
        opts.mode = "staged";
        break;
      case "--branch":
        opts.mode = "branch";
        opts.branch = args[++i];
        break;
      case "--files":
        opts.mode = "files";
        opts.files = args[++i]?.split(/\s+/);
        break;
      case "--output":
      case "-o":
        opts.output = args[++i];
        break;
      case "--context":
        opts.context = args[++i];
        break;
      default:
        if (!args[i].startsWith("-")) {
          opts.context = args[i];
        }
    }
  }
  return opts;
}

// ── Collect diff ────────────────────────────────────────────────────────────
function getDiff(opts) {
  const execOpts = { cwd: PROJECT_ROOT, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 };

  let diff = "";
  try {
    switch (opts.mode) {
      case "staged":
        diff = execSync("git diff --staged", execOpts);
        break;
      case "branch":
        diff = execSync(`git diff ${opts.branch}...HEAD`, execOpts);
        break;
      case "files":
        diff = execSync(`git diff -- ${opts.files.join(" ")}`, execOpts);
        break;
      default:
        // All uncommitted (staged + unstaged)
        diff = execSync("git diff HEAD", execOpts);
        if (!diff.trim()) {
          // Maybe nothing committed yet, try diff of staged
          diff = execSync("git diff --staged", execOpts);
        }
        if (!diff.trim()) {
          diff = execSync("git diff", execOpts);
        }
    }
  } catch (e) {
    console.error("Git diff failed:", e.message);
    process.exit(1);
  }

  if (!diff.trim()) {
    console.log("No changes to review.");
    process.exit(0);
  }

  if (diff.length > MAX_DIFF_CHARS) {
    console.error(
      `WARNING: Diff truncated from ${diff.length} to ${MAX_DIFF_CHARS} chars`
    );
    diff = diff.slice(0, MAX_DIFF_CHARS) + "\n\n... [TRUNCATED — diff too large] ...";
  }

  return diff;
}

// ── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an independent code reviewer for the KAMANIN Client Portal.

## Portal Stack
- Frontend: React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Motion (v12)
- State: TanStack React Query (server) + React Context (UI)
- Backend: Supabase — PostgreSQL + RLS, Auth, Edge Functions (Deno), Realtime, Storage
- Integrations: ClickUp (webhooks + API via Edge Functions), Nextcloud (WebDAV), Mailjet
- All UI text in German

## Architecture Rules (non-negotiable)
- UI reads ONLY from cache tables (task_cache, comment_cache) — never ClickUp directly
- Edge Functions proxy ALL ClickUp calls — API token never in frontend
- RLS enforced on ALL tables — users see only their own data
- Top-level task_cache columns override raw_data
- mapStatus(task.status) for all status comparisons
- Components < 150 lines — extract logic to hooks
- ContentContainer width="narrow" on all app pages
- shadcn/ui for all new UI primitives
- Edge Functions: Deno runtime, response contract: { ok, code, message, correlationId }

## Portal-Specific Review Points
- raw_data vs top-level status fields (top-level MUST take priority)
- Webhook timing vs cache availability (race conditions)
- No ClickUp API token or Supabase service key in frontend
- RLS policies respected in all queries
- Status transitions follow STATUS_TRANSITION_MATRIX

## Your Task
Review the provided git diff. For each issue found:

**[BLOCKING/NON-BLOCKING/FOLLOW-UP] Title**
- File: path
- Problem: what's wrong
- Fix: how to fix

End with:
Summary: X blocking, Y non-blocking, Z follow-up
Verdict: APPROVE / REVISE

Be thorough but concise. Focus on bugs, security issues, architecture violations, and logic errors. Do not nitpick style unless it impacts readability significantly.`;

// ── Call OpenRouter ─────────────────────────────────────────────────────────
async function callOpenRouter(apiKey, diff, extraContext) {
  let userMessage = `## Code Review Request\n\nReview the following git diff:\n\n\`\`\`diff\n${diff}\n\`\`\``;

  if (extraContext) {
    userMessage = `## Additional Context\n${extraContext}\n\n${userMessage}`;
  }

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  console.error(`Sending to ${MODEL} via OpenRouter...`);
  console.error(`Diff size: ${diff.length} chars`);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://portal.kamanin.at",
      "X-Title": "KAMANIN Portal Code Review",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`OpenRouter API error (${res.status}): ${err}`);
    process.exit(1);
  }

  const data = await res.json();

  if (!data.choices?.[0]?.message?.content) {
    console.error("Unexpected API response:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const review = data.choices[0].message.content;
  const usage = data.usage;

  console.error(`\nTokens: ${usage?.prompt_tokens || "?"} in / ${usage?.completion_tokens || "?"} out`);
  console.error(`Cost: $${usage?.cost?.toFixed(6) || "?"}`);

  return review;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const apiKey = getApiKey();
  const diff = getDiff(opts);

  console.error(`\n🔍 OpenRouter Post-Code Review (${MODEL})`);
  console.error(`Mode: ${opts.mode}${opts.branch ? ` vs ${opts.branch}` : ""}`);
  console.error("─".repeat(50));

  const review = await callOpenRouter(apiKey, diff, opts.context);

  // Output review to stdout (or file)
  if (opts.output) {
    fs.writeFileSync(opts.output, review, "utf-8");
    console.error(`\nReview written to: ${opts.output}`);
  } else {
    console.log("\n" + review);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
