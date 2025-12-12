# Firedash – Working Session Summary (Sep 13–15, 2025)

This document summarizes the major changes, architecture, and key functions so we can quickly pick up work next time without reading the full chat history.

## Overview
- Goal: Private, web-based FIRE simulator with historical backtesting and Monte Carlo.
- Stack: React + TypeScript + Vite, Material UI (dark/light), custom SVG charts.
- Data model: Snapshot JSON (accounts, holdings, real estate, contributions/expenses, retirement, assumptions).

## Core Features Implemented
- Upload/Builder: Upload snapshot or paste Monarch JSON; Builder edits all sections; per-account pies and holdings tables.
- Simulation Engine:
  - Deterministic path (fixed real monthly returns derived from annual means).
  - Monte Carlo: Historical block bootstrap from data/historical_returns.json (annual Damodaran returns expanded to monthly, sampled in 12‑month blocks with noise for intra‑year dispersion).
  - Monthly cashflow schedule (contributions/expenses + property flows with carrying costs and mortgage payments until payoff), rebalancing, retirement timing, SS inflow starting at claim age.
- Charts: Fan chart (P10/P25/Median/P75/P90) with highlight; minor axis labels; currency axes abbreviated (K/M/B); hovers show calendar dates; retirement markers and table highlight.

## Data Ingestion
- Monarch importer (src/importers/monarch.ts):
  - Parses GraphQL aggregate holdings (edges), groups by holding.account.
  - Institutionless accounts → synthetic “Other” account; crypto under non‑crypto → synthetic “(Crypto)” account.
  - Price selection prefers fresher security.currentPrice vs stale holding closingPrice.
- Historical parser (scripts/parse_histret.mjs):
  - Reads histretSP.xls → ‘Returns by year’ annual series for Stocks, T‑Bond, T‑Bill, Real Estate, Gold.
  - Converts to monthly via geometric scaling; writes data/historical_returns.json.

## Simulation Details (src/engine)
- alloc.ts: classifyHolding (US_STOCK/INTL/BONDS/REIT/CASH/REAL_ESTATE/CRYPTO/GOLD), computeAllocation, DEFAULT_RETURNS.
- schedule.ts: buildTimeline → months, retirementAt, consolidated cashflows, rental net monthly.
- sim.ts:
  - zeroBalances() + dynamic byClass arrays (prevents NaNs when adding new asset classes).
  - runPath(): applies monthly returns, cashflows, spend/SS after retirement, rebalance.
  - tryLoadHistorical() + createBootstrapSampler(): samples contiguous blocks; detects annual-expanded data and aligns on 12‑month boundaries, adds calibrated noise.
  - simulatePathTotals(): optimized typed-array runner for worker threads.
  - simulateSeries(): aggregates Monte Carlo percentiles per month for charting.
- monteCarlo.ts: runs simulate() with bootstrap sampling, summarizes success and median.

## UI / State
- Material UI AppBar+Drawer; Theme toggle (AppThemeProvider).
- ScenarioOptions: sliders for years/paths/inflation and percentile selector; Max Workers; Select for rebalancing; debounced sliders and tooltips.
- BuilderPage: Monarch import; Accordions for General/Retirement; Accounts (Ticker/Name inputs), Real Estate (with estimate helper), Contributions, Expenses, Social Security; pagination for large holdings; lazy preview; inline validation/tooltips.
- Snapshot: KPI cards; global allocation pie; per-account pies and holdings; clicking account name jumps to its detail card.
- Results: Monte Carlo worker pool with progressive updates using P^2 quantiles; per‑year end‑balance aggregation (P10/P25/P50/P75/P90) and Alive_Frac (paths remaining). Yearly Balance Sheet with CSV export and retirement badges; Yearly Flows chart with centered bars and retirement marker; fan chart highlights the selected percentile and the summary card shows its final balance. Caching stores yearEnds and aliveFrac.
- What‑Ifs: Unified Sensitivity + Scenarios under a single page; baseline vs variant comparison; drawdown search for Optimistic/Realistic/Conservative targets; charts overlay Monte Carlo percentiles; routes `/what-ifs`, `/scenarios`, `/sensitivity` all resolve here.

## Calibration Notes
- Bootstrap defaults tuned for annual-expanded dataset:
  - Block: 12 (year-aligned); Noise σ ≈ 0.012.
  - Yields more realistic intra‑year movement and upward median for US_STOCK-heavy allocations.

## Key Files & Responsibilities
- src/importers/monarch.ts – Robust importer and grouping; fresher price logic; sets HoldingLot.name.
- src/engine/historical.ts – Bootstrap sampler & loader (bundled JSON import).
- src/engine/schedule.ts – Timeline with consolidated cashflows incl. property flows; retirement and SS start months.
- src/engine/mortgage.ts – Amortization schedule helper and payoff detection.
- src/engine/sim.ts – Core monthly loop with bootstrap sampler fallback; depletion handling and typed‑array fast path.
- src/engine/alloc.ts – Asset classification and weights; GOLD/CRYPTO added.
- src/state/AppContext.tsx – Snapshot + simOptions (years, paths, rebalFreq, inflation, bootstrap controls).
- src/components/charts/* – FanChart/LineChart/MultiLineChart; tooltips, axes, legends, retirement markers.
- src/components/YearlyBalanceSheet.tsx – Per‑year breakdown, CSV export with Alive_Frac.
- src/components/YearlyFlowsChart.tsx – Stacked flows (returns+income vs expenditures) per year.
- src/pages/ResultsPage.tsx – Orchestrates workers; progressive updates; caching; per‑year quantiles and paths remaining.
- src/pages/WhatIfsPage.tsx – Unified Sensitivity + Scenarios.

## Known TODOs / Next Steps
- Historical parser: Parse monthly Home Prices and Gold Prices sheets for richer monthly dynamics; merge with Damodaran series.
- Withdrawal policies (guardrails/VPW) and tax-lot sale logic.
- Spend search: show ETA, allow cancel; consider deeper parallelization.

## How to Run / Re-generate Historical Data
- Dev: `npm install` then `make dev`.
- Build: `make build`.
- Historical JSON: `node scripts/parse_histret.mjs` (reads histretSP.xls, outputs data/historical_returns.json).

## Notes
- Caching: Results and What‑Ifs caches persist in localStorage (keyed by snapshot+options). Results updates cache progressively and stores per‑year series and Alive_Frac.
- After upload, app navigates to Results and precomputes What‑Ifs scenarios as needed.

## Session Updates (Sep 15, 2025)
- Combined Sensitivity and Scenarios into What‑Ifs; routed aliases and updated nav.
- Corrected Social Security start (claim age) and real estate cashflow modeling (mortgage payoff, carrying costs, no double-count in Extra).
- Added Real Estate amortization panel (schedule/sparkline).
- Overhauled Results with per‑year quantiles, Yearly Balance Sheet/Flows, Paths Remaining, CSV export; fixed NaN/zero collapse and depletion handling; removed deterministic panel and made percentile selector sticky with highlighted line on the fan chart.
- Builder optimizations (pagination, lazy preview) and Holding Name field; Snapshot shows Ticker or Name.
- MultiLineChart tooltip guards undefined values.
- Chrome extension Monarch import now merges into the existing snapshot with a diff/confirmation panel so holdings refreshes can be reviewed before applying; merge helper preserves mortgages/rentals and new Vitest coverage was added.
- AI assistant revamp: chat history is persisted across turns, condensed snapshot context is shown in Portfolio Analysis “advanced” mode, prompts send a trimmed snapshot projection, and the assistant panel now renders full Markdown/HTML (lists, tables) with context injection controls.
