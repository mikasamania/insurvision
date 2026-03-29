/**
 * InsurVision G2 Glasses Controller
 *
 * Uses even-toolkit's battle-tested bridge + event mapping.
 * Display modes:
 *   - Column mode (3 columns) for lists (nearby, appointments, deals)
 *   - Text mode for detail views (briefing)
 * Events via mapGlassEvent (handles G2 quirks, debounce, edge cases)
 */
import { EvenHubBridge } from 'even-toolkit/bridge'
import { mapGlassEvent } from 'even-toolkit/action-map'
import type { GlassAction } from 'even-toolkit/types'

import {
  getNextAppointments,
  getContactBriefing,
  getContactDeals,
  getContactTasks,
  getContactCommunications,
  getProviderInfo,
  getPreparedBriefing,
  getNearbyCustomers,
} from '../api/client'
import type {
  VisionAppointment,
  VisionContactBriefing,
  VisionDeal,
  VisionTask,
  VisionCommunication,
  NearbyCustomer,
} from '../types/api'
import { formatTime, formatDate, formatCurrency, formatAge, priorityIcon } from '../utils/formatter'
import { truncate } from '../utils/truncate'

type Screen = 'nearby' | 'appointments' | 'briefing' | 'deals' | 'comms' | 'tasks'

interface State {
  screen: Screen
  provider: string
  isInsurance: boolean
  cursor: number
  nearbyCustomers: NearbyCustomer[]
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  comms: VisionCommunication[]
  selectedContactId: string | null
}

// Column widths for 3-column layout (576px total)
const COL_CFG = [
  { x: 0, w: 140 },    // Col 1: indicator + short info
  { x: 140, w: 280 },  // Col 2: main text
  { x: 420, w: 156 },  // Col 3: values
]

function getGPS(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No GPS'))
    let done = false
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('GPS timeout')) } }, 5000)
    navigator.geolocation.getCurrentPosition(
      p => { if (!done) { done = true; clearTimeout(t); resolve(p) } },
      e => { if (!done) { done = true; clearTimeout(t); reject(e) } },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }
    )
  })
}

export class AppGlasses {
  private bridge: EvenHubBridge
  private state: State = {
    screen: 'appointments', provider: 'unknown', isInsurance: false,
    cursor: 0,
    nearbyCustomers: [], appointments: [],
    briefing: null, deals: [], tasks: [], comms: [],
    selectedContactId: null,
  }
  private busy = false // prevent concurrent async operations

  constructor() {
    this.bridge = new EvenHubBridge(COL_CFG)
  }

  async init(): Promise<void> {
    // 1. Init bridge (creates pages, gets raw bridge)
    await this.bridge.init()

    // 2. Show loading text
    await this.bridge.showTextPage('INSURVISION\n\nVerbinde...')

    // 3. Register events using even-toolkit's battle-tested mapper
    this.bridge.onEvent((event) => {
      const action = mapGlassEvent(event)
      if (action) this.handleAction(action)
    })

    // 4. Load data
    await this.bridge.updateText('INSURVISION\n\nLade Daten...')

    let hasLocation = false
    await Promise.allSettled([
      getProviderInfo().then(info => {
        this.state.provider = info.provider
        this.state.isInsurance = info.provider === 'insurcrm'
      }),
      getGPS()
        .then(pos => getNearbyCustomers(pos.coords.latitude, pos.coords.longitude, 25, 15))
        .then(res => { this.state.nearbyCustomers = res.customers; hasLocation = true }),
      getNextAppointments(10)
        .then(res => { this.state.appointments = res.appointments }),
    ])

    // 5. Pick screen + render
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'
    this.state.cursor = 0
    await this.render()
  }

  // ── Event Handling (via even-toolkit mapGlassEvent) ──

  private handleAction(action: GlassAction): void {
    if (this.busy) return

    switch (action.type) {
      case 'SELECT_HIGHLIGHTED':
        this.onSelect()
        break
      case 'HIGHLIGHT_MOVE':
        this.onMove(action.direction === 'down' ? 1 : -1)
        break
      case 'GO_BACK':
        this.onBack()
        break
    }
  }

  private onMove(dir: number): void {
    const max = this.getListLength() - 1
    if (max < 0) return
    const newCursor = Math.max(0, Math.min(max, this.state.cursor + dir))
    if (newCursor !== this.state.cursor) {
      this.state.cursor = newCursor
      this.render()
    }
  }

  private getListLength(): number {
    switch (this.state.screen) {
      case 'nearby': return this.state.nearbyCustomers.length
      case 'appointments': return this.state.appointments.length
      case 'deals': return this.state.deals.length
      case 'comms': return this.state.comms.length
      case 'tasks': return this.state.tasks.length
      default: return 0
    }
  }

  private async onSelect(): Promise<void> {
    if (this.busy) return
    this.busy = true

    try {
      const s = this.state
      switch (s.screen) {
        case 'nearby': {
          const c = s.nearbyCustomers[s.cursor]
          if (c?.id) { s.selectedContactId = c.id; await this.loadBriefing(c.id) }
          break
        }
        case 'appointments': {
          const a = s.appointments[s.cursor]
          if (a?.contact?.id) { s.selectedContactId = a.contact.id; await this.loadBriefing(a.contact.id) }
          break
        }
        case 'briefing': {
          if (s.selectedContactId) {
            await this.bridge.updateText('Lade Verträge...')
            try { s.deals = (await getContactDeals(s.selectedContactId)).deals } catch {}
            s.screen = 'deals'; s.cursor = 0; await this.render()
          }
          break
        }
        case 'deals': {
          if (s.selectedContactId) {
            await this.bridge.updateText('Lade Kommunikation...')
            try { s.comms = (await getContactCommunications(s.selectedContactId)).communications } catch {}
            s.screen = 'comms'; s.cursor = 0; await this.render()
          }
          break
        }
        case 'comms': {
          if (s.selectedContactId) {
            await this.bridge.updateText('Lade Aufgaben...')
            try { s.tasks = (await getContactTasks(s.selectedContactId)).tasks } catch {}
            s.screen = 'tasks'; s.cursor = 0; await this.render()
          }
          break
        }
        case 'tasks': {
          s.screen = 'briefing'; s.cursor = 0; await this.render()
          break
        }
      }
    } finally {
      this.busy = false
    }
  }

  private async onBack(): Promise<void> {
    if (this.busy) return
    const s = this.state
    switch (s.screen) {
      case 'nearby': s.screen = 'appointments'; break
      case 'appointments': if (s.nearbyCustomers.length > 0) s.screen = 'nearby'; break
      case 'briefing': s.screen = s.nearbyCustomers.length > 0 ? 'nearby' : 'appointments'; break
      case 'deals': s.screen = 'briefing'; break
      case 'comms': s.screen = 'deals'; break
      case 'tasks': s.screen = 'comms'; break
    }
    s.cursor = 0
    await this.render()
  }

  private async loadBriefing(contactId: string): Promise<void> {
    this.state.deals = []; this.state.tasks = []; this.state.comms = []
    this.state.screen = 'briefing'
    this.state.cursor = 0
    await this.bridge.updateText('Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch (e) {
      console.error('[IV] briefing error:', e)
    }
    await this.render()
  }

  // ── Render ──

  private async render(): Promise<void> {
    const s = this.state

    // Detail screens → text mode
    if (s.screen === 'briefing') {
      if (this.bridge.currentMode !== 'text') {
        await this.bridge.setupTextPage()
      }
      await this.bridge.updateText(this.renderBriefing())
      return
    }

    // List screens → column mode
    const [col1, col2, col3] = this.renderColumns()
    if (this.bridge.currentMode === 'columns') {
      await this.bridge.updateColumns([col1, col2, col3])
    } else {
      await this.bridge.showColumnPage([col1, col2, col3])
    }
  }

  // ── Column Renderers (3 columns for list screens) ──

  private renderColumns(): [string, string, string] {
    switch (this.state.screen) {
      case 'nearby': return this.colsNearby()
      case 'appointments': return this.colsAppts()
      case 'deals': return this.colsDeals()
      case 'comms': return this.colsComms()
      case 'tasks': return this.colsTasks()
      default: return ['', '', '']
    }
  }

  private colsNearby(): [string, string, string] {
    const items = this.state.nearbyCustomers
    const c1: string[] = ['IN DER NÄHE']
    const c2: string[] = [`${items.length} Kunden`]
    const c3: string[] = ['']

    for (let i = 0; i < items.length; i++) {
      const c = items[i]
      const ptr = i === this.state.cursor ? '▶' : ' '
      const d = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
      c1.push(`${ptr} ${d}`)
      c2.push(truncate(c.name, 24))
      const t = c.open_tasks > 0 ? `!${c.open_tasks}` : ''
      c3.push(t)
    }

    return [c1.join('\n'), c2.join('\n'), c3.join('\n')]
  }

  private colsAppts(): [string, string, string] {
    const items = this.state.appointments
    const c1: string[] = ['TERMINE']
    const c2: string[] = [`${items.length} Einträge`]
    const c3: string[] = ['']

    for (let i = 0; i < items.length; i++) {
      const a = items[i]
      const ptr = i === this.state.cursor ? '▶' : ' '
      c1.push(`${ptr} ${formatTime(a.start_time)}`)
      c2.push(truncate(a.contact?.name || '–', 24))
      c3.push(truncate(a.title, 14))
    }

    return [c1.join('\n'), c2.join('\n'), c3.join('\n')]
  }

  private colsDeals(): [string, string, string] {
    const items = this.state.deals
    const isIns = this.state.isInsurance
    const label = isIns ? 'VERTRÄGE' : 'DEALS'
    const c1: string[] = [label]
    const c2: string[] = [`${items.length} Einträge`]
    const c3: string[] = ['']

    for (let i = 0; i < items.length; i++) {
      const d = items[i]
      const ptr = i === this.state.cursor ? '●' : '○'
      c1.push(`${ptr} ${truncate(d.category || d.name, 12)}`)
      c2.push(truncate(d.insurer || d.stage || '', 24))
      c3.push(formatCurrency(d.value))
    }

    return [c1.join('\n'), c2.join('\n'), c3.join('\n')]
  }

  private colsComms(): [string, string, string] {
    const items = this.state.comms
    const icons: Record<string, string> = { email: '✉', phone: '☎', whatsapp: 'W', note: '✎', letter: '✉' }
    const c1: string[] = ['KOMMUNIKATION']
    const c2: string[] = [`${items.length} Einträge`]
    const c3: string[] = ['']

    for (let i = 0; i < items.length; i++) {
      const c = items[i]
      const ptr = i === this.state.cursor ? '▶' : ' '
      const icon = icons[c.type] || '•'
      const dir = c.direction === 'inbound' ? '←' : '→'
      c1.push(`${ptr}${icon}${dir} ${formatDate(c.date)}`)
      c2.push(truncate(c.subject || c.preview || '–', 24))
      c3.push('')
    }

    return [c1.join('\n'), c2.join('\n'), c3.join('\n')]
  }

  private colsTasks(): [string, string, string] {
    const items = this.state.tasks
    const isIns = this.state.isInsurance
    const label = isIns ? 'WIEDERVORLAGEN' : 'TASKS'
    const c1: string[] = [label]
    const c2: string[] = [`${items.length} Einträge`]
    const c3: string[] = ['']

    for (let i = 0; i < items.length; i++) {
      const t = items[i]
      const ptr = i === this.state.cursor ? '▶' : ' '
      c1.push(`${ptr} ${formatDate(t.due_date)}`)
      c2.push(truncate(t.title, 24))
      c3.push(priorityIcon(t.priority))
    }

    return [c1.join('\n'), c2.join('\n'), c3.join('\n')]
  }

  // ── Briefing Renderer (text mode) ──

  private renderBriefing(): string {
    const b = this.state.briefing
    if (!b) return 'Lade Kundendaten...'

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null

    const L: string[] = []
    L.push(`── KUNDE ──`)
    L.push(c.name.toUpperCase() + (age ? `, ${age}J` : ''))
    if (c.category) L.push(`${c.category}`)
    if (c.phone) L.push(`☎ ${c.phone}`)

    const dl = isIns ? 'Verträge' : 'Deals'
    L.push(`${b.deals.total} ${dl}  ${formatCurrency(b.deals.total_value)} p.a.`)
    if (b.deals.by_stage.length > 0) {
      L.push(b.deals.by_stage.slice(0, 3).map(s => `${s.stage}:${s.count}`).join(' ● '))
    }

    const tl = isIns ? 'WV' : 'Tasks'
    const cl = isIns ? 'Schäden' : 'Tickets'
    let status = `${b.open_tasks} ${tl}  ${b.open_tickets} ${cl}`
    if (isIns && b.insurance?.annual_commission) {
      status += `  Crt:${formatCurrency(b.insurance.annual_commission)}`
    }
    L.push(status)

    if (b.last_interaction) {
      L.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    }
    if (c.since) L.push(`Kunde seit ${new Date(c.since).getFullYear()}`)

    return L.map(l => truncate(l, 42)).join('\n')
  }
}
