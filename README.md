# Firedash — FIRE Simulator & Portfolio Dashboard

Firedash is a private, web-based dashboard for planning Financial Independence / Retire Early (FIRE). It ingests a point-in-time snapshot of your assets, runs historical and Monte Carlo simulations with configurable assumptions, and presents results with interactive charts.

## Highlights
- Snapshot-based, no live account linking; all data local by default
- Monarch JSON importer with robust grouping (brokerage, crypto, other) and Holding name support
- Deterministic and Monte Carlo simulations (historical bootstrap)
- Historical block bootstrap using long-run asset-class returns; in-app Historical Data upload with IndexedDB persistence and yearly performance charts + sanity stats
- Real estate modeling with carrying costs and mortgage amortization; SS begins at claim age
- Unified What‑Ifs (Sensitivity + Scenarios) with baseline vs variant and target success spend search
- Results overhaul: per‑year quantiles (P10/P25/P50/P75/P90), Yearly Balance Sheet, Yearly Flows, Paths Remaining, CSV export
- Interactive charts (fan chart with percentile highlight, yearly flows); minor tick labels; currency axes abbreviated (K/M/B)
- Material UI, dark/light theme, responsive UI

## Quick Start
Requirements: Node.js 18+ and npm.

- Install and run dev server
```
npm install
make dev
```
Open the Vite dev URL (typically http://localhost:5173).

- Upload or build a snapshot
  - Upload a JSON snapshot (see `examples/sample_snapshot.json`)
  - or go to Builder → paste Monarch investments JSON → Import → Load Into App
- Fetch live Monarch data with the optional Chrome extension (see `extension/README.md`).

- Results
  - Adjust Monte Carlo bootstrap settings (block length, noise) in Scenario Options
  - Adjust Years, Paths, Rebalancing, Inflation, Max Workers; Bootstrap Block/Noise
  - MC runs in Web Workers with a pool and progressive percentile updates; cache persists results

## Simulation Modes
- Monte Carlo (Results):
  - Bootstrap (recommended): Block‑bootstrap monthly returns from `data/historical_returns.json` to preserve realistic sequences (bear/flat/rebound). When the dataset is annual expanded to monthly, the engine detects it and adds calibrated monthly dispersion.
- Deterministic (internal/diagnostic): used in What‑Ifs and some helpers, but not shown on Results.

## Historical Data
- Supplied via `data/historical_returns.json`. An example format is in `data/historical_returns.example.json`.
- Parser: `scripts/parse_histret.mjs` reads `histretSP.xls` (Damodaran’s “Returns by year”), converts annual returns to monthly, and writes the JSON. Run:
```
node scripts/parse_histret.mjs
```
- In‑app: Upload CSV/JSON via Historical Data page (stored in IndexedDB), view yearly returns chart and sanity stats (means/vols/corrs).
- Bootstrap controls live in Scenario Options (Block months, Noise σ).

## Monarch Importer
- Paste raw Monarch “Aggregate Holdings” JSON in Builder → Import Investments.
- Grouping rules:
  - If `holding.account.institution` is missing → put in synthetic “Other” account.
  - Crypto tickers under non‑crypto accounts → synthetic “(Crypto)” account.
- Price freshness: prefers `security.currentPrice` over stale holding `closingPrice` based on timestamps.

## Snapshot Schema (abridged)
```ts
// src/types/schema.ts
accounts: [{ id, type: 'taxable-brokerage'|'401k'|'ira'|'roth'|'hsa'|'cash'|'crypto'|'other',
  holdings: [{ ticker|asset_class, units, price, cost_basis? }], cash_balance? }]
real_estate: [{ id, value, mortgage_balance?, rate?, payment?, taxes?, insurance?,
  maintenance_pct?, appreciation_pct?, rental?: { rent, vacancy_pct?, expenses? }, zip? }]
contributions: [{ account_id, amount, frequency: 'once'|'monthly'|'annual', start?, end? }]
expenses: [{ amount, frequency, start?, end?, category? }]
retirement: { target_date? | target_age?, expected_spend_monthly, withdrawal_strategy? }
social_security: [{ claim_age, monthly_amount, COLA? }]
assumptions: { inflation_mode?: 'fixed'|'historical_CPI', inflation_pct?, rebalancing?: { frequency?, threshold_pct? }, tax_profile? }
person?: { current_age? }
```

## UI Guide
- Upload: Drag & drop snapshot JSON; routes to Builder on success
- Builder: Import Monarch JSON; edit General/Retirement; Accounts/Holdings (Ticker/Name); Real Estate (with “Estimate” helper), Contributions, Expenses, Social Security; inline validation/tooltips; Load/Download. Large holdings lists paginate and preview is lazy for speed.
- Snapshot: KPI cards; global allocation pie; per‑account pies by ticker + holdings tables; rounded, right‑aligned values; clicking an account name jumps to its details
- Results: Scenario Options (sliders/selects, percentile selector). Worker pool + progressive MC percentiles (historical bootstrap only); per‑year aggregation (P10..P90). Yearly Balance Sheet with CSV export (+ Alive_Frac), Yearly Flows chart (returns/income vs expenditures), retirement markers. The percentile selector highlights the selected line on the fan chart and updates the final-balance summary.
- What‑Ifs: Unified Sensitivity + Scenarios. Compare Baseline vs Variant (inflation, spend, retirement age) and run monthly drawdown search for success targets (Optimistic/Realistic/Conservative). Charts overlay Monte Carlo percentiles for clarity.
- Historical: Upload/replace historical returns (IndexedDB); Yearly Returns chart with axes/hover; Sanity Stats table

## Commands
- Dev: `make dev`  → Vite dev server
- Build: `make build` → production bundle in `dist/`
- Preview: `make preview`
- Parser: `node scripts/parse_histret.mjs`
- Lint/Format/Test (placeholders wired via npm scripts)

## Project Structure
```
src/
  engine/         # alloc, schedule, sim, historical bootstrap
  importers/      # Monarch JSON importer
  components/     # Layout, charts, ScenarioOptions, FileUpload
  pages/          # Upload, Builder, Snapshot, Results, What‑Ifs, etc.
  state/          # AppContext, ThemeContext
  types/          # schema + engine + historical types
  styles.css      # base styles (theme via MUI)
examples/         # sample snapshot
data/             # historical_returns.json (generated)
scripts/          # parse_histret.mjs
```

## Privacy & Security
- No live account connections; uploads and simulation run locally.
- Historical data is static JSON and can be regenerated from provided spreadsheets.

## Roadmap / Next Steps
- Historical: Monthly series from Home Prices and Gold sheets; merge with annual returns
- Withdrawals/taxes: Guardrails/VPW policies; tax‑lot sale modeling; correlation tuning; taxes
- UI polish: Flows breakdown tooltips; minor style tightening and legend/format refinements
- Performance: Persist/cold‑start cache warming for common scenarios

## Contributing
- Keep changes focused and documented.
- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).
- See `docs/SESSION_SUMMARY.md` or `docs/session_start.md` for a working-session recap and current state.

## What’s New (Sep 2025)
- Unified What‑Ifs page (routes `/what-ifs`, `/scenarios`, `/sensitivity`).
- Results now include per‑year quantiles and Alive_Frac, Yearly Balance Sheet and Flows; CSV export; fixed NaN/zero collapse handling.
- Real estate modeling includes mortgage amortization and carrying costs; Social Security starts at claim age.
- Builder performance improvements and Holding Name field; Snapshot displays Ticker or Name fallback.
- MultiLineChart tooltip no longer crashes on undefined values.

---
Firedash is intended as a private planning tool; verify assumptions against your own data and risk preferences.
