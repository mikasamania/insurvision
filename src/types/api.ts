// API Response Types for InsurVision Edge Functions

export interface AppointmentCustomer {
  id: string
  name: string
  status: string
}

export interface Appointment {
  id: string
  title: string
  description: string | null
  due_date: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: string
  customer: AppointmentCustomer | null
}

export interface AppointmentsResponse {
  appointments: Appointment[]
}

export interface CustomerInfo {
  name: string
  company_name: string | null
  customer_type: string
  birth_date: string | null
  age: number | null
  phone: string | null
  email: string | null
  status: string
  since: string | null
}

export interface ContractCategory {
  category: string
  count: number
  premium: number
}

export interface ContractsSummary {
  total: number
  annual_premium: number
  by_category: ContractCategory[]
}

export interface LastInteraction {
  date: string
  type: string
}

export interface CustomerBriefingResponse {
  customer: CustomerInfo
  contracts: ContractsSummary
  open_claims: number
  open_tasks: number
  annual_commission: number
  last_interaction: LastInteraction | null
}

export interface Contract {
  id: string
  contract_number: string
  product_type: string
  category: string
  status: string
  premium: number
  payment_frequency: string
  start_date: string
  end_date: string | null
  insurer: string
}

export interface ContractsResponse {
  contracts: Contract[]
}

export interface Reminder {
  id: string
  title: string
  note: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: string
}

export interface RemindersResponse {
  reminders: Reminder[]
}
