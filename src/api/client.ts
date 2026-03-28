import type {
  AppointmentsResponse,
  CustomerBriefingResponse,
  ContractsResponse,
  RemindersResponse,
} from '../types/api'

const API_URL =
  import.meta.env.VITE_API_URL ||
  'https://thejnigrwckubwdhsbwh.supabase.co/functions/v1/insurvision-briefing'

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
  const url = new URL(API_URL)
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

export async function getCustomerBriefing(customerId: string) {
  return fetchApi<CustomerBriefingResponse>('customer-briefing', {
    customer_id: customerId,
  })
}

export async function getCustomerContracts(customerId: string) {
  return fetchApi<ContractsResponse>('customer-contracts', {
    customer_id: customerId,
  })
}

export async function getCustomerReminders(customerId: string) {
  return fetchApi<RemindersResponse>('customer-reminders', {
    customer_id: customerId,
  })
}

/** Test API connection — returns true if key is valid */
export async function testConnection(): Promise<boolean> {
  try {
    await getNextAppointments(1)
    return true
  } catch {
    return false
  }
}
