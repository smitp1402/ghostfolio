# GauntletAI Agent — General Objective & Tools

**Scope:** Finance domain (Ghostfolio)  
**Purpose:** Define the agent's objective and the tools it uses to help users.

---

## 1. General Objective

**Help Ghostfolio users understand and manage their finances in plain language** by answering questions about their portfolio, performance, accounts, and transactions, and by explaining reports and rules—without requiring them to use menus, filters, or APIs.

### In practice the agent helps users to:

- **Understand** — "How is my portfolio doing?", "What's my allocation?", "How much cash do I have?"
- **Analyze** — "How did I perform this year?", "Compare to a benchmark", "What does my portfolio report say?"
- **Explore** — "What did I buy/sell recently?", "Show my positions", "What's the current price of X?"
- **Explain** — Turn numbers and rules into short, clear answers (e.g. risk/compliance rules, fees, diversification).

The agent remains **informational and analytical**: it does not give buy/sell advice, execute trades, or change data. It helps users **make sense of** their Ghostfolio data through conversation.

---

## 2. Tools the Agent Can Use

Tools are implemented by calling existing Ghostfolio backend services (or their HTTP API). Each tool maps to one or more service methods and supports the agent objective above.

### 2.1 Portfolio

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **portfolio_details** | `PortfolioService.getDetails()` (with `withSummary`, optional `withMarkets`) | Full portfolio: holdings, accounts, platforms, markets, summary. Use for: "How is my portfolio?", "What's my allocation?", "Portfolio summary." |
| **portfolio_holdings** | `PortfolioService.getHoldings()` | List of holdings. Use for: "What do I hold?", "List my positions." |
| **portfolio_performance** | `PortfolioService.getPerformance()` | Time series and metrics (chart, net performance, total investment, current net worth). Use for: "Performance this year", "How did my portfolio perform?" |
| **portfolio_report** | `PortfolioService.getReport()` | Report with rule evaluations (risk, fees, liquidity, etc.). Use for: "Run my portfolio report", "Any rule violations?", "Risk check." |
| **portfolio_holding** | `PortfolioService.getHolding(dataSource, symbol)` | Single position details. Use for: "Details for symbol X." |

### 2.2 Activities / Transactions

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **activities_list** | `OrderService.getOrders()` (with filters: account, symbol, tags, date range) | List user activities/orders. Use for: "Recent transactions", "Orders for symbol X", "Transactions in account Y." |

### 2.3 Accounts & Cash

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **accounts_list** | `AccountService.accounts()` | User accounts (optional balances). Use for: "List my accounts", "Which accounts do I have?" |
| **cash_balance** | `AccountService.getCashDetails()` | Cash balance in base currency. Use for: "How much cash do I have?", "Cash balance." |

### 2.4 Market Data & Symbols

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **market_quote** | `DataProviderService.getQuotes()` or symbol API by `dataSource` + `symbol` | Current price (and currency) for one or more symbols. Use for: "Current price of X", "Quote for AAPL." |
| **market_historical** | `DataProviderService.getHistorical()` or `SymbolService.get()` / `getForDate()` | Historical prices. Use for: "Price of X on date D", "History for symbol Y." |
| **symbol_lookup** | `SymbolService.lookup()` | Search symbols. Use for: "Find symbol for Tesla", "Search symbol X." |

### 2.5 Benchmarks

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **benchmark_data** | `BenchmarksService.getMarketDataForUser()` (symbol, dataSource, dateRange, user) | Benchmark series for comparison. Use for: "Compare my portfolio to benchmark X", "Benchmark performance." |

### 2.6 Rules / Compliance (optional)

| Tool (suggested name) | Backend / API | Purpose |
|----------------------|---------------|--------|
| **rules_evaluate** | `RulesService.evaluate(rules, userSettings)` | Returns `PortfolioReportRule[]`. Use for: "Are any rules failing?", "Risk/compliance check." (Often combined with `portfolio_report`.) |

---

## 3. MVP Minimum (from PRD)

For the **MVP gate**, at least **3 functional tools** are required. A minimal set that supports the general objective:

1. **portfolio_details** (or **portfolio_analysis**) — portfolio + allocation + summary.
2. **portfolio_performance** — performance over time and metrics.
3. **activities_list** — recent transactions.

Additional tools (e.g. **market_quote**, **portfolio_report**, **cash_balance**) can be added to improve answers and coverage.

---

## 4. Document References

- [PRD_MVP.md](./PRD_MVP.md) — MVP scope and requirements.
- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) — Timeline, architecture, suggested tools.
- Ghostfolio API: `apps/api/` — PortfolioService, OrderService, AccountService, DataProviderService, SymbolService, BenchmarksService, RulesService.
