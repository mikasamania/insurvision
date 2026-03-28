import type { CustomerBriefingResponse } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatCurrency, formatDate } from '../utils/formatter'

export async function showBriefing(
  bridge: EvenAppBridge,
  data: CustomerBriefingResponse
): Promise<void> {
  const c = data.customer
  const agePart = c.age ? `, ${c.age}J.` : ''
  const sincePart = c.since ? new Date(c.since).getFullYear() : '?'

  await bridge.sendPage({
    id: 'briefing',
    containers: [
      {
        type: 'text',
        text: `${c.name}${agePart} | ${c.status} seit ${sincePart}`,
        fontSize: 16,
        bold: true,
      },
      {
        type: 'text',
        text: `${data.contracts.total} Verträge | ${formatCurrency(data.contracts.annual_premium)}/J`,
        fontSize: 16,
      },
      {
        type: 'text',
        text: `${data.open_tasks} offene WV | ${data.open_claims} Schäden | ${formatCurrency(data.annual_commission)} Courtage`,
        fontSize: 14,
      },
      {
        type: 'text',
        text: data.last_interaction
          ? `Letzt: ${formatDate(data.last_interaction.date)} ${data.last_interaction.type}`
          : 'Kein Kontakt',
        fontSize: 12,
      },
    ],
  })
}
