# Firedash – Working Session Summary (Sep 13–14, 2025)

This document summarizes the major changes, architecture, and key functions so we can quickly pick up work next time without reading the full chat history.

## Overview
- Goal: Private, web-based FIRE simulator with historical backtesting and Monte Carlo.
- Stack: React + TypeScript + Vite, Material UI (dark/light), custom SVG charts.
- Data model: Snapshot JSON (accounts, holdings, real estate, contributions/expenses, retirement, assumptions).

## Core Features Implemented
- Upload/Builder: Upload snapshot or paste Monarch JSON; Builder edits all sections; per-account pies and holdings tables.
- Historical Data UI: Upload and persist monthly returns in IndexedDB; Yearly Returns chart with axes/hover; Sanity Stats panel (yearly means/vols and correlation).
- Simulation Engine:
  - Deterministic path (fixed real monthly returns derived from annual means).
  - Monte Carlo:
    - Regime sampler (bull/bear/stagnation) with persistent drawdowns.
    - Historical block bootstrap from data/historical_returns.json (annual Damodaran returns expanded to monthly, sampled in 12‑month blocks with noise for intra‑year dispersion).
  - Monthly cashflow schedule (contributions/expenses, optional rental net flows), rebalancing, retirement timing, SS inflow.
- Charts: Fan chart (P10/P25/Median/P75/P90), deterministic line, stacked area by asset class; minor axis labels; currency axes abbreviated (K/M/B); hovers show calendar dates; retirement markers and table highlight.

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
  - runPath() and runPathWithSeries(): apply monthly returns, cashflows, spend/SS after retirement, rebalance.
  - createRegimeSampler(): Markov monthly regimes; now includes GOLD (and guards missing params).
  - tryLoadHistorical() + createBootstrapSampler(): samples contiguous blocks; detects annual-expanded data and aligns on 12‑month boundaries, adds elevated noise to restore dispersion.
  - simulatePathTotals(): optimized typed-array runner for worker threads.
  - simulateDeterministicSeries(): returns total/byClass plus principalRemaining series for charts.
- backtest.ts: wraps deterministic simulation and returns terminal.
- monteCarlo.ts: runs simulate() with mcMode (bootstrap/regime/gbm), summarizes success and median.

## UI / State
- Material UI AppBar+Drawer; Theme toggle (AppThemeProvider).
- ScenarioOptions: sliders for years/paths/inflation; Max Workers; Select for rebalancing; MC Mode (Bootstrap/Regime/GBM); block/noise controls for Bootstrap; debounced sliders.
- BuilderPage: Monarch import; Accordions for General/Retirement; Accounts (Type label fixed), Real Estate (with estimate helper), Contributions, Expenses, Social Security; inline validation and tooltips.
- Snapshot: KPI cards; global allocation pie; per-account pies and holdings; clicking account name jumps to its detail card.
- Results: Monte Carlo worker pool with progressive updates using P^2 quantiles; progress bar and text; caching of results keyed by snapshot+options.
- Scenarios: Inputs for success targets and paths per eval; parallelized spend search (one worker per target) with iteration updates; stacked Balance vs. Principal charts per scenario; caching by inputs.

## Calibration Notes
- Bootstrap defaults tuned for annual-expanded dataset:
  - Block: 12 (year-aligned); Noise σ ≈ 0.012.
  - Yields more realistic intra‑year movement and upward median for US_STOCK-heavy allocations.
- Deterministic path uses fixed real returns; doubling ~14y (~5% real) is expected. Monte Carlo median should show better trend with Bootstrap.

## Key Files & Responsibilities
- src/importers/monarch.ts – Robust importer and grouping, price freshness.
- src/engine/historical.ts – Bootstrap sampler & loader (bundled JSON import).
- src/engine/sim.ts – Core monthly loop, deterministic/MC series, regime sampler.
- src/engine/alloc.ts – Asset classification and weights; GOLD/CRYPTO added.
- src/state/AppContext.tsx – Snapshot + simOptions (years, paths, rebalFreq, inflation, mcMode).
- src/components/charts/* – FanChart/LineChart/StackedArea with tooltips, axes, legends, retirement markers.

## Known TODOs / Next Steps
- Historical parser: Parse monthly Home Prices and Gold Prices sheets for richer monthly dynamics; merge with Damodaran series.
- Withdrawal policies (guardrails/VPW) and tax-lot sale logic.
- Add worker-pool split per spend target (already one-per-target; consider parallelizing inside eval); show ETA and allow cancel.
- Add Max Workers to Scenarios page.
- CSV parser for historical upload.

## How to Run / Re-generate Historical Data
- Dev: `npm install` then `make dev`.
- Build: `make build`.
- Historical JSON: `node scripts/parse_histret.mjs` (reads histretSP.xls, outputs data/historical_returns.json).

## Notes
- Caching: Results and Scenarios caches persist in localStorage (keyed by snapshot+options). Results updates cache progressively.
- After upload, app navigates to Results and precomputes scenarios in background.
