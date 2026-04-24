#!/usr/bin/env node
// One-shot review: reads a prepared diff file and sends to OpenRouter with portal context.
const fs = require('fs');
const path = require('path');

const patchPath = process.argv[2];
const contextArg = process.argv[3] ?? '';
if (!patchPath) { console.error('usage: review-patch.cjs <patchFile> [context]'); process.exit(1); }

const envPath = path.join(__dirname, '..', '.env.local');
const apiKey = process.env.OPENROUTER_API_KEY
  ?? (fs.existsSync(envPath) && (fs.readFileSync(envPath, 'utf-8').match(/^OPENROUTER_API_KEY=(.+)$/m) ?? [])[1]?.trim());
if (!apiKey) { console.error('OPENROUTER_API_KEY missing'); process.exit(1); }

const diff = fs.readFileSync(patchPath, 'utf-8');
const MODEL = process.env.REVIEW_MODEL || 'openai/gpt-5.4-mini';

const SYSTEM_PROMPT = `You are an independent code reviewer for the KAMANIN Client Portal.

Stack: React 19 + TS, Vite, Tailwind v4, shadcn/ui, Motion v12, React Query, Supabase, Radix.

This is a UI scroll refactor — not a data/Edge-Function change. Focus on:
- flex/overflow layout correctness inside Radix Dialog-based sheets
- mobile keyboard safety (sheet height, sticky vs flex footer, env(keyboard-inset-height))
- React Query / Realtime subscription correctness
- backward-compat wrappers (don't break external callers)
- test coverage of new invariants

For each issue:
**[BLOCKING/NON-BLOCKING/FOLLOW-UP] Title**
- File: path
- Problem: …
- Fix: …

End with:
Summary: X blocking, Y non-blocking, Z follow-up
Verdict: APPROVE / REVISE

Be thorough but focused on this refactor. Ignore unrelated repo noise.`;

const userMessage = `## Context\n${contextArg}\n\n## Diff (scoped to refactor commits only)\n\`\`\`diff\n${diff}\n\`\`\``;

(async () => {
  console.log(`Diff size: ${diff.length} chars`);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('API error:', data); process.exit(1); }
  console.log('\n' + data.choices[0].message.content);
  console.log(`\nTokens: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out`);
})();
