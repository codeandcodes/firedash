import type { HistoricalDataset } from '@types/historical'

const DB_NAME = 'firedash'
const STORE = 'historical'
const KEY = 'active'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHistoricalDataset(ds: HistoricalDataset): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const req = st.put(ds as any, KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getHistoricalDataset(): Promise<HistoricalDataset | null> {
  const db = await openDB()
  return await new Promise<HistoricalDataset | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const req = st.get(KEY)
    req.onsuccess = () => resolve((req.result as HistoricalDataset) || null)
    req.onerror = () => reject(req.error)
  })
}

export async function clearHistoricalDataset(): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const req = st.delete(KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

