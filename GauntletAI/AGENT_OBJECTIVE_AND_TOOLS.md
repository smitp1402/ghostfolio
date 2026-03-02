# GauntletAI Agent — Objective and Tools

## Main Objective

Provide a finance-focused conversational assistant for Ghostfolio users that helps them:

- understand portfolio status and allocation
- analyze performance across time periods
- review activities and portfolio report results
- retrieve historical market prices
- move cash between their own accounts with explicit confirmation

The agent is strictly domain-scoped (portfolio, activities, market data, cash transfer) and avoids investment advice.

---

## Tool List and Use Cases

| Tool Name | Use Case |
|---|---|
| `portfolio_details` | Portfolio snapshot questions: "How is my portfolio?", "Show allocation", "Portfolio summary" |
| `portfolio_performance` | Performance-over-time questions: "How did I perform this year?", "Returns in 2024", "YTD performance" |
| `portfolio_report` | Rule/compliance/risk report questions: "Run portfolio report", "Any rule violations?", "Risk check" |
| `activities_list` | Transaction history questions: "Recent activities", "What did I buy/sell?", "Orders for symbol X" |
| `market_historical` | Historical market price questions: "Price of AAPL on date D", "BTC history from A to B", "Market report for symbol" |
| `cash_transfer` | Move cash between user accounts: preview first, execute only after explicit confirmation |

---

## Operating Boundaries

- In scope: portfolio, performance, activities, report/rules, historical market data, account cash transfer
- Out of scope: general non-finance chat and investment buy/sell recommendations
- Safety: transfer actions require confirmation before execution
