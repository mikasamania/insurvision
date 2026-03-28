import type { EvenAppBridge } from '../types/bridge'
import type {
  Appointment,
  CustomerBriefingResponse,
  Contract,
  Reminder,
} from '../types/api'
import {
  getCustomerBriefing,
  getCustomerContracts,
  getCustomerReminders,
} from '../api/client'
import {
  showAppointmentPage,
  getAppointmentPageCount,
} from '../pages/appointments'
import { showBriefing } from '../pages/briefing'
import { showContractPage, getContractPageCount } from '../pages/contracts'
import { showReminderPage, getReminderPageCount } from '../pages/reminders'

type Screen =
  | 'appointments'
  | 'briefing'
  | 'contracts'
  | 'reminders'

interface RouterState {
  screen: Screen
  appointments: Appointment[]
  selectedAppointmentIndex: number
  appointmentPage: number
  briefing: CustomerBriefingResponse | null
  contracts: Contract[]
  contractPage: number
  reminders: Reminder[]
  reminderPage: number
}

export class Router {
  private state: RouterState
  private bridge: EvenAppBridge

  constructor(bridge: EvenAppBridge, appointments: Appointment[]) {
    this.bridge = bridge
    this.state = {
      screen: 'appointments',
      appointments,
      selectedAppointmentIndex: 0,
      appointmentPage: 0,
      briefing: null,
      contracts: [],
      contractPage: 0,
      reminders: [],
      reminderPage: 0,
    }

    // Register input handlers
    bridge.onTouchEvent((event) => {
      if (event === 'tap_right') this.onRight()
      if (event === 'tap_left') this.onLeft()
    })

    bridge.onRingEvent((event) => {
      if (event === 'swipe_forward') this.onRight()
      if (event === 'swipe_back') this.onLeft()
    })
  }

  async show(): Promise<void> {
    await this.render()
  }

  private async render(): Promise<void> {
    const s = this.state
    switch (s.screen) {
      case 'appointments':
        await showAppointmentPage(this.bridge, s.appointments, s.appointmentPage)
        break
      case 'briefing':
        if (s.briefing) await showBriefing(this.bridge, s.briefing)
        break
      case 'contracts':
        await showContractPage(this.bridge, s.contracts, s.contractPage)
        break
      case 'reminders':
        await showReminderPage(this.bridge, s.reminders, s.reminderPage)
        break
    }
  }

  private async onRight(): Promise<void> {
    const s = this.state

    switch (s.screen) {
      case 'appointments': {
        const totalPages = getAppointmentPageCount(s.appointments)
        // If there are more appointment pages, go to next page
        if (s.appointmentPage < totalPages - 1) {
          s.appointmentPage++
          s.selectedAppointmentIndex = s.appointmentPage * 2
        } else {
          // Select current appointment and load briefing
          const apt = s.appointments[s.selectedAppointmentIndex]
          if (apt?.customer?.id) {
            await this.loadBriefing(apt.customer.id)
          }
        }
        break
      }
      case 'briefing': {
        // Go to contracts
        const customerId = this.getCurrentCustomerId()
        if (customerId && s.contracts.length === 0) {
          await this.loadContracts(customerId)
        }
        s.screen = 'contracts'
        s.contractPage = 0
        break
      }
      case 'contracts': {
        const totalPages = getContractPageCount(s.contracts)
        if (s.contractPage < totalPages - 1) {
          s.contractPage++
        } else {
          // Go to reminders
          const customerId = this.getCurrentCustomerId()
          if (customerId && s.reminders.length === 0) {
            await this.loadReminders(customerId)
          }
          s.screen = 'reminders'
          s.reminderPage = 0
        }
        break
      }
      case 'reminders': {
        const totalPages = getReminderPageCount(s.reminders)
        if (s.reminderPage < totalPages - 1) {
          s.reminderPage++
        }
        // At end of reminders — do nothing (stay)
        break
      }
    }

    await this.render()
  }

  private async onLeft(): Promise<void> {
    const s = this.state

    switch (s.screen) {
      case 'appointments':
        if (s.appointmentPage > 0) {
          s.appointmentPage--
          s.selectedAppointmentIndex = s.appointmentPage * 2
        }
        break
      case 'briefing':
        s.screen = 'appointments'
        break
      case 'contracts':
        if (s.contractPage > 0) {
          s.contractPage--
        } else {
          s.screen = 'briefing'
        }
        break
      case 'reminders':
        if (s.reminderPage > 0) {
          s.reminderPage--
        } else {
          s.screen = 'contracts'
          s.contractPage = 0
        }
        break
    }

    await this.render()
  }

  private getCurrentCustomerId(): string | null {
    const apt = this.state.appointments[this.state.selectedAppointmentIndex]
    return apt?.customer?.id || null
  }

  private async loadBriefing(customerId: string): Promise<void> {
    try {
      this.state.briefing = await getCustomerBriefing(customerId)
      this.state.screen = 'briefing'
    } catch (e) {
      console.error('Failed to load briefing:', e)
    }
  }

  private async loadContracts(customerId: string): Promise<void> {
    try {
      const res = await getCustomerContracts(customerId)
      this.state.contracts = res.contracts
    } catch (e) {
      console.error('Failed to load contracts:', e)
    }
  }

  private async loadReminders(customerId: string): Promise<void> {
    try {
      const res = await getCustomerReminders(customerId)
      this.state.reminders = res.reminders
    } catch (e) {
      console.error('Failed to load reminders:', e)
    }
  }
}
