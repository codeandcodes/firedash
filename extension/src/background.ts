import { importMonarchInvestments, buildSnapshotFromImport } from '../../src/importers/monarch'
import {
  MessageType,
  type CredentialsPayload,
  type ExternalRequest,
  type ExternalResponse,
  type FetchSnapshotSuccess,
  type PingResponse
} from './messages'

const GRAPHQL_ENDPOINT = 'https://api.monarchmoney.com/graphql'

console.log('[Firedash Extension] Service worker initialized');

const WEB_GET_PORTFOLIO_QUERY = `query Web_GetPortfolio($portfolioInput: PortfolioInput) {
  portfolio(input: $portfolioInput) {
    performance {
      totalValue
      totalBasis
      totalChangePercent
      totalChangeDollars
      oneDayChangePercent
      historicalChart {
        date
        returnPercent
        __typename
      }
      benchmarks {
        security {
          id
          ticker
          name
          oneDayChangePercent
          __typename
        }
        historicalChart {
          date
          returnPercent
          __typename
        }
        __typename
      }
      __typename
    }
    aggregateHoldings {
      edges {
        node {
          id
          quantity
          basis
          totalValue
          securityPriceChangeDollars
          securityPriceChangePercent
          lastSyncedAt
          holdings {
            id
            type
            typeDisplay
            name
            ticker
            closingPrice
            closingPriceUpdatedAt
            quantity
            value
            account {
              id
              mask
              icon
              logoUrl
              institution {
                id
                name
                __typename
              }
              type {
                name
                display
                __typename
              }
              subtype {
                name
                display
                __typename
              }
              displayName
              currentBalance
              __typename
            }
            __typename
          }
          security {
            id
            name
            ticker
            currentPrice
            currentPriceUpdatedAt
            closingPrice
            type
            typeDisplay
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}`

const WEB_GET_ACCOUNTS_QUERY = `query Web_GetAccountsPageRecentBalance($startDate: Date) {
  accounts {
    id
    name
    recentBalances(startDate: $startDate) {
      balance
      date
      __typename
    }
    type {
      name
      display
      group
      __typename
    }
    includeInNetWorth
    __typename
  }
}`

interface DateRange {
  startDate: string
  endDate: string
}

let cachedCredentials: CredentialsPayload | null = null
let lastMonarchTabId: number | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve(tabs)
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response: T) => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve(response)
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function setStorage(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(values, () => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve()
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function removeStorage(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(key, () => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve()
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}


async function ensureContentScript(tabId: number): Promise<void> {
  if (!chrome.scripting?.executeScript) {
    console.warn('[Firedash Extension] Scripting API unavailable; cannot reinject content script')
    return
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content-script.js']
    })
    console.log('[Firedash Extension] Ensured content script injected', tabId)
  } catch (err) {
    console.warn('[Firedash Extension] Failed to inject content script', err)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

chrome.runtime.onMessageExternal.addListener((message: ExternalRequest, sender, sendResponse) => {
  console.log('[Firedash Extension] Received external message', message?.type, sender.origin)
  if (!message) {
    sendResponse({ ok: false, error: 'No message payload received' })
    return false
  }
  if (message.type === MessageType.Ping) {
    console.log('[Firedash Extension] Responding to ping')
    sendResponse({ ok: true, fetchedAt: new Date().toISOString() } as PingResponse)
    return false
  }
  if (message.type !== MessageType.FetchMonarchSnapshot) {
    sendResponse({ ok: false, error: 'Unsupported message type' })
    return false
  }
  handleFetchSnapshot(message)
    .then((response) => sendResponse(response))
    .catch((err) => {
      const errorResponse: ExternalResponse = { ok: false, error: err instanceof Error ? err.message : String(err) }
      console.error('[Firedash Extension] Fetch snapshot failed', err)
      sendResponse(errorResponse)
    })
  return true
})

async function handleFetchSnapshot(message: ExternalRequest): Promise<FetchSnapshotSuccess> {
  if (message.type !== MessageType.FetchMonarchSnapshot) {
    throw new Error('Invalid fetch request payload')
  }
  console.log('[Firedash Extension] Handling fetch snapshot request')
  const credentials = await ensureCredentials()
  const dateRange = resolveDateRange(message.portfolioInput)
  const payload = await fetchPortfolio(credentials, dateRange)
  const accountsPayload = await fetchAccounts(credentials, dateRange.startDate)
  const importResult = importMonarchInvestments(payload, accountsPayload)
  const snapshot = buildSnapshotFromImport(importResult)
  const fetchedAt = new Date().toISOString()
  await setStorage({
    'firedash:lastSnapshot': {
      fetchedAt,
      snapshot,
      meta: importResult.meta,
      raw: { portfolio: payload, accounts: accountsPayload }
    }
  })
  console.log('[Firedash Extension] Snapshot ready', { fetchedAt, positions: importResult.meta.positions, accounts: importResult.meta.accounts })
  return { ok: true, fetchedAt, snapshot, raw: { portfolio: payload, accounts: accountsPayload }, meta: importResult.meta }
}

function resolveDateRange(input?: { startDate?: string; endDate?: string }): DateRange {
  if (input?.startDate && input?.endDate) {
    console.log('[Firedash Extension] Using provided date range', input)
    return { startDate: input.startDate, endDate: input.endDate }
  }
  const end = new Date()
  const start = new Date(end)
  start.setMonth(start.getMonth() - 1)
  const range = { startDate: formatIsoDate(start), endDate: formatIsoDate(end) }
  console.log('[Firedash Extension] Defaulting date range', range)
  return range
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function ensureCredentials(): Promise<CredentialsPayload> {
  if (cachedCredentials && !isExpired(cachedCredentials)) {
    console.log('[Firedash Extension] Using cached credentials')
    return cachedCredentials
  }
  console.log('[Firedash Extension] Requesting fresh credentials from content script')
  const creds = await requestCredentialsFromContentScript()
  cachedCredentials = creds
  return creds
}

function isExpired(creds: CredentialsPayload): boolean {
  if (!creds.tokenExpiresAt) return false
  const expiry = Number(new Date(creds.tokenExpiresAt))
  if (Number.isNaN(expiry)) return false
  const now = Date.now()
  return now > expiry - 60_000
}

async function requestCredentialsFromContentScript(): Promise<CredentialsPayload> {
  const monarchTabId = await locateMonarchTab()
  await ensureContentScript(monarchTabId)
  let response: { payload?: CredentialsPayload; error?: string } | undefined
  try {
    response = await sendMessageToTab<{ payload?: CredentialsPayload; error?: string }>(monarchTabId, { type: MessageType.RequestCredentials })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Receiving end does not exist')) {
      console.warn('[Firedash Extension] Content script not ready; reinjecting', message)
      await delay(100)
      await ensureContentScript(monarchTabId)
      response = await sendMessageToTab<{ payload?: CredentialsPayload; error?: string }>(monarchTabId, { type: MessageType.RequestCredentials })
    } else {
      throw err
    }
  }
  if (!response || typeof response !== 'object') {
    throw new Error('Failed to retrieve Monarch credentials from content script')
  }
  const { payload, error } = response
  if (!payload) {
    throw new Error(error || 'No credentials provided. Ensure you are logged into Monarch.')
  }
  if (!payload.token || !payload.deviceUuid) {
    throw new Error('Incomplete Monarch credentials received from content script')
  }
  console.log('[Firedash Extension] Received credentials from content script', { tokenPreview: payload.token.slice(0, 6), tokenExpiresAt: payload.tokenExpiresAt })
  return payload
}

async function locateMonarchTab(): Promise<number> {
  const tabs = await queryTabs({ url: 'https://app.monarchmoney.com/*' })
  const tab = tabs.find((t) => typeof t.id === 'number')
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('Open Monarch Money in Chrome before requesting live data')
  }
  lastMonarchTabId = tab.id
  console.log('[Firedash Extension] Located Monarch tab', tab.id)
  return tab.id
}

interface ScriptFetchResult {
  ok: boolean
  status?: number
  text?: string
  error?: string
}

async function fetchPortfolio(credentials: CredentialsPayload, range: DateRange): Promise<unknown> {
  console.log('[Firedash Extension] Fetching portfolio range', range)
  const tabId = lastMonarchTabId ?? (await locateMonarchTab())
  await ensureContentScript(tabId)
  const body = JSON.stringify({
    operationName: 'Web_GetPortfolio',
    variables: { portfolioInput: range },
    query: WEB_GET_PORTFOLIO_QUERY
  })
  const headers = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    authorization: `Token ${credentials.token}`,
    'client-platform': 'web',
    'content-type': 'application/json',
    'device-uuid': credentials.deviceUuid
  } as Record<string, string>

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (endpoint: string, requestHeaders: Record<string, string>, requestBody: string): Promise<ScriptFetchResult> => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: requestHeaders,
          body: requestBody
        })
        const text = await response.text()
        return { ok: response.ok, status: response.status, text }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    args: [GRAPHQL_ENDPOINT, headers, body]
  })

  const result = execution?.result as ScriptFetchResult | undefined
  if (!result) {
    throw new Error('No response from injected fetch')
  }
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      console.warn('[Firedash Extension] Monarch auth rejected injected request', result.status)
      cachedCredentials = null
      throw new Error('Monarch authentication failed. Refresh the Monarch tab and try again.')
    }
    console.error('[Firedash Extension] Injected fetch failed', result.status, result.error || result.text)
    throw new Error(`Monarch request failed (${result.status ?? 'unknown'}): ${result.error || result.text || 'Unknown error'}`)
  }

  let payload: unknown
  try {
    payload = result.text ? JSON.parse(result.text) : undefined
  } catch (err) {
    console.error('[Firedash Extension] Failed to parse portfolio response', err, result.text)
    throw new Error('Failed to parse Monarch response JSON')
  }

  console.log('[Firedash Extension] Portfolio fetch completed')
  const data = payload as any
  if (data?.errors?.length) {
    const message = data.errors.map((err: { message?: string }) => err?.message || 'Unknown error').join('; ')
    console.error('[Firedash Extension] Monarch GraphQL error', message)
    throw new Error(`Monarch returned GraphQL errors: ${message}`)
  }
  if (!data?.data?.portfolio?.aggregateHoldings) {
    throw new Error('Monarch response did not contain aggregate holdings data')
  }
  return data
}

async function fetchAccounts(credentials: CredentialsPayload, startDate: string): Promise<unknown> {
  console.log('[Firedash Extension] Fetching account balances', startDate)
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      authorization: `Token ${credentials.token}`,
      'cache-control': 'no-cache',
      'client-platform': 'web',
      'content-type': 'application/json',
      'device-uuid': credentials.deviceUuid,
      pragma: 'no-cache'
    },
    body: JSON.stringify({
      operationName: 'Web_GetAccountsPageRecentBalance',
      variables: { startDate },
      query: WEB_GET_ACCOUNTS_QUERY
    })
  })

  if (!response.ok) {
    const bodyText = await response.text()
    if (response.status === 401 || response.status === 403) {
      console.warn('[Firedash Extension] Accounts fetch auth failure', response.status)
      cachedCredentials = null
      throw new Error('Monarch authentication failed. Refresh the Monarch tab and try again.')
    }
    console.error('[Firedash Extension] Accounts request failed', response.status, bodyText)
    throw new Error(`Monarch accounts request failed (${response.status}): ${bodyText || response.statusText}`)
  }

  const payload = await response.json()
  if (payload?.errors?.length) {
    const message = payload.errors.map((err: { message?: string }) => err?.message || 'Unknown error').join('; ')
    console.error('[Firedash Extension] Accounts GraphQL error', message)
    throw new Error(`Monarch returned GraphQL errors for accounts: ${message}`)
  }
  return payload
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'RESET_MONARCH_CACHE') {
    cachedCredentials = null
    console.log('[Firedash Extension] Resetting cached snapshot and credentials')
    removeStorage('firedash:lastSnapshot')
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[Firedash Extension] Failed to reset cache', err)
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
      })
    return true
  }
  return undefined
})
