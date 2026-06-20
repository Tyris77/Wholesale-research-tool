# Wholesale Research Tool — Phase 9: AI Deal Assistant (Design)

**Date:** 2026-06-20
**Status:** Approved — ready for implementation planning

## Context

The platform already integrates Groq AI for one-off deal analysis and seller scoring
(`ai-service.js`), and exposes rich pipeline data (deals, buyers, sellers, markets,
matching, insights). But there is no conversational way to *ask questions about your own
data* — "which buyers fit my Atlanta flip?", "summarize my pipeline", "who's due for
follow-up?". Phase 9 adds an AI assistant that answers those by **calling read-only tools**
over the live data.

## Goal

A chat assistant that uses Groq tool/function calling to query the user's own pipeline
(deals, buyers, markets, follow-ups, buyer matches) and compose grounded answers.

## Decisions

- **Tool-calling, read-only.** The model is given function schemas it may call; the
  backend executes them against the DB and feeds results back. No tool can write or
  delete data.
- **Reuse the existing Groq integration** (`ai-service.js`, `llama-3.3-70b-versatile`),
  **disabled until `GROQ_API_KEY` is set** (clean "AI not configured" state, like the
  other integrations).
- **Bounded agent loop** with a `maxSteps` cap so a misbehaving model can't loop forever.
- **Stateless backend.** The frontend holds the conversation and sends the message history
  each turn; the backend adds a system message and runs the loop.
- **Injectable for tests.** The Groq `client` and the `executeTool` function are injected,
  so the agent loop is tested with a scripted fake model and never calls real Groq. The
  test preload also blanks `GROQ_API_KEY` as a second safety net.

## Architecture

### Backend

**Pure module** `backend/src/assistant.js`:
- `SYSTEM_PROMPT` — instructs the model: you are a wholesale real-estate assistant; use
  the provided tools to read the user's pipeline; answer concisely from tool results; if
  the data doesn't cover a question, say so; do not give legal/financial advice beyond the
  numbers.
- `TOOL_DEFINITIONS` — array of Groq/OpenAI-style function schemas:
  - `get_pipeline_summary` (no args) — totals, by-status, matched count, lead counts.
  - `list_deals` (no args) — id, name, city, state, deal_type, purchase_price, arv, profit, roi, status.
  - `list_buyers` (no args) — id, name, preferred_areas, cash_available, deal_types, avg_deal_size.
  - `list_markets` (no args) — city, state, heat_score, trend.
  - `list_followups` (no args) — sellers due for follow-up (name, next_follow_up).
  - `match_buyers_for_deal` (`{ deal_id: string }`) — ranked buyer matches (via the real `matchBuyers`).
- `buildMessages(history) → [{ role:'system', content: SYSTEM_PROMPT }, ...history]` (pure).

**Agent loop** in `backend/src/ai-service.js`:
- `runAssistant(messages, { client = createGroqClient(), tools, executeTool, maxSteps = 5 })`
  → `{ success: true, reply }` or `{ success: false, error }`.
  - If `client` is null → `{ success:false, error: NO_KEY_ERROR }`.
  - Loop up to `maxSteps`: call `client.chat.completions.create({ model, messages: convo,
    tools, tool_choice: 'auto', max_tokens: 800 })`; push the assistant message; if it has
    no `tool_calls`, return its `content` as `reply`; otherwise execute each tool call via
    `executeTool(name, JSON.parse(arguments || '{}'))`, push a `{ role:'tool',
    tool_call_id, content: JSON.stringify(result) }` message, and continue.
  - On exception → `{ success:false, error }`. If `maxSteps` is exhausted → `{ success:true,
    reply: "I couldn't finish that — try narrowing the question." }`.

**Tool executor** (in `backend/src/server.js`): `executeTool(name, args)` dispatches each
tool to existing DB queries / `matchBuyers` / insights functions (`summarizeDeals`,
`matchedDealCount`, `leadFunnel`, `dueSellers`). Unknown tool → `{ error }`.

**Schema** (`backend/src/schemas.js`): `assistantSchema = z.object({ messages:
z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().min(1) })).min(1).max(50) })`.

**Endpoint** `POST /api/assistant` (body `assistantSchema`) → `buildMessages(req.body.messages)`
→ `runAssistant(messages, { tools: TOOL_DEFINITIONS, executeTool })` → returns the result.

### Frontend

**Types** (`src/api/types.ts`): `AssistantMessage { role: 'user' | 'assistant'; content: string }`;
`AssistantReply { success: boolean; reply?: string; error?: string }`.

**Client** (`src/api/client.ts`): `askAssistant(messages: AssistantMessage[]) →
Promise<AssistantReply>` (POST `/api/assistant`).

**Assistant page** (`src/pages/Assistant.tsx`, route `/assistant`, nav entry): a chat
thread of you/assistant bubbles, a text input + Send, suggested-prompt chips
("Summarize my pipeline", "Which buyers fit my best deal?", "Who's due for follow-up?"),
a loading indicator while awaiting a reply, and a graceful "AI not configured" / error
message. The page holds the message array in state and sends the full history each turn.

## Data flow

User types a question → frontend appends it and POSTs the history → backend adds the system
prompt → Groq decides to call tools → backend executes them over the DB and returns results
→ Groq composes a final answer → `{ reply }` → frontend appends the assistant bubble.

## Error handling

- No `GROQ_API_KEY` → `runAssistant` returns `{ success:false, error }`; the UI shows
  "AI is not configured (set GROQ_API_KEY)".
- A tool that references a missing record (e.g. unknown `deal_id`) returns `{ error }` as
  its result; the model is told and can respond accordingly — the loop does not crash.
- Groq/network errors are caught and returned as `{ success:false, error }`; the UI shows
  the message and keeps the conversation.
- Endpoint validation failure → `400` with details; the typed client throws `ApiError`.

## Testing

- **Pure unit** (`backend/src/assistant.test.js`): `TOOL_DEFINITIONS` includes the six
  expected tool names; `buildMessages` prepends a `system` message and preserves history.
- **Agent loop** (`backend/src/ai-service.test.js`, extend): with a scripted fake `client`
  (turn 1 returns a `tool_calls` request for `list_deals`; turn 2 returns final content) and
  a fake `executeTool`, `runAssistant` returns the final `reply`, and `executeTool` was
  invoked with `list_deals`; a null `client` returns the not-configured error; a fake
  `client` that always returns `tool_calls` stops at `maxSteps` (no infinite loop).
- **Endpoint integration** (`backend/src/assistant.routes.test.js`, supertest, `GROQ_API_KEY`
  blanked by `test-setup.js`): `POST /api/assistant` with valid messages returns `200
  { success:false, error }` (not configured — never calls real Groq); empty `messages`
  returns `400`.
- **Test isolation:** `backend/test-setup.js` also blanks `GROQ_API_KEY` so no test makes a
  real AI call even if a key is later configured.
- **Frontend build + click-through:** `npm run build`; open `/assistant`, send a prompt, and
  confirm the loading state and the "AI not configured" message render (a real answer needs
  a `GROQ_API_KEY`).

## Out of scope (YAGNI)

Write-capable tools (read-only only), server-side conversation persistence, streaming
responses, embeddings/RAG, multi-provider support, and voice input.
