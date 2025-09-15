# Session Start – Current State (Sep 15, 2025)

This snapshot captures what’s working now so you can resume quickly.

- Unified What‑Ifs page (aliases: `/what-ifs`, `/scenarios`, `/sensitivity`): baseline vs variant comparison and spend search for target success (50/75/90%).
- Results overhaul:
  - Per‑year quantiles (P10/P25/P50/P75/P90) of end balances and Alive_Frac (paths remaining).
  - Yearly Balance Sheet (CSV export with Alive_Frac) and Yearly Flows chart (returns+income above 0; expenditures below 0), retirement markers and row highlighting.
  - Progressive MC updates via P^2 estimators; robust to NaN/zero; depletion handling fills remainder with 0.
- Real estate + SS modeling:
  - Property cashflows include rent net, taxes/insurance/maintenance, and mortgage payments until payoff (amortization formula).
  - Social Security starts at claim age (not retirement date). Real Estate page shows amortization schedule + payoff sparkline.
- Builder/Snapshot polish: Monarch importer sets HoldingLot.name; Snapshot displays Ticker or Name; holdings pagination and lazy preview for large snapshots.
- Charts/UI polish: Fan chart and flows aligned widths; percentile selector near Scenario Options; MultiLineChart tooltip guards undefined.

Key files: `src/pages/WhatIfsPage.tsx`, `src/pages/ResultsPage.tsx`, `src/components/YearlyBalanceSheet.tsx`, `src/components/YearlyFlowsChart.tsx`, `src/engine/schedule.ts`, `src/engine/mortgage.ts`, `src/engine/sim.ts`, `src/importers/monarch.ts`.

See `docs/SESSION_SUMMARY.md` for the longer narrative and module notes.
