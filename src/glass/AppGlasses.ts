/**
 * InsurVision G2 Glasses Controller
 *
 * CRITICAL RULES for G2 Display (576x288px, ~10 text lines):
 * 1. createStartUpPageContainer ONCE at init
 * 2. textContainerUpgrade for ALL updates (flicker-free)
 * 3. NEVER exceed 10 lines — if text overflows, firmware hijacks
 *    scroll events for internal scrolling and our cursor breaks.
 * 4. SCROLL_TOP/BOTTOM = swipe events, used for cursor movement
 *    ONLY when content fits on screen (no overflow).
 *
 * Layout (exactly 10 lines):
 * Line 1: INSURVISION         G2 ● CONN
 * Line 2: ──── SECTION ────
 * Line 3: ▶ Item 1 (highlighted)
 * Line 4:   Item 2
 * Line 5:   Item 3
 * Line 6:   Item 4
 * Line 7:   Item 5
 * Line 8: ────────────────────
 * Line 9: [NÄHE] TERMINE  KUNDE
 * Line 10: Swipe↕  Tap▶  DblTap◀
 */
import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

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

// ── Constants ──
const CID = 1
const CNAME = 'main'
const W = 576
const H = 288
const LINE = '────────────────────────────────'
const LINE_SHORT = '──────────────────'

type Screen = 'nearby' | 'appointments' | 'briefing' | 'deals' | 'comms' | 'tasks'
const SCREENS: Screen[] = ['nearby', 'appointments', 'briefing', 'deals', 'comms', 'tasks']

interface State {
  screen: Screen
  provider: string
  isInsurance: boolean
  cursor: number              // highlighted item in lists
  nearbyCustomers: NearbyCustomer[]
  appointments: VisionAppointment[]
  briefing: VisionContactBriefing | null
  deals: VisionDeal[]
  tasks: VisionTask[]
  comms: VisionCommunication[]
  selectedContactId: string | null
  scrollOffset: number
}

// ── GPS Helper ──
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
  private bridge!: EvenAppBridge
  private state: State = {
    screen: 'appointments', provider: 'unknown', isInsurance: false,
    cursor: 0, scrollOffset: 0,
    nearbyCustomers: [], appointments: [],
    briefing: null, deals: [], tasks: [], comms: [],
    selectedContactId: null,
  }

  async init(): Promise<void> {
    // 1. Get bridge
    this.bridge = await waitForEvenAppBridge()

    // 2. Create SINGLE text container (never changes, only content updates)
    await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [
          new TextContainerProperty({
            containerID: CID,
            containerName: CNAME,
            xPosition: 0, yPosition: 0, width: W, height: H,
            borderWidth: 0, borderColor: 0, paddingLength: 6,
            content: 'INSURVISION v1.0\n' + LINE + '\n\n  Verbinde...',
            isEventCapture: 1,
          } as any),
        ] as any,
        imageObject: [] as any,
      })
    )

    // 3. Register events
    this.bridge.onEvenHubEvent((event: any) => {
      try { this.handleEvent(event) } catch (e) { console.error('[IV] event error:', e) }
    })

    // 4. Show loading status
    await this.updateText('INSURVISION v1.0\n' + LINE + '\n\n  Lade Daten...')

    // 5. Load data in parallel
    let hasLocation = false
    try {
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
    } catch (e) {
      console.error('[IV] data load error:', e)
    }

    // 6. Pick start screen + render
    this.state.screen = (hasLocation && this.state.nearbyCustomers.length > 0) ? 'nearby' : 'appointments'
    this.state.cursor = 0
    await this.render()
  }

  // ── Text Update (flicker-free) ──

  private async updateText(content: string): Promise<void> {
    try {
      const trimmed = content.slice(0, 950) // SDK limit ~1000 chars
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: CID,
          containerName: CNAME,
          content: trimmed,
          contentOffset: 0,
          contentLength: trimmed.length,
        } as any)
      )
    } catch (e) {
      console.error('[IV] text update error:', e)
    }
  }

  // ── Event Handling ──

  private handleEvent(event: any): void {
    // Try ALL possible event locations — SDK structure varies
    const textEv = event?.textEvent
    const listEv = event?.listEvent
    const sysEv = event?.sysEvent
    const ev = textEv || listEv || sysEv || event

    // Extract eventType from wherever it lives
    let et: number | undefined = ev?.eventType
    // Fallback: check top-level event
    if (et === undefined && event?.eventType !== undefined) et = event.eventType

    // Ignore system events (FOREGROUND_ENTER etc.)
    if (typeof et === 'number' && et >= 4) return

    if (et === OsEventTypeList.SCROLL_TOP_EVENT) {
      // Scroll up = move cursor up in list
      this.onScroll(-1)
    } else if (et === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      // Scroll down = move cursor down in list
      this.onScroll(1)
    } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      this.onBack()
    } else if (et === OsEventTypeList.CLICK_EVENT || et === undefined || et === null || et === 0) {
      this.onTap()
    }
  }

  private onScroll(dir: number): void {
    const max = this.getListLength() - 1
    if (max < 0) return
    this.state.cursor = Math.max(0, Math.min(max, this.state.cursor + dir))
    this.render()
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

  private async onTap(): Promise<void> {
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
        // Tap on briefing → load deals
        if (s.selectedContactId) {
          await this.updateText('── VERTRÄGE ──' + '\n\n  Lade...')
          try { s.deals = (await getContactDeals(s.selectedContactId)).deals } catch {}
          s.screen = 'deals'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'deals': {
        // Tap on deals → load comms
        if (s.selectedContactId) {
          await this.updateText('── KOMMUNIKATION ──' + '\n\n  Lade...')
          try { s.comms = (await getContactCommunications(s.selectedContactId)).communications } catch {}
          s.screen = 'comms'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'comms': {
        // Tap on comms → load tasks
        if (s.selectedContactId) {
          await this.updateText('── AUFGABEN ──' + '\n\n  Lade...')
          try { s.tasks = (await getContactTasks(s.selectedContactId)).tasks } catch {}
          s.screen = 'tasks'; s.cursor = 0; await this.render()
        }
        break
      }
      case 'tasks': {
        // Tap on tasks → back to briefing
        s.screen = 'briefing'; s.cursor = 0; await this.render()
        break
      }
    }
  }

  private async onBack(): Promise<void> {
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
    await this.updateText('── KUNDE ──' + '\n\n  Lade Kundendaten...')
    try {
      try { this.state.briefing = await getPreparedBriefing(contactId) }
      catch { this.state.briefing = await getContactBriefing(contactId) }
    } catch (e) {
      console.error('[IV] briefing error:', e)
    }
    await this.render()
  }

  // ── Render ──
  // CRITICAL: Every render must produce EXACTLY 10 lines.
  // If text overflows, firmware hijacks scroll events!
  // Layout: 2 header + 5 content + 1 separator + 1 tabs + 1 nav = 10

  private async render(): Promise<void> {
    let text: string
    switch (this.state.screen) {
      case 'nearby':       text = this.renderList('IN DER NÄHE', this.fmtNearby()); break
      case 'appointments': text = this.renderList('TERMINE', this.fmtAppts()); break
      case 'briefing':     text = this.renderBriefing(); break
      case 'deals':        text = this.renderList(this.state.isInsurance ? 'VERTRÄGE' : 'DEALS', this.fmtDeals()); break
      case 'comms':        text = this.renderList('KOMMUNIKATION', this.fmtComms()); break
      case 'tasks':        text = this.renderList(this.state.isInsurance ? 'WV' : 'TASKS', this.fmtTasks()); break
      default:             text = 'INSURVISION'; break
    }
    await this.updateText(text)
  }

  // ── Generic List Renderer (exactly 10 lines) ──

  private renderList(section: string, items: string[]): string {
    // Line 1: section title with count
    const sec = `── ${section} (${items.length}) ──`

    // Lines 2-9: 8 item slots (with cursor ▶)
    const SLOTS = 8
    const visible = this.visibleWindow(items, SLOTS)
    const contentLines: string[] = []
    for (let i = 0; i < SLOTS; i++) {
      if (i < visible.length) {
        const globalIdx = this.state.scrollOffset + i
        const ptr = globalIdx === this.state.cursor ? '▶' : ' '
        contentLines.push(`${ptr} ${visible[i]}`)
      } else {
        contentLines.push('')
      }
    }

    // Line 10: scroll indicator
    const total = items.length
    const pos = total > SLOTS ? ` ${this.state.cursor + 1}/${total}` : ''
    const scrollHint = total > SLOTS ? `↕${pos}` : ''

    return [sec, ...contentLines, scrollHint].join('\n')
  }

  // ── Briefing Renderer (exactly 10 lines) ──

  private renderBriefing(): string {
    const b = this.state.briefing
    if (!b) return '── KUNDE ──\n\nLade Kundendaten...'

    const c = b.contact
    const isIns = this.state.isInsurance
    const age = c.custom_fields?.birth_date ? formatAge(c.custom_fields.birth_date) : null

    const L: string[] = []
    // Name
    L.push(c.name.toUpperCase() + (age ? `, ${age}J` : ''))
    // Category + phone
    if (c.category || c.phone) L.push([c.category, c.phone].filter(Boolean).join(' ● '))
    // KPIs
    const dl = isIns ? 'Verträge' : 'Deals'
    L.push(`${b.deals.total} ${dl}  ${formatCurrency(b.deals.total_value)} p.a.`)
    // Categories
    if (b.deals.by_stage.length > 0) {
      L.push(b.deals.by_stage.slice(0, 4).map(s => `${s.stage}:${s.count}`).join(' ● '))
    }
    // Tasks + commission
    const tl = isIns ? 'WV' : 'Tasks'
    const cl = isIns ? 'Schäden' : 'Tickets'
    let statusLine = `${b.open_tasks} ${tl}  ${b.open_tickets} ${cl}`
    if (isIns && b.insurance?.annual_commission) {
      statusLine += `  Crt:${formatCurrency(b.insurance.annual_commission)}`
    }
    L.push(statusLine)
    // Last interaction
    if (b.last_interaction) L.push(`Letzt: ${formatDate(b.last_interaction.date)} ${b.last_interaction.type}`)
    if (c.since) L.push(`Kunde seit ${new Date(c.since).getFullYear()}`)

    return L.map(l => truncate(l, 38)).join('\n')
  }

  // ── List Item Formatters ──

  private fmtNearby(): string[] {
    return this.state.nearbyCustomers.map(c => {
      const d = c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km.toFixed(1)}km`
      const t = c.open_tasks > 0 ? ` !${c.open_tasks}` : ''
      return truncate(`${d} ${c.name}${t}`, 34)
    })
  }

  private fmtAppts(): string[] {
    return this.state.appointments.map(a => {
      const time = formatTime(a.start_time)
      const name = a.contact?.name || '–'
      return truncate(`${time} ${name} | ${a.title}`, 34)
    })
  }

  private fmtDeals(): string[] {
    return this.state.deals.map(d => {
      if (this.state.isInsurance) {
        return truncate(`${d.category || d.name} ${d.insurer || ''} ${formatCurrency(d.value)}`, 34)
      }
      return truncate(`${d.name} ${formatCurrency(d.value)} [${d.stage}]`, 34)
    })
  }

  private fmtComms(): string[] {
    const ic: Record<string, string> = { email: '✉', phone: '☎', whatsapp: 'W', note: '✎', letter: '✉' }
    return this.state.comms.map(c => {
      const icon = ic[c.type] || '•'
      const dir = c.direction === 'inbound' ? '←' : '→'
      return truncate(`${icon}${dir} ${formatDate(c.date)} ${c.subject || c.preview || '–'}`, 34)
    })
  }

  private fmtTasks(): string[] {
    return this.state.tasks.map(t => {
      const p = priorityIcon(t.priority)
      return truncate(`${formatDate(t.due_date)} ${t.title} ${p}`, 34)
    })
  }

  // ── Visible Window (keeps cursor in view) ──

  private visibleWindow<T>(items: T[], slots: number): T[] {
    const total = items.length
    if (total <= slots) {
      this.state.scrollOffset = 0
      return items
    }
    let start = this.state.scrollOffset
    if (this.state.cursor < start) start = this.state.cursor
    if (this.state.cursor >= start + slots) start = this.state.cursor - slots + 1
    start = Math.max(0, Math.min(total - slots, start))
    this.state.scrollOffset = start
    return items.slice(start, start + slots)
  }
}
