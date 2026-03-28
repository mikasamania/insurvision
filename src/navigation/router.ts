import type { EvenAppBridge } from '../types/bridge'
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
} from '../types/api'
import {
  getContactBriefing,
  getContactDeals,
  getContactTasks,
} from '../api/client'
import {
  showAppointmentPage,
  getAppointmentPageCount,
} from '../pages/appointments'
import { showBriefing } from '../pages/briefing'
import { showDealPage, getDealPageCount } from '../pages/contracts'
import { showTaskPage, getTaskPageCount } from '../pages/reminders'

type Screen = 'appointments' | 'briefing' | 'deals' | 'tasks'

interface RouterState {
  screen: Screen
  provider: string
  isInsurance: boolean
  appointments: VisionAppointment[]
  selectedIndex: number
  appointmentPage: number
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  dealPage: number
  tasks: VisionTask[]
  taskPage: number
}

export class Router {
  private state: RouterState
  private bridge: EvenAppBridge

  constructor(
    bridge: EvenAppBridge,
    appointments: VisionAppointment[],
    provider: string
  ) {
    this.bridge = bridge
    this.state = {
      screen: 'appointments',
      provider,
      isInsurance: provider === 'insurcrm',
      appointments,
      selectedIndex: 0,
      appointmentPage: 0,
      briefing: null,
      deals: [],
      dealPage: 0,
      tasks: [],
      taskPage: 0,
    }

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
        if (s.briefing) await showBriefing(this.bridge, s.briefing, s.provider)
        break
      case 'deals':
        await showDealPage(this.bridge, s.deals, s.dealPage, s.isInsurance)
        break
      case 'tasks':
        await showTaskPage(this.bridge, s.tasks, s.taskPage, s.isInsurance)
        break
    }
  }

  private async onRight(): Promise<void> {
    const s = this.state

    switch (s.screen) {
      case 'appointments': {
        const totalPages = getAppointmentPageCount(s.appointments)
        if (s.appointmentPage < totalPages - 1) {
          s.appointmentPage++
          s.selectedIndex = s.appointmentPage * 2
        } else {
          const apt = s.appointments[s.selectedIndex]
          if (apt?.contact?.id) {
            await this.loadBriefing(apt.contact.id)
          }
        }
        break
      }
      case 'briefing': {
        const contactId = this.getCurrentContactId()
        if (contactId && s.deals.length === 0) {
          await this.loadDeals(contactId)
        }
        s.screen = 'deals'
        s.dealPage = 0
        break
      }
      case 'deals': {
        const totalPages = getDealPageCount(s.deals)
        if (s.dealPage < totalPages - 1) {
          s.dealPage++
        } else {
          const contactId = this.getCurrentContactId()
          if (contactId && s.tasks.length === 0) {
            await this.loadTasks(contactId)
          }
          s.screen = 'tasks'
          s.taskPage = 0
        }
        break
      }
      case 'tasks': {
        const totalPages = getTaskPageCount(s.tasks)
        if (s.taskPage < totalPages - 1) {
          s.taskPage++
        }
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
          s.selectedIndex = s.appointmentPage * 2
        }
        break
      case 'briefing':
        s.screen = 'appointments'
        break
      case 'deals':
        if (s.dealPage > 0) {
          s.dealPage--
        } else {
          s.screen = 'briefing'
        }
        break
      case 'tasks':
        if (s.taskPage > 0) {
          s.taskPage--
        } else {
          s.screen = 'deals'
          s.dealPage = 0
        }
        break
    }

    await this.render()
  }

  private getCurrentContactId(): string | null {
    const apt = this.state.appointments[this.state.selectedIndex]
    return apt?.contact?.id || null
  }

  private async loadBriefing(contactId: string): Promise<void> {
    try {
      this.state.briefing = await getContactBriefing(contactId)
      this.state.screen = 'briefing'
    } catch (e) {
      console.error('Failed to load briefing:', e)
    }
  }

  private async loadDeals(contactId: string): Promise<void> {
    try {
      const res = await getContactDeals(contactId)
      this.state.deals = res.deals
    } catch (e) {
      console.error('Failed to load deals:', e)
    }
  }

  private async loadTasks(contactId: string): Promise<void> {
    try {
      const res = await getContactTasks(contactId)
      this.state.tasks = res.tasks
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
  }
}
