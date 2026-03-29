// ============================================================
// InsurVision Unified Data Model (CRM-agnostic)
// Mirrors the backend adapter interface
// ============================================================

export interface VisionAppointment {
  id: string
  title: string
  start_time: string
  end_time: string | null
  location: string | null
  notes: string | null
  contact: {
    id: string
    name: string
    company: string | null
    category: string | null
  } | null
}

export interface VisionContactBriefing {
  contact: {
    id: string
    name: string
    company: string | null
    email: string | null
    phone: string | null
    title: string | null
    category: string | null
    since: string | null
    custom_fields: Record<string, string>
  }
  deals: {
    total: number
    total_value: number
    currency: string
    by_stage: Array<{
      stage: string
      count: number
      value: number
    }>
  }
  open_tasks: number
  open_tickets: number
  last_interaction: {
    date: string
    type: string
    summary: string | null
  } | null
  insurance?: {
    annual_premium: number | null
    annual_commission: number | null
    contracts_by_category: Array<{
      category: string
      count: number
      premium: number
    }> | null
  } | null
}

export interface VisionDeal {
  id: string
  name: string
  stage: string
  value: number
  currency: string
  close_date: string | null
  insurer: string | null
  policy_number: string | null
  category: string | null
}

export interface VisionTask {
  id: string
  title: string
  due_date: string | null
  priority: 'high' | 'medium' | 'low'
  status: string
  notes: string | null
}

export interface AppointmentsResponse {
  appointments: VisionAppointment[]
}

export interface DealsResponse {
  deals: VisionDeal[]
}

export interface TasksResponse {
  tasks: VisionTask[]
}

export interface ProviderInfo {
  provider: string
  features: {
    has_insurance_data: boolean
    has_commission_data: boolean
    has_prepared_briefings?: boolean
    currency: string
  }
}

export interface PreparedBriefing extends VisionContactBriefing {
  ai_hints?: string
  context?: string
  prepared_at?: string
}

// ---- Nearby Customers (geo-based) ----
export interface NearbyCustomer {
  id: string
  name: string
  company: string | null
  city: string | null
  street: string | null
  distance_km: number
  category: string | null
  contracts_count: number
  annual_premium: number
  last_interaction: string | null
  open_tasks: number
}

export interface NearbyCustomersResponse {
  customers: NearbyCustomer[]
  location: { lat: number; lng: number }
}

// ---- Customer Search ----
export interface CustomerSearchResult {
  id: string
  name: string
  company: string | null
  city: string | null
  category: string | null
}

export interface CustomerSearchResponse {
  results: CustomerSearchResult[]
}

// ---- Communications ----
export interface VisionCommunication {
  id: string
  type: string        // email, phone, whatsapp, note, letter
  direction: string   // inbound, outbound
  subject: string | null
  date: string
  preview: string | null
}

export interface CommunicationsResponse {
  communications: VisionCommunication[]
}

// ---- Processes (for consultation save) ----
export interface ProcessListItem {
  id: string
  title: string
  status: string
  process_type: string
  updated_at: string
}
