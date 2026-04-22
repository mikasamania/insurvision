import type {
  AppointmentsResponse,
  VisionContactBriefing,
  DealsResponse,
  TasksResponse,
  ProviderInfo,
  NearbyCustomersResponse,
  CustomerSearchResponse,
  CommunicationsResponse,
} from '../types/api'

const DEFAULT_API_URL =
  'https://thejnigrwckubwdhsbwh.supabase.co/functions/v1/insurvision-api'

// In-Memory Cache für sync Zugriff in fetchApi()
// Wird von warmApiCredentialCache() befüllt aus dem Bridge-Storage.
let cachedApiKey: string | null = null
let cachedApiUrl: string | null = null

/**
 * Initialisiere den API-Credential-Cache einmalig beim App-Start.
 * Liest den Key aus dem Bridge-Storage (mit Fallback) und cached ihn
 * für synchrone Zugriffe in fetchApi().
 */
export async function warmApiCredentialCache(): Promise<void> {
  const { getStorage } = await import('../utils/bridge-storage')
  cachedApiKey = await getStorage('insurvision_api_key', import.meta.env.VITE_API_KEY)
  cachedApiUrl = await getStorage('insurvision_api_url', import.meta.env.VITE_API_URL)
}

function getApiUrl(): string {
  // Cache zuerst, dann localStorage, dann env, dann Default
  if (cachedApiUrl) return cachedApiUrl
  return (
    (typeof window !== 'undefined' && window.localStorage?.getItem('insurvision_api_url')) ||
    import.meta.env.VITE_API_URL ||
    DEFAULT_API_URL
  )
}

function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey
  return (
    (typeof window !== 'undefined' && window.localStorage?.getItem('insurvision_api_key')) ||
    import.meta.env.VITE_API_KEY ||
    ''
  )
}

function timeout<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms))
}

async function fetchApi<T>(
  action: string,
  params: Record<string, string> = {},
  timeoutMs = 8000
): Promise<T> {
  const url = new URL(getApiUrl())
  url.searchParams.set('action', action)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const fetchPromise = fetch(url.toString(), {
    headers: {
      'X-Vision-Key': getApiKey(),
      'Content-Type': 'application/json',
    },
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API ${response.status}: ${text}`)
    }
    return response.json() as Promise<T>
  })

  return Promise.race([fetchPromise, timeout<T>(timeoutMs, action)])
}

export async function getNextAppointments(limit = 5) {
  return fetchApi<AppointmentsResponse>('next-appointments', {
    limit: String(limit),
  })
}

export async function getContactBriefing(contactId: string) {
  return fetchApi<VisionContactBriefing>('contact-briefing', {
    contact_id: contactId,
  })
}

/** Fetch AI-prepared briefing (falls back to live briefing) */
export async function getPreparedBriefing(contactId: string) {
  return fetchApi<VisionContactBriefing & { ai_hints?: string; prepared_at?: string }>(
    'prepared-briefing',
    { contact_id: contactId }
  )
}

export async function getContactDeals(contactId: string) {
  return fetchApi<DealsResponse>('contact-deals', {
    contact_id: contactId,
  })
}

export async function getContactTasks(contactId: string) {
  return fetchApi<TasksResponse>('contact-tasks', {
    contact_id: contactId,
  })
}

export async function getProviderInfo() {
  return fetchApi<ProviderInfo>('provider-info')
}

/** Nearby customers based on GPS coordinates */
export async function getNearbyCustomers(lat: number, lng: number, radiusKm = 25, limit = 15) {
  return fetchApi<NearbyCustomersResponse>('nearby-customers', {
    lat: String(lat),
    lng: String(lng),
    radius_km: String(radiusKm),
    limit: String(limit),
  })
}

/** Search customers by name */
export async function searchCustomers(query: string, limit = 10) {
  return fetchApi<CustomerSearchResponse>('search-customers', {
    q: query,
    limit: String(limit),
  })
}

/** Customer communications history */
export async function getContactCommunications(contactId: string, limit = 10) {
  return fetchApi<CommunicationsResponse>('contact-communications', {
    contact_id: contactId,
    limit: String(limit),
  })
}

// ── POST helper (for consultation endpoints with body data) ──

async function postApi<T>(
  action: string,
  body: Record<string, unknown>,
  timeoutMs = 15000
): Promise<T> {
  const url = new URL(getApiUrl())
  url.searchParams.set('action', action)

  const fetchPromise = fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-Vision-Key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API ${response.status}: ${text}`)
    }
    return response.json() as Promise<T>
  })

  return Promise.race([fetchPromise, timeout<T>(timeoutMs, action)])
}

// ── Phase 2: Consultation endpoints ──

export interface STTConfig {
  provider: string
  apiKey: string
  language: string
  model: string
}

/** Get STT configuration (Deepgram API key etc.) */
export async function getSTTConfig() {
  return fetchApi<STTConfig>('get-stt-config')
}

export interface CoachingResponse {
  hints: string[]
  coaching_text: string
}

/** Get AI coaching hints during a consultation */
export async function getCoachingHints(contactId: string, transcriptChunk: string) {
  return postApi<CoachingResponse>('consultation-coaching', {
    contact_id: contactId,
    transcript_chunk: transcriptChunk,
  })
}

export interface SaveConsultationRequest {
  contact_id: string
  transcript: string
  duration_seconds: number
  session_id: string
  process_id?: string
  process_title?: string
}

export interface SaveConsultationResponse {
  ok: boolean
  process_id: string
  entry_id: string
  summary: string
  topics: string[]
}

/** Save consultation with transcript, creates process entry + communication */
export async function saveConsultation(data: SaveConsultationRequest) {
  return postApi<SaveConsultationResponse>('save-consultation', data as unknown as Record<string, unknown>, 30000)
}

export interface ProcessListItem {
  id: string
  title: string
  status: string
  process_type: string
  updated_at: string
}

/** List open processes for a customer (for process selection) */
export async function listProcesses(contactId: string, limit = 5) {
  return fetchApi<{ processes: ProcessListItem[] }>('list-processes', {
    contact_id: contactId,
    limit: String(limit),
  })
}

/** Full connection status from API */
export interface ConnectionStatus {
  provider: string
  provider_name: string
  connected: boolean
  token_valid: boolean
  token_expires_in_minutes: number | null
  features: {
    has_insurance_data: boolean
    has_commission_data: boolean
    has_prepared_briefings: boolean
    has_deal_stages: boolean
    currency: string
  }
  connection_name: string
  last_sync: string | null
  refresh_error: string | null
}

export async function getConnectionStatus() {
  return fetchApi<ConnectionStatus>('connection-status')
}

/** Test API connection — returns true if key is valid */
export async function testConnection(): Promise<boolean> {
  try {
    await getConnectionStatus()
    return true
  } catch {
    return false
  }
}

/** Save QR-scanned config to Bridge-Storage + localStorage */
export async function saveQRConfig(data: { key: string; url: string }): Promise<void> {
  const { setStorage } = await import('../utils/bridge-storage')
  await setStorage('insurvision_api_key', data.key)
  if (data.url) await setStorage('insurvision_api_url', data.url)
}

/** Clear all stored config */
export async function clearConfig(): Promise<void> {
  const { removeStorage } = await import('../utils/bridge-storage')
  await removeStorage('insurvision_api_key')
  await removeStorage('insurvision_api_url')
}
