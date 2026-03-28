import type { VisionContactBriefing } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatCurrency, formatDate } from '../utils/formatter'

export async function showBriefing(
  bridge: EvenAppBridge,
  data: VisionContactBriefing,
  provider: string
): Promise<void> {
  const c = data.contact
  const isInsurance = provider === 'insurcrm'

  // Line 1: Name + company/category
  const categoryPart = c.category ? ` [${c.category}]` : ''
  const companyPart = c.company ? ` | ${c.company}` : ''
  const sincePart = c.since ? ` seit ${new Date(c.since).getFullYear()}` : ''
  const header = `${c.name}${companyPart}${categoryPart}${sincePart}`

  // Line 2: Deals/Contracts
  const dealsLabel = isInsurance ? 'Verträge' : 'Deals'
  const valueLabel = isInsurance ? 'Jahresbeitrag' : 'Volumen'
  const dealsLine = `${data.deals.total} ${dealsLabel} | ${formatCurrency(data.deals.total_value)} ${valueLabel}`

  // Line 3: Tasks + Tickets
  const ticketLabel = isInsurance ? 'Schäden' : 'Tickets'
  const taskLabel = isInsurance ? 'WV' : 'Tasks'
  const statusLine = `${data.open_tasks} ${taskLabel} | ${data.open_tickets} ${ticketLabel}`

  // Line 4: Insurance bonus or last interaction
  let footer: string
  if (isInsurance && data.insurance?.annual_commission) {
    footer = `Courtage: ${formatCurrency(data.insurance.annual_commission)}/J | ▶ Verträge`
  } else if (data.last_interaction) {
    footer = `Letzt: ${formatDate(data.last_interaction.date)} ${data.last_interaction.type}`
  } else {
    footer = '▶ Deals | ◀ Zurück'
  }

  await bridge.sendPage({
    id: 'briefing',
    containers: [
      { type: 'text', text: header, fontSize: 15, bold: true },
      { type: 'text', text: dealsLine, fontSize: 16 },
      { type: 'text', text: statusLine, fontSize: 14 },
      { type: 'text', text: footer, fontSize: 12 },
    ],
  })
}
