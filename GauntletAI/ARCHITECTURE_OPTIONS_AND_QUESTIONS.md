# GauntletAI MVP — Architecture Options & Decision Questions

**Purpose:** Propose architecture options and ask you to choose tech/approach where multiple options exist, so we can lock an MVP architecture plan.

---

## 1. High-Level Architecture Options

Three ways to structure the agent within Ghostfolio:

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Extend existing AI module** | Add agent + tools inside `apps/api/src/app/endpoints/ai/` (same AiController, new routes or same route with “agent mode”). | Single codebase, reuse AiService/OpenRouter, fastest to wire. | AI module gets larger; mixes “prompt-only” and “agent with tools” in one place. |
| **B. New GauntletAI module in API** | New module e.g. `apps/api/src/app/gauntlet-agent/` with its own controller, services, tool registry. Calls existing PortfolioService, OrderService, AccountService. | Clear separation, easy to document and test; aligns with PROJECT_OVERVIEW §17. | Slightly more setup (new module, routing). |
| **C. Separate agent service (e.g. Node or Python)** | Standalone service (separate process/repo) that Ghostfolio API calls via HTTP. Agent service calls back to Ghostfolio API for data. | Maximum flexibility (e.g. Python + LangChain); can scale independently. | More infra (two deploys), auth propagation (token or API key), network latency; PRD prefers Node/NestJS. |

**Recommendation for MVP:** **Option B** — New GauntletAI module in the API. Keeps everything in one deploy, uses existing auth and services, and matches the overview. Option A is acceptable if you want the absolute minimum new structure.

**Question 1 — Module placement**  
Which do you want?  
- **A** — Extend existing `endpoints/ai`  
- **B** — New `gauntlet-agent` (or similar) module  
- **C** — Separate agent service (if so, Node or Python?)

---

## 2. Agent Framework

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **LangChain.js** | Use LangChain for agent, tools, and (optionally) memory. | Mature, good tool/LLM abstraction, message history support. | Extra dependency; need to align with NestJS DI. |
| **Vercel AI SDK (current stack)** | You already use `ai` + `@openrouter/ai-sdk-provider` in AiService. Extend with `generateText` tool-calling (e.g. OpenRouter function calling). | No new framework; consistent with existing code. | You build orchestrator loop and tool registry yourself; less “agent in a box.” |
| **Custom minimal** | Thin layer: HTTP handler → LLM with tool schemas → execute tool by name → inject result → LLM again → response. | Full control, minimal deps, easy to reason about. | More code for history, retries, and multi-step. |
| **LangGraph (JS)** | State-machine style agent (nodes for “reason”, “tool”, “respond”). | Good for multi-step and cycles; can add later. | Heavier for MVP; may be overkill for “single shot + tools.” |

**Recommendation for MVP:** **Vercel AI SDK** (extend current stack) or **LangChain.js** — SDK keeps the stack consistent; LangChain gives faster agent/tool/memory wiring.

**Question 2 — Agent framework**  
Which do you prefer?  
- **Vercel AI SDK** (extend existing `generateText` + OpenRouter, add tools and a simple loop)  
- **LangChain.js** (agent + tools + memory)  
- **Custom minimal** (no framework, hand-rolled loop)  
- **LangGraph** (if you already know you want state-machine flows)

---

## 3. LLM & Tool Calling

- **Provider:** PRD/overview assume **OpenRouter**; existing AiService already uses it. Keeping OpenRouter is the path of least resistance.
- **Model:** Must support **tool/function calling** (e.g. `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`). Current `PROPERTY_OPENROUTER_MODEL` may or may not support tools.

**Question 3 — Model**  
- Keep **current OpenRouter model** and only ensure it supports tool calling, or  
- **Switch to a specific model** for the agent (e.g. `openai/gpt-4o-mini` for cost/speed)? If so, which one?

---

## 4. Conversation History (Multi-Turn)

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **In-memory (per process)** | Store messages in a Map keyed by session ID (e.g. JWT sub or generated session id). | No extra infra, trivial to implement. | Lost on restart; not shared across instances (ok for single-instance MVP deploy). |
| **Redis** | Store conversation history in Redis (Ghostfolio already has Redis). | Survives restarts, can support multiple API instances. | Slight complexity; TTL and key design. |
| **PostgreSQL** | New table e.g. `agent_conversations` / `agent_messages`. | Durable, queryable, same DB as rest of app. | Schema + migrations; may be overkill for MVP. |

**Recommendation for MVP:** **In-memory** or **Redis**. In-memory is fastest to ship; Redis is better if you plan to deploy with more than one instance or want persistence across restarts.

**Question 4 — Conversation history**  
- **In-memory** (session id → messages in Map)  
- **Redis** (session id → list of messages, with TTL)  
- **PostgreSQL** (full persistence)

---

## 5. First 3 Tools (MVP Minimum)

From AGENT_OBJECTIVE_AND_TOOLS.md, the suggested MVP set is:

1. **portfolio_details** (or portfolio_analysis) — `PortfolioService.getDetails()` → allocation, summary.  
2. **portfolio_performance** — `PortfolioService.getPerformance()` → time series, metrics.  
3. **activities_list** — `OrderService.getOrders()` → recent transactions.

All three map to existing Ghostfolio services already used or importable in the AI module.

**Question 5 — Tools**  
- Stick with these **exact three** for MVP, or  
- **Swap one** (e.g. add **market_quote** or **cash_balance** instead of one above)? If swap, which in / which out?

---

## 6. Domain Verification (At Least One)

PRD requires at least one of: fact-check, disclaimer, no buy/sell advice, confidence flag, or output schema validation.

| Option | Implementation idea |
|--------|----------------------|
| **Disclaimer injection** | Append a short disclaimer to every agent response (e.g. “This is informational only; not investment advice.”). Easiest. |
| **No buy/sell advice** | Post-process LLM output (or system prompt + validation): detect phrases like “you should buy/sell” and either strip or rephrase. |
| **Fact-check against data** | Compare key numbers mentioned in the reply to tool results; flag or correct mismatches. More work. |
| **Confidence flag** | Ask LLM to output a confidence tag; surface it in the API/UI. |

**Recommendation for MVP:** **Disclaimer injection** and/or **no buy/sell advice** (system prompt + simple keyword check). Fast and satisfies the gate.

**Question 6 — Verification**  
Which one(s) do you want for MVP?  
- **Disclaimer only**  
- **No buy/sell advice** (prompt + optional light check)  
- **Fact-check against tool data**  
- **Confidence flag**  
- **Combination** (e.g. disclaimer + no buy/sell)

---

## 7. Chat Interface (Publicly Accessible)

MVP requires a public URL where a reviewer can send a message and get an agent response.

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **Extend Angular client** | Add an “Agent” or “Chat” page in `apps/client/`, calling new agent API. | Single app, uses existing auth and UI. | Requires Angular work and build. |
| **Minimal standalone chat UI** | Small HTML/JS page or a tiny React/Next app that calls the agent API (could be served by API or separate). | Fast to build, can deploy with API (e.g. static route). | Separate from main client; may need token handling for auth. |
| **API-only + docs** | No UI; document `POST /api/v1/gauntlet-agent/chat` (or similar) and provide e.g. a curl/Postman example or a one-liner HTML form. | Fastest; some gates allow “API with docs.” | Less impressive for demo; reviewer must use Postman/curl. |

**Recommendation for MVP:** **Minimal standalone chat UI** (e.g. single page with fetch to agent endpoint) or **extend Angular** if you prefer everything inside the main app. Confirm with gate rules whether “API with docs” is acceptable.

**Question 7 — Chat interface**  
- **Extend Angular** (new page in existing client)  
- **Minimal standalone** (simple HTML/JS or small React app)  
- **API-only** with clear docs and example request/response

---

## 8. Deployment

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **Railway** | Deploy Ghostfolio (API + client or API only) on Railway. | Simple, good for full-stack or API. | You manage env (OpenRouter key, DB URL, etc.). |
| **Vercel** | Frontend on Vercel; API could be serverless or separate. | Great for static/Next; less natural for long-running NestJS. | NestJS often deployed elsewhere; possible with custom server. |
| **Other (Render, Fly, etc.)** | Deploy API (and optionally UI) on another provider. | Flexibility. | Same as Railway in spirit. |

**Recommendation for MVP:** **Railway** (or similar) for the existing Ghostfolio API + optional minimal chat UI, so one deploy gives a public URL. If you already use Vercel for something else, we can align to that.

**Question 8 — Deployment**  
- **Railway**  
- **Vercel** (and how: API on Vercel or only frontend?)  
- **Other** — which provider?

---

## 9. Simple Evaluation (5+ Test Cases)

MVP needs ≥5 test cases with expected outcomes and pass/fail criteria. Two implementation approaches:

| Option | Description |
|--------|-------------|
| **Script (Node/ts)** | e.g. `GauntletAI/eval/run-mvp-eval.ts` — calls agent API with fixed queries, asserts on status, tool calls (if exposed), and key phrases in response. |
| **Manual runbook** | `EVAL_DATASET.md` (or similar) with steps and expected results; someone runs and checks. |

**Recommendation for MVP:** **Script** (Node/ts) that can be run with `npx ts-node` or via an npm script, plus a short note in `EVAL_DATASET.md` listing the 5+ cases and pass criteria.

**Question 9 — Eval execution**  
- **Automated script** (Node/ts)  
- **Manual runbook** only  
- **Both** (script + runbook for reviewers)

---

## 10. Summary: What We Need From You

To produce a single **MVP architecture plan** (e.g. in `GauntletAI/ARCHITECTURE_MVP.md`), please answer:

1. **Module placement:** A (extend AI), B (new GauntletAI module), or C (separate service)?  
2. **Agent framework:** Vercel AI SDK, LangChain.js, custom minimal, or LangGraph?  
3. **Model:** Keep current OpenRouter model (with tool support) or fix a specific model?  
4. **Conversation history:** In-memory, Redis, or PostgreSQL?  
5. **Tools:** Keep portfolio_details + portfolio_performance + activities_list, or swap one?  
6. **Verification:** Disclaimer, no buy/sell, fact-check, confidence, or combination?  
7. **Chat interface:** Extend Angular, minimal standalone, or API-only with docs?  
8. **Deployment:** Railway, Vercel, or other?  
9. **Eval:** Automated script, manual runbook, or both?

Once you answer these, the next step is to write **GauntletAI/ARCHITECTURE_MVP.md** with:

- Chosen options and one-paragraph rationale where useful.  
- Diagram (text/ASCII or Mermaid) of request flow: Client → API → Agent → Tools → Ghostfolio services.  
- Folder/file layout for the agent, tools, and eval.  
- Ordered implementation checklist (e.g. 1) Agent endpoint + 1 tool, 2) All 3 tools, 3) History, 4) Verification, 5) Eval, 6) Deploy + UI) so you can execute the MVP step by step.
