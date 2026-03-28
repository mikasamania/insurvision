import type { VisionDeal } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatCurrency } from '../utils/formatter'
import { truncate } from '../utils/truncate'

const ITEMS_PER_PAGE = 3

export function getDealPageCount(deals: VisionDeal[]): number {
  return Math.max(1, Math.ceil(deals.length / ITEMS_PER_PAGE))
}

export async function showDealPage(
  bridge: EvenAppBridge,
  deals: VisionDeal[],
  pageIndex: number,
  isInsurance: boolean
): Promise<void> {
  const totalPages = getDealPageCount(deals)
  const start = pageIndex * ITEMS_PER_PAGE
  const items = deals.slice(start, start + ITEMS_PER_PAGE)
  const label = isInsurance ? 'VERTRÄGE' : 'DEALS'

  const containers: any[] = [
    {
      type: 'text',
      text: `${label} [${pageIndex + 1}/${totalPages}]`,
      fontSize: 14,
      bold: true,
    },
  ]

  if (items.length === 0) {
    containers.push({
      type: 'text',
      text: isInsurance ? 'Keine Verträge' : 'Keine Deals',
      fontSize: 18,
    })
  } else {
    for (const d of items) {
      let line: string
      if (isInsurance) {
        // Insurance: "KFZ Allianz | 650 €/J"
        line = truncate(
          `${d.category || d.name} ${d.insurer || ''} | ${formatCurrency(d.value)}/J`,
          42
        )
      } else {
        // Generic CRM: "Deal Name | 12.500 € [Stage]"
        line = truncate(
          `${d.name} | ${formatCurrency(d.value)} [${d.stage}]`,
          42
        )
      }
      containers.push({ type: 'text', text: line, fontSize: 14 })
    }
  }

  await bridge.sendPage({ id: `deals-${pageIndex}`, containers })
}
