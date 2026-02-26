# GauntletAI — Production Agent Framework for Ghostfolio (Finance Domain)

**Domain:** Finance  
**Base Repository:** [Ghostfolio](https://github.com/ghostfolio/ghostfolio)  
**Gate:** Project completion + interviews required for Austin admission.

---

## 1. Project Background

AI agents are moving from demos to production. In **finance**, agents must comply with regulations, avoid unsupported claims, and provide useful advice. The gap between a working prototype and a production agent includes: evaluation frameworks, verification systems, observability, error handling, and systematic testing. This project builds a **domain-specific agentic framework** on the open-source Ghostfolio portfolio tracker.

---

## 2. Sprint Timeline & Checkpoints

| Checkpoint       | Deadline              | Focus                          |
|------------------|-----------------------|---------------------------------|
| **Pre-Search**   | 2 hours after receive  | Architecture, plan              |
| **MVP**          | Tuesday (24 hours)     | Basic agent with tool use       |
| **Early Submission** | Friday (4 days)  | Eval framework + observability  |
| **Final**        | Sunday (7 days)        | Production-ready + open source  |

---

## 3. MVP Requirements (24 Hours) — Hard Gate

All items required to pass:

- [ ] Agent responds to natural language queries in the **finance** domain
- [ ] **At least 3 functional tools** the agent can invoke
- [ ] Tool calls execute successfully and return **structured results**
- [ ] Agent **synthesizes** tool results into coherent responses
- [ ] **Conversation history** maintained across turns
- [ ] **Basic error handling** (graceful failure, no crashes)
- [ ] **At least one domain-specific verification check**
- [ ] **Simple evaluation:** 5+ test cases with expected outcomes
- [ ] **Deployed and publicly accessible**

*Principle: A simple agent with reliable tool execution beats a complex agent that hallucinates or fails unpredictably.*

---

## 4. Core Agent Architecture

### 4.1 Agent Components

| Component           | Requirements                                              |
|--------------------|------------------------------------------------------------|
| **Reasoning Engine** | LLM with structured output, chain-of-thought capability   |
| **Tool Registry**    | Defined tools with schemas, descriptions, execution logic |
| **Memory System**    | Conversation history, context management, state persistence |
| **Orchestrator**     | Decides when to use tools, handles multi-step reasoning   |
| **Verification Layer** | Domain-specific checks before returning responses       |
| **Output Formatter** | Structured responses with citations and confidence        |

### 4.2 Ghostfolio Context

- **Existing stack:** NestJS API, Angular client, Prisma, PostgreSQL, Redis.
- **Existing AI:** `apps/api/src/app/endpoints/ai/` — `AiService` uses OpenRouter to generate portfolio analysis from a pre-built prompt (holdings table). No tools, no multi-turn, no verification.
- **Integration point:** Extend or add new agent endpoints under a dedicated **GauntletAI** module that uses the existing `PortfolioService`, `AccountService`, data providers, and auth.

---

## 5. Required Tools (Minimum 5) — Finance / Ghostfolio

Build **domain-appropriate** tools. Below are finance examples; implement using Ghostfolio’s existing services where possible.

| Tool | Description | Ghostfolio Hooks |
|------|-------------|------------------|
| **portfolio_analysis** | `portfolio_analysis(account_id?)` → holdings, allocation, performance | `PortfolioService.getDetails()`, calculator services |
| **transaction_categorize** | `transaction_categorize(transactions[])` → categories, patterns | Activities, tags, order types |
| **tax_estimate** | `tax_estimate(income, deductions)` → estimated liability | Can use rules or external; document assumptions |
| **compliance_check** | `compliance_check(transaction, regulations[])` → violations, warnings | Custom rules; e.g. wash sale, concentration limits |
| **market_data** | `market_data(symbols[], metrics[])` → current data | Data provider services, symbol service |

*Identify the best opportunities by exploring the repo (e.g. `PortfolioService`, `AccountService`, data providers, benchmarks).*

---

## 6. Evaluation Framework (Required)

Production agents need **systematic evaluation**. Build an eval framework that tests:

| Eval Type      | What to Test |
|----------------|--------------|
| **Correctness** | Agent returns accurate information; fact-check against ground truth |
| **Tool Selection** | Agent chooses the right tool for each query |
| **Tool Execution** | Tool calls succeed; parameters are correct |
| **Safety** | Agent refuses harmful requests; avoids hallucination |
| **Consistency** | Same input → same output where deterministic behavior is expected |
| **Edge Cases** | Missing data, invalid input, ambiguous queries |
| **Latency** | Response time within acceptable bounds |

### 6.1 Eval Dataset Requirements

**Minimum 50 test cases:**

- **20+** happy path scenarios with expected outcomes
- **10+** edge cases (missing data, boundary conditions)
- **10+** adversarial inputs (attempts to bypass verification)
- **10+** multi-step reasoning scenarios

Each test case must include: **input query**, **expected tool calls**, **expected output**, and **pass/fail criteria**.

---

## 7. Observability Requirements

| Capability       | Requirements |
|------------------|---------------|
| **Trace Logging** | Full trace: input → reasoning → tool calls → output |
| **Latency Tracking** | Time breakdown: LLM calls, tool execution, total response |
| **Error Tracking** | Capture and categorize failures, stack traces, context |
| **Token Usage** | Input/output tokens per request, cost tracking |
| **Eval Results** | Historical eval scores, regression detection |
| **User Feedback** | Mechanism for thumbs up/down, corrections |

**Suggested tools:** LangSmith, Braintrust, Langfuse, Weights & Biases, Arize Phoenix, Helicone, or custom structured logging + dashboards.

---

## 8. Verification Systems (Implement 3+)

| Verification Type | Implementation |
|-------------------|----------------|
| **Fact Checking** | Cross-reference claims against authoritative sources (e.g. portfolio data, market data) |
| **Hallucination Detection** | Flag unsupported claims; require source attribution |
| **Confidence Scoring** | Quantify certainty; surface low-confidence responses |
| **Domain Constraints** | Enforce business rules (e.g. no specific buy/sell advice, disclosure text) |
| **Output Validation** | Schema validation, format checking, completeness |
| **Human-in-the-Loop** | Escalation triggers for high-risk or high-stakes decisions |

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| End-to-end latency | < 5 s for single-tool queries |
| Multi-step latency | < 15 s for 3+ tool chains |
| Tool success rate | > 95% successful execution |
| Eval pass rate | > 80% on test suite |
| Hallucination rate | < 5% unsupported claims |
| Verification accuracy | > 90% correct flags |

---

## 10. AI Cost Analysis (Required)

### 10.1 Development & Testing Costs

Track and report **actual** spend during development:

- LLM API costs (reasoning, tool calls, response generation)
- Total tokens consumed (input/output breakdown)
- Number of API calls during development and testing
- Observability tool costs (if applicable)

### 10.2 Production Cost Projections

Estimate **monthly** costs at scale:

| Users  | $___/month |
|--------|------------|
| 100    |            |
| 1,000  |            |
| 10,000 |            |
| 100,000|            |

**Include assumptions:** queries per user per day, average tokens per query (input + output), tool call frequency, verification overhead.

---

## 11. Agent Frameworks

Choose one (or build custom) and **document** the selection:

| Framework | Best For |
|-----------|----------|
| LangChain | Flexible agent architectures, tool integrations, good docs |
| LangGraph | Complex multi-step workflows, state machines, cycles |
| CrewAI | Multi-agent collaboration, role-based agents |
| AutoGen | Conversational agents, code execution, Microsoft ecosystem |
| Semantic Kernel | Enterprise integration, .NET/Python, plugins |
| Custom | Full control, learning, specific requirements |

*Ghostfolio is Node/NestJS; consider Node-compatible options (e.g. LangChain.js) or a small Python service that the API calls.*

---

## 12. Technical Stack (Recommended)

| Layer | Technology |
|-------|------------|
| Agent Framework | LangChain or LangGraph |
| LLM | GPT-5, Claude, or open source (Llama 3, Mistral) — Ghostfolio already uses OpenRouter |
| Observability | LangSmith or Braintrust |
| Evals | LangSmith Evals, Braintrust Evals, or custom |
| Backend | Existing NestJS API; extend with GauntletAI module |
| Frontend | Existing Angular client or small chat UI (e.g. React/Next for agent UI) |
| Deployment | Railway, Vercel, Modal, or cloud provider |

*Use whatever stack helps you ship; complete Pre-Search to decide.*

---

## 13. Build Strategy (Priority Order)

1. **Basic agent** — Single tool call working end-to-end.
2. **Tool expansion** — Add remaining tools; verify each works.
3. **Multi-step reasoning** — Agent chains tools appropriately.
4. **Observability** — Integrate tracing; see what’s happening.
5. **Eval framework** — Build test suite; measure baseline.
6. **Verification layer** — Add domain-specific checks.
7. **Iterate on evals** — Improve agent based on failures.
8. **Open source prep** — Package and document for release.

**Guidance:** Get one tool working completely before adding more; add observability early; build evals incrementally; test adversarial inputs throughout; document failure modes for verification design.

---

## 14. Open Source Contribution (Required)

Contribute in **one** of these ways:

| Type | Requirements |
|------|--------------|
| **New Agent Package** | Publish domain agent as reusable package (npm, PyPI) |
| **Eval Dataset** | Release test suite as public dataset |
| **Framework Contribution** | PR to LangChain, LlamaIndex, or similar (new feature/fix) |
| **Tool Integration** | Build and release a reusable tool for the domain |
| **Documentation** | Comprehensive guide/tutorial published publicly |

---

## 15. Agent Architecture Document (Required)

Submit a **1–2 page** document with:

| Section | Content |
|---------|---------|
| Domain & Use Cases | Why this domain; specific problems solved |
| Agent Architecture | Framework choice, reasoning approach, tool design |
| Verification Strategy | What checks were implemented and why |
| Eval Results | Test suite results, pass rates, failure analysis |
| Observability Setup | What is tracked; insights gained |
| Open Source Contribution | What was released; where to find it |

---

## 16. Submission Requirements (Deadline: Sunday 10:59 PM CT)

| Deliverable | Requirements |
|-------------|---------------|
| **GitHub Repository** | Setup guide, architecture overview, deployed link |
| **Demo Video (3–5 min)** | Agent in action, eval results, observability dashboard |
| **Pre-Search Document** | Completed checklist from Phase 1–3 |
| **Agent Architecture Doc** | 1–2 page breakdown using template above |
| **AI Cost Analysis** | Dev spend + projections for 100/1K/10K/100K users |
| **Eval Dataset** | 50+ test cases with results |
| **Open Source Link** | Published package, PR, or public dataset |
| **Deployed Application** | Publicly accessible agent interface |
| **Social Post** | Share on X or LinkedIn: description, features, demo/screenshots; tag @GauntletAI |

---

## 17. GauntletAI Folder Structure (Suggested)

```
GauntletAI/
├── PROJECT_OVERVIEW.md          # This document
├── PRE_SEARCH.md                # Pre-search checklist & decisions
├── ARCHITECTURE.md              # 1–2 page agent architecture (final)
├── COST_ANALYSIS.md             # AI cost tracking & projections
├── EVAL_DATASET.md              # Test case index + pass/fail criteria
├── eval/                        # Eval test cases (50+)
│   ├── happy-path/
│   ├── edge-cases/
│   ├── adversarial/
│   └── multi-step/
├── docs/                        # Additional design & verification docs
└── (agent code location TBD: e.g. apps/api/src/app/gauntlet-agent/ or separate service)
```

---

## 18. Quick Reference — Ghostfolio Repo

- **API:** `apps/api/` (NestJS)
- **AI endpoint:** `apps/api/src/app/endpoints/ai/` (AiController, AiService)
- **Portfolio:** `apps/api/src/app/portfolio/`
- **Account:** `apps/api/src/app/account/`
- **Data / symbols:** `apps/api/src/app/endpoints/data-providers/`, `apps/api/src/app/symbol/`
- **Client:** `apps/client/` (Angular)
- **Development:** See root `DEVELOPMENT.md` (Docker, Node ≥22.18, Prisma, npm scripts)

---

*Last updated: February 2025. Align with official GauntletAI project brief and submission portal.*
