# Phase 9 — AI Deal Assistant: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat assistant that uses Groq tool-calling to read the user's own pipeline (deals, buyers, markets, follow-ups, buyer matches) and answer questions grounded in that data.

**Architecture:** Pure tool definitions + system prompt (`assistant.js`) feed a bounded agent loop (`runAssistant` in `ai-service.js`) that calls Groq, executes requested read-only tools via an injected executor, and loops to a final answer. The endpoint wires a DB-backed executor; a new chat page drives it. Groq client and executor are injected so tests never hit real AI.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, zod 4, groq-sdk, `node:test` + supertest. Frontend — React 18, Vite 5, TypeScript, vitest.

## Global Constraints

- Tools are **read-only** over the user's data; no tool writes or deletes. (Spec: Decisions.)
- Reuse the existing Groq integration (`ai-service.js`, model `llama-3.3-70b-versatile`), **disabled until `GROQ_API_KEY` is set** (returns the existing `NO_KEY_ERROR`). (Spec: Decisions.)
- The agent loop is bounded by `maxSteps` (default 5) so it cannot loop forever. (Spec: Decisions.)
- Backend is **stateless**: the frontend sends the message history each turn; the backend prepends the system message. (Spec: Decisions.)
- The Groq `client` and `executeTool` are **injected**; tests use a scripted fake client and never call real Groq. `backend/test-setup.js` also blanks `GROQ_API_KEY`. (Spec: Decisions / Testing.)
- The six tools are exactly: `get_pipeline_summary`, `list_deals`, `list_buyers`, `list_markets`, `list_followups`, `match_buyers_for_deal`. (Spec: Architecture.)
- Follow existing patterns: `createGroqClient`/`NO_KEY_ERROR` in `ai-service.js`; promisified `dbAll/dbGet`; `validateBody` + zod; typed client; `useAsync`/local state on pages.

---

### Task 1: Blank GROQ_API_KEY in test isolation

Extend the existing test preload so the suite never makes a real Groq call.

**Files:**
- Modify: `backend/test-setup.js`

**Interfaces:** none (test infra only).

- [ ] **Step 1: Add the line**

In `backend/test-setup.js`, add `GROQ_API_KEY` to the blanked vars:

```js
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
process.env.GROQ_API_KEY = '';
```

- [ ] **Step 2: Confirm the suite still passes**

Run: `cd backend && npm test`
Expected: all pass (87) — the existing ai-service tests already inject a fake client and don't depend on the real key.

- [ ] **Step 3: Commit**

```bash
git add backend/test-setup.js
git commit -m "test: blank GROQ_API_KEY in test preload (no real AI calls)"
```

---

### Task 2: Pure assistant module (system prompt, tool definitions, buildMessages)

The pure pieces: the system prompt, the tool schemas the model sees, and the message assembler.

**Files:**
- Create: `backend/src/assistant.js`
- Test: `backend/src/assistant.test.js`

**Interfaces:**
- Produces:
  - `SYSTEM_PROMPT` (string).
  - `TOOL_DEFINITIONS` — array of `{ type:'function', function:{ name, description, parameters } }` for the six tools.
  - `buildMessages(history) → [{ role:'system', content: SYSTEM_PROMPT }, ...history]`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/assistant.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS, buildMessages } from './assistant.js';

test('TOOL_DEFINITIONS lists the six read-only tools', () => {
  const names = TOOL_DEFINITIONS.map((t) => t.function.name).sort();
  assert.deepEqual(names, [
    'get_pipeline_summary', 'list_buyers', 'list_deals', 'list_followups', 'list_markets', 'match_buyers_for_deal',
  ]);
});

test('match_buyers_for_deal declares a deal_id parameter', () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'match_buyers_for_deal');
  assert.ok(tool.function.parameters.properties.deal_id, 'deal_id param present');
  assert.deepEqual(tool.function.parameters.required, ['deal_id']);
});

test('buildMessages prepends the system prompt and keeps history', () => {
  const history = [{ role: 'user', content: 'hi' }];
  const msgs = buildMessages(history);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[0].content, SYSTEM_PROMPT);
  assert.deepEqual(msgs[1], { role: 'user', content: 'hi' });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --test src/assistant.test.js`
Expected: FAIL — `Cannot find module './assistant.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/assistant.js`:

```js
export const SYSTEM_PROMPT = [
  'You are an assistant inside a real-estate wholesaling app.',
  'Answer questions about the user\'s own pipeline by calling the provided tools to read their data.',
  'Always base answers on tool results. If the tools do not contain the answer, say you do not have that data.',
  'Be concise and specific. Do not give legal or financial advice beyond the numbers in the data.',
].join(' ');

function tool(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  };
}

export const TOOL_DEFINITIONS = [
  tool('get_pipeline_summary', 'Totals across the pipeline: deal counts by status, pipeline value, projected profit, average ROI, matched-deal count, and lead counts.'),
  tool('list_deals', 'List saved deals with id, name, city, state, deal_type, purchase_price, arv, profit, roi, and status.'),
  tool('list_buyers', 'List cash buyers with id, name, preferred_areas, cash_available, deal_types, and avg_deal_size.'),
  tool('list_markets', 'List markets with city, state, heat_score, and trend.'),
  tool('list_followups', 'List sellers due for follow-up today or earlier (name and next_follow_up date).'),
  tool(
    'match_buyers_for_deal',
    'Rank the cash buyers that best fit a specific saved deal by area, price, and deal type.',
    { deal_id: { type: 'string', description: 'The id of the deal to match buyers against.' } },
    ['deal_id'],
  ),
];

export function buildMessages(history) {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && node --test src/assistant.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/assistant.js backend/src/assistant.test.js
git commit -m "feat(assistant): system prompt, tool definitions, message builder"
```

---

### Task 3: The Groq agent loop (`runAssistant`)

The bounded tool-calling loop, injectable for tests.

**Files:**
- Modify: `backend/src/ai-service.js` (add `runAssistant`)
- Test: `backend/src/ai-service.test.js` (extend)

**Interfaces:**
- Consumes: `createGroqClient`, `MODEL`, `NO_KEY_ERROR` (already in `ai-service.js`).
- Produces: `runAssistant(messages, { client, tools, executeTool, maxSteps }) → Promise<{ success:true, reply } | { success:false, error }>`. Defaults: `client = createGroqClient()`, `maxSteps = 5`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/ai-service.test.js`:

```js
import { runAssistant } from './ai-service.js';

// A fake Groq client whose chat.completions.create returns scripted turns.
function scriptedClient(turns) {
  let i = 0;
  return { chat: { completions: { create: async () => ({ choices: [{ message: turns[i++] }] }) } } };
}

test('runAssistant returns not-configured when there is no client', async () => {
  const r = await runAssistant([{ role: 'user', content: 'hi' }], { client: null, tools: [], executeTool: async () => ({}) });
  assert.equal(r.success, false);
  assert.match(r.error, /GROQ_API_KEY/);
});

test('runAssistant executes a requested tool then returns the final reply', async () => {
  const turns = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', function: { name: 'list_deals', arguments: '{}' } }] },
    { role: 'assistant', content: 'You have 2 deals.' },
  ];
  const calls = [];
  const executeTool = async (name) => { calls.push(name); return [{ id: 'd1' }, { id: 'd2' }]; };
  const r = await runAssistant([{ role: 'user', content: 'how many deals?' }], {
    client: scriptedClient(turns), tools: [], executeTool,
  });
  assert.equal(r.success, true);
  assert.equal(r.reply, 'You have 2 deals.');
  assert.deepEqual(calls, ['list_deals']);
});

test('runAssistant stops at maxSteps when the model never finishes', async () => {
  const loopTurn = { role: 'assistant', content: null, tool_calls: [{ id: 'tc', function: { name: 'list_deals', arguments: '{}' } }] };
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: loopTurn }] }) } } };
  const r = await runAssistant([{ role: 'user', content: 'loop' }], {
    client, tools: [], executeTool: async () => ([]), maxSteps: 3,
  });
  assert.equal(r.success, true);
  assert.match(r.reply, /narrow/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --test src/ai-service.test.js`
Expected: FAIL — `runAssistant` is not exported.

- [ ] **Step 3: Add `runAssistant` to `ai-service.js`**

Append to `backend/src/ai-service.js`:

```js
export async function runAssistant(
  messages,
  { client = createGroqClient(), tools = [], executeTool, maxSteps = 5 } = {},
) {
  if (!client) return { success: false, error: NO_KEY_ERROR };
  const convo = [...messages];
  try {
    for (let step = 0; step < maxSteps; step++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 800,
        tools,
        tool_choice: 'auto',
        messages: convo,
      });
      const msg = completion.choices[0].message;
      convo.push(msg);
      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        return { success: true, reply: msg.content || '' };
      }
      for (const tc of toolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const result = await executeTool(tc.function.name, args);
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    return { success: true, reply: "I couldn't finish that — try narrowing the question." };
  } catch (error) {
    console.error('Assistant error:', error.message);
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && node --test src/ai-service.test.js`
Expected: PASS — the three new tests plus the existing ai-service tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai-service.js backend/src/ai-service.test.js
git commit -m "feat(assistant): bounded Groq tool-calling agent loop"
```

---

### Task 4: Endpoint + tool executor

The DB-backed tool executor and the `POST /api/assistant` endpoint.

**Files:**
- Modify: `backend/src/schemas.js` (`assistantSchema`)
- Modify: `backend/src/server.js` (imports, executor, endpoint)
- Test: `backend/src/assistant.routes.test.js`

**Interfaces:**
- Consumes: `buildMessages`, `TOOL_DEFINITIONS` (`./assistant.js`); `runAssistant` (`./ai-service.js`); `assistantSchema` (`./schemas.js`); `matchBuyers` (`./analytics.js`); `summarizeDeals`, `matchedDealCount`, `leadFunnel` (`./insights.js`); `dueSellers` (`./outreach.js`); `dbAll/dbGet`, `validateBody`, `asyncHandler`.
- Produces (HTTP): `POST /api/assistant` (body `assistantSchema`) → `{ success, reply } | { success:false, error }`.

- [ ] **Step 1: Add the schema**

Append to `backend/src/schemas.js`:

```js
export const assistantSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).min(1).max(50),
});
```

- [ ] **Step 2: Add imports to `server.js`**

Below the existing `import { parseResendEvent, ... } from './analytics-events.js';` line, add:

```js
import { SYSTEM_PROMPT, TOOL_DEFINITIONS, buildMessages } from './assistant.js';
```

Add `runAssistant` to the existing `from './ai-service.js'` import (currently `import { analyzeDealWithAI, scoreSeller } from './ai-service.js';` → add `runAssistant`). Add `assistantSchema` to the existing `from './schemas.js'` import list. (`summarizeDeals`, `matchedDealCount`, `leadFunnel`, `dueSellers`, `matchBuyers` are already imported.)

- [ ] **Step 3: Add the executor and endpoint**

In `backend/src/server.js`, immediately before `app.use(errorHandler);`, add:

```js
// ========== AI ASSISTANT ==========

async function executeAssistantTool(name, args) {
  switch (name) {
    case 'get_pipeline_summary': {
      const [deals, sellers, buyers] = await Promise.all([
        dbAll('SELECT * FROM deals'), dbAll('SELECT * FROM sellers'), dbAll('SELECT * FROM buyers'),
      ]);
      return { ...summarizeDeals(deals), matchedCount: matchedDealCount(deals, buyers), leads: leadFunnel(sellers, buyers) };
    }
    case 'list_deals':
      return await dbAll('SELECT id, name, city, state, deal_type, purchase_price, arv, profit, roi, status FROM deals ORDER BY created_at DESC LIMIT 50');
    case 'list_buyers':
      return await dbAll('SELECT id, name, preferred_areas, cash_available, deal_types, avg_deal_size FROM buyers LIMIT 100');
    case 'list_markets':
      return await dbAll('SELECT city, state, heat_score, trend FROM markets ORDER BY heat_score DESC');
    case 'list_followups': {
      const sellers = await dbAll('SELECT * FROM sellers');
      const today = new Date().toISOString().slice(0, 10);
      return dueSellers(sellers, today).map((s) => ({ name: s.name, next_follow_up: s.next_follow_up }));
    }
    case 'match_buyers_for_deal': {
      const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [args.deal_id]);
      if (!deal) return { error: 'Deal not found' };
      const buyers = await dbAll('SELECT * FROM buyers');
      return matchBuyers(deal, buyers).map((m) => ({ buyer: m.buyer.name, score: m.score, reasons: m.reasons }));
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

app.post('/api/assistant', validateBody(assistantSchema), asyncHandler(async (req, res) => {
  const messages = buildMessages(req.body.messages);
  const result = await runAssistant(messages, { tools: TOOL_DEFINITIONS, executeTool: executeAssistantTool });
  res.json(result);
}));
```

(`SYSTEM_PROMPT` is imported for symmetry with `buildMessages`/`TOOL_DEFINITIONS`; it is used inside `buildMessages`.)

- [ ] **Step 4: Write the failing integration test**

Create `backend/src/assistant.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/assistant returns not-configured without a Groq key', async () => {
  // GROQ_API_KEY is blanked by test-setup.js, so this never calls real Groq.
  const res = await request(app).post('/api/assistant').send({ messages: [{ role: 'user', content: 'summarize my pipeline' }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /GROQ_API_KEY/);
});

test('POST /api/assistant validates the messages array', async () => {
  const res = await request(app).post('/api/assistant').send({ messages: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && node --test src/assistant.routes.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 6: Run the full backend suite (twice)**

Run: `cd backend && npm test`
Expected: all pass (87 + Task 2: 3 + Task 3: 3 + this task: 2 = 95). Run again to confirm stability.

- [ ] **Step 7: Commit**

```bash
git add backend/src/schemas.js backend/src/server.js backend/src/assistant.routes.test.js
git commit -m "feat(assistant): /api/assistant endpoint + read-only tool executor"
```

---

### Task 5: Frontend types, client, and Assistant chat page

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Create: `src/pages/Assistant.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/AppLayout.tsx` (nav link)

**Interfaces:**
- Consumes: `askAssistant` from the client; `Loading`/`ErrorBanner`; types `AssistantMessage`, `AssistantReply`.
- Produces: `AssistantMessage`/`AssistantReply` types; `askAssistant(messages)`; `export function Assistant()`; a `/assistant` route + nav entry.

- [ ] **Step 1: Add types**

Append to `src/api/types.ts`:

```ts
export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  success: boolean;
  reply?: string;
  error?: string;
}
```

- [ ] **Step 2: Add the client function**

In `src/api/client.ts`, extend the type import to include `AssistantMessage` and `AssistantReply`, then append:

```ts
export const askAssistant = (messages: AssistantMessage[]) =>
  apiFetch<AssistantReply>('/api/assistant', jsonBody({ messages }));
```

- [ ] **Step 3: Create the Assistant page**

Create `src/pages/Assistant.tsx`:

```tsx
import { useState } from 'react';
import { askAssistant } from '../api/client';
import { Loading, ErrorBanner } from '../components/states';
import type { AssistantMessage } from '../api/types';

const SUGGESTIONS = [
  'Summarize my pipeline',
  'Which buyers fit my best deal?',
  "Who's due for follow-up?",
  'What are my hottest markets?',
];

export function Assistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    setError(null);
    const next: AssistantMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await askAssistant(next);
      if (res.success && res.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: res.reply as string }]);
      } else {
        setError(res.error || 'The assistant could not answer.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">AI</p>
        <h1>Deal Assistant</h1>
        <p>Ask about your deals, buyers, markets, and follow-ups. The assistant reads your live pipeline.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          {messages.length === 0 && (
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ghost-button" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="chat-thread">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-${m.role}`}>
                <p>{m.content}</p>
              </div>
            ))}
            {loading && <Loading label="Thinking…" />}
          </div>

          {error && <ErrorBanner message={error} />}

          <form
            className="chat-input"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <input
              placeholder="Ask about your pipeline…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" disabled={loading || !input.trim()}>Send</button>
          </form>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add the route in `App.tsx`**

Add the import alongside the other page imports:

```tsx
import { Assistant } from './pages/Assistant';
```

Add this route inside the `<Route element={<AppLayout />}>` block (e.g. after the `campaigns` route):

```tsx
        <Route path="assistant" element={<Assistant />} />
```

- [ ] **Step 5: Add the nav link in `AppLayout.tsx`**

In the `NAV` array in `src/components/AppLayout.tsx`, add an entry after the `Campaigns` entry:

```tsx
  { to: '/assistant', label: 'Assistant' },
```

- [ ] **Step 6: Add chat styles to `styles.css`**

Append to the end of `src/styles.css`:

```css
/* ---------- AI assistant chat ---------- */
.chat-suggestions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-3); }
.chat-thread { display: grid; gap: var(--space-2); margin-bottom: var(--space-3); }
.chat-bubble { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); max-width: 80%; }
.chat-bubble p { margin: 0; white-space: pre-wrap; }
.chat-user { background: var(--accent); color: #fff; justify-self: end; }
.chat-assistant { background: var(--surface-muted); border: 1px solid var(--line); justify-self: start; }
.chat-input { display: flex; gap: var(--space-2); }
.chat-input input { flex: 1; }
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 8: Manual click-through**

Start both servers. Open **Assistant**: confirm the suggestion chips render; click one (or type a question) → a "Thinking…" indicator shows, then — with no `GROQ_API_KEY` configured — an error banner reads the not-configured message. The user bubble for your question stays in the thread.

- [ ] **Step 9: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/pages/Assistant.tsx src/App.tsx src/components/AppLayout.tsx src/styles.css
git commit -m "feat(assistant): Assistant chat page + client + nav/route"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite (twice)**

Run: `cd backend && npm test`
Expected: all pass (95). Run again to confirm stability; confirm no test makes a real network call (Groq/email blanked by `test-setup.js`).

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: vitest 18 passing (unchanged; this phase's logic is backend-side).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running: open **Assistant**, send a question, and confirm the loading state and the not-configured error render (a real answer needs a `GROQ_API_KEY`). If a key is configured in `backend/.env`, confirm a real grounded answer comes back (e.g. "Summarize my pipeline" returns pipeline totals).

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| `GROQ_API_KEY` blanked in tests | Task 1 |
| `SYSTEM_PROMPT`, `TOOL_DEFINITIONS` (6 tools), `buildMessages` (pure) | Task 2 |
| Bounded agent loop `runAssistant` (tool exec, maxSteps, not-configured) | Task 3 |
| `assistantSchema`; read-only tool executor; `POST /api/assistant` | Task 4 |
| Frontend types + `askAssistant` + Assistant chat page + nav/route | Task 5 |
| Tests: pure tools, agent loop, endpoint (not-configured/validation) | Tasks 2, 3, 4, 6 |
| Read-only tools; disabled-until-configured; injectable for tests | Tasks 2 (defs), 3 (loop), 4 (executor) |

All spec sections map to tasks.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…". Every code step has full code; every test step has assertions. The note that real answers require a `GROQ_API_KEY` is a runtime configuration fact (stated in the spec), not a plan gap — the not-configured path is fully tested.

**3. Type consistency:** `TOOL_DEFINITIONS` tool names (Task 2) match the executor's `switch` cases (Task 4) and the test's expected names (Task 2). `runAssistant(messages, { client, tools, executeTool, maxSteps })` (Task 3) is called by the endpoint with `{ tools: TOOL_DEFINITIONS, executeTool: executeAssistantTool }` (Task 4) and tested with injected fakes (Task 3). `buildMessages(history)` (Task 2) is used by the endpoint (Task 4). `assistantSchema`'s `{ messages: [{ role, content }] }` (Task 4) matches the frontend `AssistantMessage` (Task 5) and `askAssistant` body (Task 5). `AssistantReply { success, reply?, error? }` (Task 5) mirrors `runAssistant`'s return shape (Task 3) and the endpoint response (Task 4). The executor reuses already-imported `summarizeDeals`/`matchedDealCount`/`leadFunnel`/`dueSellers`/`matchBuyers` with their existing signatures.
