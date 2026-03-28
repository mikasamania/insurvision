import type {
  AppointmentsResponse,
  VisionContactBriefing,
  DealsResponse,
  TasksResponse,
  ProviderInfo,
} from '../types/api'

const DEFAULT_API_URL =
  'https://thejnigrwckubwdhsbwh.supabase.co/functions/v1/insurvision-api'

function getApiUrl(): string {
  return (
    localStorage.getItem('insurvision_api_url') ||
    import.meta.env.VITE_API_URL ||
    DEFAULT_API_URL
  )
}

function getApiKey(): string {
  return (
    localStorage.getItem('insurvision_api_key') ||
    import.meta.env.VITE_API_KEY ||
    ''
  )
}

async function fetchApi<T>(
  action: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(getApiUrl())
  url.searchParams.set('action', action)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const response = await fetch(url.toString(), {
    headers: {
      'X-Vision-Key': getApiKey(),
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text}`)
  }

  return response.json()
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

/** Save QR-scanned config to localStorage */
export function saveQRConfig(data: { key: string; url: string }): void {
  localStorage.setItem('insurvision_api_key', data.key)
  if (data.url) localStorage.setItem('insurvision_api_url', data.url)
}

/** Clear all stored config */
export function clearConfig(): void {
  localStorage.removeItem('insurvision_api_key')
  localStorage.removeItem('insurvision_api_url')
}
