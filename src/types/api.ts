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
    currency: string
  }
}
