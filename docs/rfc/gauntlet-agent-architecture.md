# RFC: Gauntlet Agent Architecture

- **Status:** Draft
- **Owner:** AI Platform / Backend
- **Date:** 2026-03-01

## Context
Gauntlet Agent powers finance-focused conversational workflows, including portfolio summary, performance, activities, historical market data, and cash transfer preview/execute. The system must be tool-grounded, stateful across turns, and safe-by-default before output is returned.

## Goals
- Reliable multi-step tool orchestration
- Domain-bounded responses for finance use cases
- Verifiable output with citations and confidence score
- Persistent context for follow-up questions

## Non-Goals
- Open-domain chatbot behavior outside app scope
- Autonomous sensitive action execution without confirmation
- Replacing backend financial source-of-truth services

## Agent Components

| Component | Requirements | Reasoning |
|---|---|---|
| **Reasoning Engine** | LLM with structured output, chain-of-thought capability | Performs intent classification, tool selection, and synthesis of tool-backed responses. |
| **Tool Registry** | Defined tools with schemas, descriptions, and execution logic | Central tool contracts reduce invocation errors and improve deterministic execution. |
| **Memory System** | Conversation history, context management, state persistence | Preserves conversation continuity and intent/session signals for better follow-up behavior. |
| **Orchestrator** | Decides when to use tools, handles multi-step reasoning | Coordinates intent gate, tool loop, clarification flow, and response assembly. |
| **Verification Layer** | Domain-specific checks before returning responses | Enforces domain, safety, grounding, and numeric consistency guardrails. |
| **Output Formatter** | Structured responses with citations and confidence | Provides stable response contract for UI/consumers with transparent confidence and traceability. |

## Current Implementation Mapping
- Orchestrator: `apps/api/src/app/gauntlet-agent/orchestrator/gauntlet-agent.service.ts`
- Controller (SSE): `apps/api/src/app/gauntlet-agent/orchestrator/gauntlet-agent.controller.ts`
- Tool registry: `apps/api/src/app/gauntlet-agent/tools/tool.registry.ts`
- Memory service: `apps/api/src/app/gauntlet-agent/memory-system/conversation-memory.service.ts`
- Verification pipeline: `apps/api/src/app/gauntlet-agent/verification-layer/verifier.ts`
- Output formatter: `apps/api/src/app/gauntlet-agent/formatter/output-formatter.ts`

## Request Lifecycle
1. Receive `POST /gauntlet-agent/chat/stream`.
2. Run intent gate using model classification + heuristics + recent context.
3. Bind LLM with tool registry and execute iterative tool-call loop.
4. Collect tool output snippets as evidence.
5. Run ordered verification rules and merge verdict.
6. Format final structured output with citations and confidence.
7. Persist conversation turn and intent state in Redis.
8. Stream response chunks and structured payload to client.

## Risks and Mitigations
- **Hallucinated numerics:** tool-grounding + numeric-consistency checks
- **Out-of-domain drift:** intent gate + domain-scope block rule
- **Unsafe transfer behavior:** cash-transfer preview/confirmation checks
- **Low provenance quality:** citations + market source/date freshness checks

## Success Metrics
- Verification verdict distribution (`PASS/WARN/REWRITE/BLOCK`)
- Tool call success/failure rates
- % responses with citations
- Clarification-to-resolution conversion
- Reduction in unsupported numeric claims
