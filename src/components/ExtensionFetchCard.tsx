import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import { validateSnapshot } from '@types/schema'
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'

const STORAGE_KEY = 'firedash.extensionId'
const FETCH_MESSAGE_TYPE = 'FETCH_MONARCH_SNAPSHOT'
const PING_MESSAGE_TYPE = 'PING'

type FetchResponse = {
  ok: boolean
  fetchedAt?: string
  snapshot?: any
  error?: string
  meta?: { positions?: number; accounts?: number; lastSyncedAt?: string }
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export function ExtensionFetchCard() {
  const [extensionId, setExtensionId] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [meta, setMeta] = useState<FetchResponse['meta']>()
  const { setSnapshot } = useApp() as any
  const navigate = useNavigate()

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setExtensionId(stored)
    }
  }, [])

  const runtimeAvailable = useMemo(() => typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage, [])

  async function fetchFromExtension() {
    if (!runtimeAvailable) {
      setStatus('error')
      setMessage('Chrome runtime API is unavailable. Use Chrome desktop with the extension installed.')
      return
    }
    if (!extensionId) {
      setStatus('error')
      setMessage('Enter the Chrome extension ID before fetching.')
      return
    }
    window.localStorage.setItem(STORAGE_KEY, extensionId)
    setStatus('loading')
    setMessage('Contacting Chrome extension...')
    setMeta(undefined)
    console.info('[Firedash] Initiating extension fetch', { extensionId })

    const ping = await sendMessage(extensionId, { type: PING_MESSAGE_TYPE })
    if (!ping.ok) {
      console.error('[Firedash] Extension ping failed', ping)
      setStatus('error')
      setMessage(ping.error || 'Extension did not respond. Check the ID and reload the extension.')
      return
    }
    console.info('[Firedash] Extension ping succeeded', ping)

    setMessage('Requesting data from Chrome extension...')
    const response = await sendMessage(extensionId, { type: FETCH_MESSAGE_TYPE })
    console.info('[Firedash] Extension fetch response', response)
    if (!response.ok) {
      setStatus('error')
      setMessage(response.error || 'Extension returned an unknown error')
      return
    }

    const validation = validateSnapshot(response.snapshot)
    if (!validation.valid) {
      setStatus('error')
      setMessage(`Extension snapshot failed validation: ${(validation.errors || []).join(', ')}`)
      return
    }

    setSnapshot(response.snapshot)
    setStatus('success')
    setMeta(response.meta)
    setMessage(buildSuccessMessage(response))
    navigate('/snapshot')
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h5" gutterBottom>Fetch Live Snapshot (Chrome Extension)</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Load Monarch holdings directly from the Chrome extension. Open Monarch in another tab, enter the extension ID below, then fetch.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
          <Box flex={1}>
            <TextField
              label="Extension ID"
              value={extensionId}
              onChange={(e) => setExtensionId(e.target.value.trim())}
              placeholder="e.g. abcdefghijklmnoabcdefghi"
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              Find this in <em>chrome://extensions</em> → Firedash Monarch Bridge → Details.
            </Typography>
          </Box>
          <Button variant="contained" onClick={fetchFromExtension} disabled={status === 'loading'}>
            {status === 'loading' ? 'Fetching…' : 'Fetch from Monarch'}
          </Button>
        </Stack>
        {status !== 'idle' && (
          <Alert severity={status === 'success' ? 'success' : 'error'} sx={{ mt: 2 }}>
            {message}
            {status === 'success' && meta && (
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                Imported {meta.positions ?? '—'} positions across {meta.accounts ?? '—'} accounts.
                {meta.lastSyncedAt ? ` Latest sync ${new Date(meta.lastSyncedAt).toLocaleString()}.` : ''}
              </Typography>
            )}
          </Alert>
        )}
        {!runtimeAvailable && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Chrome runtime API not detected. This feature only works when Firedash runs in Google Chrome (desktop).
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

async function sendMessage(extensionId: string, payload: any): Promise<FetchResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(extensionId, payload, (res: FetchResponse | undefined) => {
        const lastError = chrome.runtime.lastError
        if (lastError) {
          console.error('[Firedash] chrome.runtime.sendMessage error', lastError)
          resolve({ ok: false, error: lastError.message })
          return
        }
        if (!res) {
          console.error('[Firedash] No response from extension')
          resolve({ ok: false, error: 'No response from extension' })
          return
        }
        resolve(res)
      })
    } catch (err) {
      console.error('[Firedash] Failed to contact extension', err)
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

function buildSuccessMessage(response: FetchResponse): string {
  if (response.fetchedAt) {
    const ts = new Date(response.fetchedAt).toLocaleString()
    return `Snapshot fetched at ${ts}`
  }
  return 'Snapshot fetched from extension'
}
