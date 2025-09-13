# Firedash — FIRE Simulator & Portfolio Dashboard

Firedash is a private, web-based dashboard for planning Financial Independence / Retire Early (FIRE). It ingests a point-in-time snapshot of your assets, runs historical and Monte Carlo simulations with configurable assumptions, and presents results with interactive charts.

## Highlights
- Snapshot-based, no live account linking; all data local by default
- Monarch JSON importer with robust grouping (brokerage, crypto, other)
- Deterministic and Monte Carlo simulations (Bootstrap, Regime, GBM)
- Historical block bootstrap using long-run asset-class returns
- Real estate modeling (appreciation, mortgage, rental net flows)
- Interactive charts (fan chart, deterministic line, stacked by asset class)
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

- Results
  - Pick Monte Carlo mode (Bootstrap/Regime/GBM) in Scenario Options
  - Adjust Years, Paths, Rebalancing, Inflation, and (for Bootstrap) Block/Noise

## Simulation Modes
- Deterministic: Fixed real monthly returns from coarse annual means; useful as a baseline.
- Monte Carlo:
  - Bootstrap (recommended): Block‑bootstrap monthly returns from `data/historical_returns.json` to preserve realistic sequences (bear/flat/rebound). When the dataset is annual expanded to monthly, the engine detects it and adds calibrated monthly dispersion.
  - Regime: Markov chain across bull/bear/stagnation with persistent drawdowns, per‑asset mu/vol per regime.
  - GBM: Classic independent lognormal sampling per asset class.

## Historical Data
- Supplied via `data/historical_returns.json`. An example format is in `data/historical_returns.example.json`.
- Parser: `scripts/parse_histret.mjs` reads `histretSP.xls` (Damodaran’s “Returns by year”), converts annual returns to monthly, and writes the JSON. Run:
```
node scripts/parse_histret.mjs
```
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
- Builder: Import Monarch JSON; edit General/Retirement; Accounts/Holdings; Real Estate (with “Estimate” helper), Contributions, Expenses, Social Security; inline validation/tooltips; Load/Download
- Snapshot: KPI cards; global allocation pie; per‑account pies by ticker + holdings tables; rounded, right‑aligned values
- Results: Scenario Options (sliders/selects, MC mode, bootstrap tunables); charts (fan chart, deterministic line, stacked area); retirement marker; yearly percentile table

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
  pages/          # Upload, Builder, Snapshot, Results, etc.
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
- Monthly series from Home Prices and Gold sheets; merge with annual returns
- Replace window overrides (bootstrap block/noise) with context state
- IndexedDB import for historical data (in‑app upload), CSV/JSON support
- Withdrawal policies (guardrails/VPW), tax‑lot sale modeling, correlation tuning

## Contributing
- Keep changes focused and documented.
- Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).
- See `docs/SESSION_SUMMARY.md` for a working-session recap and key module notes.

---
Firedash is intended as a private planning tool; verify assumptions against your own data and risk preferences.

