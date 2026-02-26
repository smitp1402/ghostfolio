# Product Requirements Document — GauntletAI MVP

**Version:** 1.0  
**Scope:** MVP (24-hour gate)  
**Deadline:** Tuesday (24 hours from Pre-Search)  
**Source:** [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) §3

---

## 1. Vision & Goals

### Vision

Ship a **minimal but reliable** finance-domain agent that responds to natural language, invokes at least three tools against Ghostfolio data, and returns coherent, structured answers. The MVP must be deployable and publicly accessible to pass the gate.

### Goals

| Goal | Description |
|------|-------------|
| **Reliability over complexity** | A simple agent with reliable tool execution beats a complex agent that hallucinates or fails unpredictably. |
| **Finance domain** | All queries and tools are scoped to portfolio, transactions, and related finance context. |
| **Gate compliance** | Satisfy every MVP requirement so the project can proceed to Early Submission (eval framework + observability). |

---

## 2. Scope

### 2.1 In Scope (MVP)

- Natural-language interface for finance-domain queries.
- At least **3 functional tools** with defined schemas and execution logic.
- Tool calls that execute successfully and return **structured results**.
- Agent **synthesis** of tool results into coherent, user-facing responses.
- **Conversation history** maintained across turns (multi-turn dialogue).
- **Basic error handling**: graceful failure, no crashes (e.g., invalid tool params, API errors).
- At least **one domain-specific verification check** (e.g., no specific buy/sell advice, disclaimer, or fact-check against data).
- **Simple evaluation**: 5+ test cases with defined expected outcomes and pass/fail criteria.
- **Deployment**: publicly accessible (e.g., Railway, Vercel, or cloud).

### 2.2 Out of Scope (Post-MVP)

- Full set of 5 tools (only 3 required for MVP).
- Full eval framework (50+ cases, adversarial, multi-step) — required for Early Submission.
- Observability (trace logging, latency, token usage, dashboards) — required for Early Submission.
- Multiple verification systems (3+); MVP requires only one.
- Performance targets (latency, tool success rate, hallucination rate) — apply after MVP.
- Open source contribution, agent architecture document, cost analysis, demo video — required for Final.

---

## 3. User Stories & Acceptance Criteria

### US-1: Finance-domain natural language queries

**As a** user,  
**I want to** ask questions about my portfolio and finances in plain language,  
**So that** I get answers without using formal APIs or menus.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-1.1 | Agent responds to finance-domain queries (e.g., portfolio summary, allocation, performance, transactions). | Response is relevant and in natural language. |
| AC-1.2 | Agent does not require users to know tool names or parameters. | User can ask “How is my portfolio doing?” and receive a synthesized answer. |

---

### US-2: At least 3 functional tools

**As the** system,  
**I need** at least 3 tools the agent can invoke,  
**So that** the MVP meets the gate and demonstrates tool use.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-2.1 | At least 3 tools are implemented with schemas and descriptions. | Each tool has name, description, parameters (with types), and execution logic. |
| AC-2.2 | Tools are domain-appropriate (finance / Ghostfolio). | E.g., portfolio_analysis, market_data, transaction_categorize, tax_estimate, or compliance_check (see PROJECT_OVERVIEW §5). |
| AC-2.3 | Tools are wired into the agent’s tool registry. | Agent can select and invoke each tool from natural language. |

---

### US-3: Tool execution and structured results

**As the** agent,  
**I need** tool calls to execute successfully and return structured data,  
**So that** I can use the results to answer the user.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-3.1 | Tool calls execute without crashing the process. | No unhandled exceptions; errors return structured error payloads. |
| AC-3.2 | Tool results are structured (e.g., JSON with known fields). | Results can be parsed and passed to the LLM for synthesis. |
| AC-3.3 | Tools use Ghostfolio services where applicable (e.g., PortfolioService, AccountService, data providers). | Implementation is documented; at least one tool uses existing backend services. |

---

### US-4: Synthesized responses

**As a** user,  
**I want** the agent to combine tool outputs into a single coherent answer,  
**So that** I don’t see raw JSON or fragmented messages.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-4.1 | Agent uses tool results to generate a natural-language response. | Response references data from the tools (e.g., numbers, allocation) rather than dumping raw output. |
| AC-4.2 | Response is appropriate for the original query. | A query about “allocation” yields an answer about allocation, not unrelated content. |

---

### US-5: Conversation history

**As a** user,  
**I want** the agent to remember our conversation within a session,  
**So that** I can ask follow-up questions (e.g., “What about last month?”).

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-5.1 | Conversation history is maintained across turns. | Agent receives prior user messages and assistant messages in context (or equivalent state). |
| AC-5.2 | Follow-up queries can reference earlier context. | At least one test case validates a follow-up that depends on previous turn(s). |

---

### US-6: Basic error handling

**As a** user or operator,  
**I want** the system to handle errors gracefully and not crash,  
**So that** I get a clear message or fallback instead of a 500 or process exit.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-6.1 | Invalid or missing tool parameters are handled. | Agent or tool layer returns an error message or retry instead of throwing uncaught. |
| AC-6.2 | Backend/API failures (e.g., portfolio service down) are caught. | User sees a graceful message; no server crash. |
| AC-6.3 | Unsupported or out-of-domain requests are handled. | Agent responds with a safe message (e.g., “I can only help with portfolio and finance questions”) rather than hallucinating. |

---

### US-7: Domain-specific verification (at least one)

**As the** product owner,  
**I need** at least one domain-specific verification check before returning answers,  
**So that** we reduce unsupported claims and comply with finance constraints.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-7.1 | At least one verification type is implemented. | Options: fact-check against portfolio/market data, disclaimer injection, no specific buy/sell advice, confidence flag, or output schema validation. |
| AC-7.2 | Verification is applied in the response path. | Either responses are modified (e.g., disclaimer appended) or low-confidence/unsupported answers are flagged or rephrased. |

---

### US-8: Simple evaluation (5+ test cases)

**As a** developer,  
**I need** a small set of test cases with expected outcomes,  
**So that** we can assert the MVP behaves as intended and regress later.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-8.1 | At least 5 test cases exist. | Each has: input query, expected behavior (e.g., expected tool calls and/or expected output constraints). |
| AC-8.2 | Pass/fail criteria are defined. | Each test can be run and scored (e.g., tool selected, key facts in output). |
| AC-8.3 | Test cases are executable (script or manual runbook). | Evidence that the suite was run and results recorded (e.g., in EVAL_DATASET.md or eval/). |

---

### US-9: Deployed and publicly accessible

**As a** reviewer,  
**I need** to access the agent via a public URL,  
**So that** the MVP can be validated without local setup.

| ID | Acceptance criterion | Pass definition |
|----|----------------------|-----------------|
| AC-9.1 | Application is deployed to a public environment. | URL is reachable (e.g., Railway, Vercel, or cloud host). |
| AC-9.2 | Agent interface is reachable. | User can send a message and receive an agent response (e.g., chat UI or API with docs). |

---

## 4. MVP Requirement Checklist (Gate)

All of the following must be satisfied to pass the MVP gate:

- [ ] **R1** Agent responds to natural language queries in the **finance** domain.
- [ ] **R2** **At least 3 functional tools** the agent can invoke.
- [ ] **R3** Tool calls execute successfully and return **structured results**.
- [ ] **R4** Agent **synthesizes** tool results into coherent responses.
- [ ] **R5** **Conversation history** maintained across turns.
- [ ] **R6** **Basic error handling** (graceful failure, no crashes).
- [ ] **R7** **At least one domain-specific verification check**.
- [ ] **R8** **Simple evaluation:** 5+ test cases with expected outcomes.
- [ ] **R9** **Deployed and publicly accessible.**

---

## 5. Technical Constraints & Assumptions

### Constraints

- **Backend:** Integrate with existing Ghostfolio stack: NestJS API, Prisma, PostgreSQL, Redis (see DEVELOPMENT.md).
- **Agent location:** Extend or add a dedicated **GauntletAI** module; may extend `apps/api/src/app/endpoints/ai/` or add a new module that uses `PortfolioService`, `AccountService`, and data providers.
- **Auth:** Agent must run in user context where portfolio/account data is user-specific (e.g., JWT, `RequestWithUser`).
- **Stack:** Node/NestJS preferred; if a separate agent service is used (e.g., Python), it must be callable from the API and documented.

### Assumptions

- Pre-Search (PRE_SEARCH.md) is completed so that tool mappings, framework choice, and first-tool decision are known.
- At least one Ghostfolio service (e.g., PortfolioService or data provider) is available and usable for tool implementation.
- LLM access (e.g., OpenRouter) is configured and usable from the API.
- Deployment target (e.g., Railway) is chosen and credentials/env available.

---

## 6. Dependencies

| Dependency | Owner | Notes |
|------------|--------|--------|
| Ghostfolio API & services | Repo | PortfolioService, AccountService, data providers, auth. |
| Pre-Search decisions | Team | Framework, LLM, first tool; see PRE_SEARCH.md. |
| LLM API (OpenRouter or other) | Team | API key and model for reasoning + tool use. |
| Deployment platform | Team | Railway/Vercel/cloud account and env for public URL. |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tool integration with Ghostfolio is slower than expected | Implement the first tool end-to-end before adding more; use PRE_SEARCH mappings. |
| Conversation history adds complexity | Use framework support (e.g., LangChain message history) or a minimal in-memory/session store for MVP. |
| Deployment blocks gate | Deploy early (e.g., after first working tool); use a simple chat endpoint + static or minimal UI. |
| Eval suite too heavy for 24h | Limit to 5–10 test cases with clear pass criteria; expand in Early Submission. |

---

## 8. Success Metrics (MVP)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gate pass | 9/9 requirements (R1–R9) | Checklist in §4. |
| Tools working | ≥ 3 tools invokable and returning structured results | Manual or automated test. |
| Eval | ≥ 5 test cases with defined expected outcomes and pass/fail | Run suite; record in EVAL_DATASET.md or eval/. |
| Stability | No crashes on invalid input or backend errors | Error-handling test cases and ad-hoc testing. |

---

## 9. Document References

- **Project overview:** [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) — full timeline, tools, eval, observability, verification.
- **Pre-Search:** [PRE_SEARCH.md](./PRE_SEARCH.md) — architecture and tool decisions before MVP.
- **Development:** [../DEVELOPMENT.md](../DEVELOPMENT.md) — Ghostfolio setup, Docker, Node, npm scripts.
- **Suggested folder structure:** PROJECT_OVERVIEW.md §17 — GauntletAI layout (eval/, docs/, etc.).

---

*This PRD is the single source of truth for MVP scope. Changes to scope should be reflected here and agreed before implementation.*
