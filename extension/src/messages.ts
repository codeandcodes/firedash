export const MessageType = {
  RequestCredentials: 'REQUEST_CREDENTIALS',
  DeliverCredentials: 'DELIVER_CREDENTIALS',
  FetchMonarchSnapshot: 'FETCH_MONARCH_SNAPSHOT',
  Ping: 'PING'
} as const

export type MessageTypeKey = (typeof MessageType)[keyof typeof MessageType]

export interface CredentialsPayload {
  token: string
  deviceUuid: string
  tokenExpiresAt?: string
}

export interface FetchSnapshotRequest {
  type: typeof MessageType.FetchMonarchSnapshot
  portfolioInput?: {
    startDate?: string
    endDate?: string
  }
}

export interface PingRequest {
  type: typeof MessageType.Ping
}

export interface FetchSnapshotSuccess {
  ok: true
  fetchedAt: string
  snapshot: unknown
  raw: unknown
  meta?: unknown
}

export interface FetchSnapshotError {
  ok: false
  error: string
}

export interface PingResponse {
  ok: true
  fetchedAt: string
}

export type ExternalRequest = FetchSnapshotRequest | PingRequest
export type ExternalResponse = FetchSnapshotSuccess | FetchSnapshotError | PingResponse

export interface RequestCredentialsMessage {
  type: typeof MessageType.RequestCredentials
}

export interface DeliverCredentialsMessage {
  type: typeof MessageType.DeliverCredentials
  payload?: CredentialsPayload
  error?: string
}

export type ContentScriptResponse = DeliverCredentialsMessage
