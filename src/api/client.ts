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

/** Test API connection — returns true if key is valid */
export async function testConnection(): Promise<boolean> {
  try {
    await getProviderInfo()
    return true
  } catch {
    return false
  }
}
