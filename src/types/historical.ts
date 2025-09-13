export type HistAsset = 'US_STOCK' | 'INTL_STOCK' | 'BONDS' | 'REIT' | 'CASH' | 'REAL_ESTATE' | 'CRYPTO'

export interface HistoricalMonthRow {
  year: number
  month: number // 1-12
  returns: Partial<Record<HistAsset, number>> // monthly simple returns, e.g., 0.01 = 1%
}

export interface HistoricalDatasetMeta {
  source?: string
  notes?: string
}

export interface HistoricalDataset {
  meta?: HistoricalDatasetMeta
  rows: HistoricalMonthRow[]
}

