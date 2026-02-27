# GauntletAI — Finance Agent on Ghostfolio

This folder holds **planning, documentation, and evaluation assets** for the GauntletAI production agent project on the **Ghostfolio** (finance) codebase.

## Contents

| File | Purpose |
|------|---------|
| **PROJECT_OVERVIEW.md** | Full project brief: deadlines, MVP, architecture, tools, eval, observability, verification, costs, submission |
| **PRE_SEARCH.md** | Pre-search phase checklist and architecture/plan decisions |
| **ARCHITECTURE.md** | (Final) 1–2 page agent architecture document |
| **COST_ANALYSIS.md** | Dev spend + production cost projections |
| **EVAL_DATASET.md** | Eval test case index and pass/fail criteria |
| **eval/** | 50+ test cases (happy path, edge, adversarial, multi-step) |

## Domain & Repo

- **Domain:** Finance  
- **Repository:** [Ghostfolio](https://github.com/ghostfolio/ghostfolio) (portfolio tracking, open source)  
- **Existing AI:** `apps/api/src/app/endpoints/ai/` — prompt-based portfolio analysis via OpenRouter; no tools or multi-turn yet.

## Configuration (OpenRouter)

The agent uses **OpenRouter** for the LLM. Configuration is read **first from environment variables** (`.env`), then from the **property store** (database) if not set in env.

- **You must set:** `API_KEY_OPENROUTER` — your [OpenRouter](https://openrouter.ai/) API key.
- **Optional:** `OPENROUTER_MODEL` — model id (e.g. `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`). If unset, the agent defaults to `openai/gpt-4o`. The model **must support tool/function calling** for the agent to use portfolio tools.

**Option 1 — .env (recommended):** In the project root, copy `.env.example` to `.env` (or use `.env.dev`), then set:

```
API_KEY_OPENROUTER=sk-or-v1-your-key-here
OPENROUTER_MODEL=openai/gpt-4o
```

**Option 2 — Property store:** Set via the admin API or the `Property` table (keys `API_KEY_OPENROUTER`, `OPENROUTER_MODEL`). Env values take precedence over the property store.

## Quick Start

1. Read **PROJECT_OVERVIEW.md** for full requirements and timeline.
2. Complete **PRE_SEARCH.md** (Phase 1–3) within 2 hours of receiving the project.
3. Follow the build strategy: basic agent → tools → multi-step → observability → eval → verification → open source.

## Submission (Sunday 10:59 PM CT)

- GitHub repo with setup guide and deployed link  
- Demo video (3–5 min)  
- Pre-Search document, Architecture doc, Cost analysis, Eval dataset  
- Open source contribution link  
- Social post tagging @GauntletAI  

See **PROJECT_OVERVIEW.md** for the complete submission checklist.
