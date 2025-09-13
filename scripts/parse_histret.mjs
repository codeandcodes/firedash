import fs from 'node:fs'
import path from 'node:path'
import xlsx from 'xlsx'

const INPUT = path.resolve(process.cwd(), 'histretSP.xls')
const OUT = path.resolve(process.cwd(), 'data', 'historical_returns.json')

function readWorkbook(file) {
  const wb = xlsx.readFile(file)
  // pick the sheet with most rows
  let best = null
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name]
    const json = xlsx.utils.sheet_to_json(sh, { defval: null })
    if (!best || json.length > best.rows.length) best = { name, rows: json }
  }
  return best
}

function normalizeHeaders(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const nk = String(k).trim().toLowerCase().replace(/\s+/g, '_')
    out[nk] = v
  }
  return out
}

function findDate(row) {
  // prefer year+month
  if ((row.year || row.yr) && (row.month || row.mo || row.m)) {
    const y = Number(row.year || row.yr)
    const m = Number(row.month || row.mo || row.m)
    if (!Number.isNaN(y) && !Number.isNaN(m)) return { year: y, month: m }
  }
  // single date
  for (const key of ['date','period','dt']) {
    if (row[key]) {
      const d = new Date(row[key])
      if (!Number.isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 }
    }
  }
  return null
}

function pickCols(headers) {
  const map = {
    stock: [/stock/, /s&p/, /sp500/, /sp_?500/, /equity/, /total_return_stock/],
    intl: [/intl/, /international/],
    bond: [/bond/, /treasury/, /ten.?year/, /10.?y/],
    reit: [/reit/],
    cash: [/tbill/, /cash/, /t.?bill/],
    home: [/home/, /house/, /real\s?estate/, /case.?shiller/],
    gold: [/gold/]
  }
  return { headers, map }
}

function isReturnHeader(h) {
  return /ret|return/.test(h) || /_r$/.test(h)
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('Input Excel not found:', INPUT)
    process.exit(1)
  }
  const wb = xlsx.readFile(INPUT)
  const sh = wb.Sheets['Returns by year']
  if (!sh) {
    console.error('Sheet "Returns by year" not found. Aborting.')
    process.exit(1)
  }
  const raw = xlsx.utils.sheet_to_json(sh, { defval: null, raw: false })
  // Find header row with labels of assets
  let headerIdx = -1
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const vals = Object.values(row).filter(Boolean).map((s) => String(s).toLowerCase())
    if (vals.some((v) => v.includes('s&p 500')) && vals.some((v) => v.includes('t.bill')) && vals.some((v) => v.includes('t. bond'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    console.error('Could not locate header row in "Returns by year"')
    process.exit(1)
  }
  const headerRow = raw[headerIdx]
  const cols = Object.keys(headerRow)
  // Map target assets to column keys by fuzzy match
  function findCol(patterns) {
    for (const c of cols) {
      const label = String(headerRow[c] || '').toLowerCase()
      if (patterns.some((re) => re.test(label))) return c
    }
    return null
  }
  const colYear = cols.find((c) => String(headerRow[c]).toLowerCase().includes('year')) || 'Date updated:'
  const colStock = findCol([/s&p\s*500.*includes dividends/, /s&p\s*500.*total/, /stocks?.*includes/]) || findCol([/stocks?\b/])
  const colBond = findCol([/us\s*t\.?\s*bond/, /treasury\s*bond/])
  const colTbill = findCol([/3-?month\s*t\.?bill/, /t\.?\s*bill/])
  const colReit = findCol([/real\s*estate/, /reit/])
  const colGold = findCol([/gold/])

  const outRows = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i]
    const yStr = (row[colYear] || '').toString().trim()
    const year = Number(yStr)
    if (!Number.isFinite(year)) continue
    function parsePct(v) {
      if (v == null) return undefined
      const s = String(v).replace(/[%,$\s]/g, '')
      const n = Number(s)
      if (!Number.isFinite(n)) return undefined
      return n / 100
    }
    const retAnnual = {}
    if (colStock) retAnnual.US_STOCK = parsePct(row[colStock])
    if (colBond) retAnnual.BONDS = parsePct(row[colBond])
    if (colTbill) retAnnual.CASH = parsePct(row[colTbill])
    if (colReit) retAnnual.REAL_ESTATE = parsePct(row[colReit])
    if (colGold) retAnnual.GOLD = parsePct(row[colGold])
    // Convert to monthly by spreading equally over 12 months (approx: geometric)
    const monthly = {}
    for (const [k, v] of Object.entries(retAnnual)) {
      if (typeof v === 'number') monthly[k] = Math.pow(1 + v, 1 / 12) - 1
    }
    for (let m = 1; m <= 12; m++) {
      outRows.push({ year, month: m, returns: monthly })
    }
  }

  const dataset = { meta: { source: path.basename(INPUT), notes: 'Parsed from "Returns by year" (annual → monthly geometric). Please review.' }, rows: outRows }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2))
  console.log('Wrote', OUT, 'rows:', outRows.length, 'from sheet: Returns by year')
}

main()
