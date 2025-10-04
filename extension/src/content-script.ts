console.log('[Firedash Extension] Content script loaded');
import {
  MessageType,
  type ContentScriptResponse,
  type CredentialsPayload,
  type RequestCredentialsMessage
} from './messages'

chrome.runtime.onMessage.addListener((message: RequestCredentialsMessage, _sender, sendResponse) => {
  if (!message || message.type !== MessageType.RequestCredentials) {
    return undefined
  }
  console.log('[Firedash Extension] Request credentials message received')
  try {
    const payload = extractCredentials()
    const response: ContentScriptResponse = { type: MessageType.DeliverCredentials, payload }
    console.log('[Firedash Extension] Sending credentials to background', { tokenPreview: payload.token.slice(0, 6) })
    sendResponse(response)
  } catch (err) {
    console.error('[Firedash Extension] Failed to extract credentials', err)
    const response: ContentScriptResponse = {
      type: MessageType.DeliverCredentials,
      error: err instanceof Error ? err.message : String(err)
    }
    sendResponse(response)
  }
  return true
})

function extractCredentials(): CredentialsPayload {
  const tokenInfo = readTokenFromPersist()
  const deviceUuid = window.localStorage.getItem('monarchDeviceUUID')?.replace(/"/g, '')
  if (!tokenInfo?.token) {
    throw new Error('Monarch auth token not found. Reload Monarch and try again.')
  }
  if (!deviceUuid) {
    throw new Error('Monarch device UUID not found. Reload Monarch and try again.')
  }
  const result = {
    token: tokenInfo.token,
    deviceUuid,
    tokenExpiresAt: tokenInfo.tokenExpiresAt
  }
  console.log('[Firedash Extension] Extracted credentials', { tokenPreview: result.token.slice(0, 6), deviceUuid: result.deviceUuid })
  return result
}

function readTokenFromPersist(): { token?: string; tokenExpiresAt?: string } {
  const persistRoot = window.localStorage.getItem('persist:root')
  if (!persistRoot) {
    return {}
  }
  try {
    const parsedRoot = JSON.parse(persistRoot)
    const userSliceRaw = parsedRoot?.user ?? parsedRoot?.auth
    if (!userSliceRaw) {
      return {}
    }
    const userSlice = typeof userSliceRaw === 'string' ? safeJsonParse(userSliceRaw) : userSliceRaw
    const token = typeof userSlice?.token === 'string' ? userSlice.token : undefined
    const tokenExpiresAt = typeof userSlice?.tokenExpiration === 'string'
      ? userSlice.tokenExpiration
      : typeof userSlice?.tokenExpiresAt === 'string'
        ? userSlice.tokenExpiresAt
        : undefined
    return { token, tokenExpiresAt }
  } catch (err) {
    console.warn('Failed to parse persist:root', err)
    return {}
  }
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value)
  } catch (err) {
    console.warn('Failed to parse nested JSON', err)
    return undefined
  }
}
