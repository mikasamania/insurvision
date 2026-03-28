import type { Contract } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatCurrency } from '../utils/formatter'
import { truncate } from '../utils/truncate'

const ITEMS_PER_PAGE = 3

export function getContractPageCount(contracts: Contract[]): number {
  return Math.max(1, Math.ceil(contracts.length / ITEMS_PER_PAGE))
}

export async function showContractPage(
  bridge: EvenAppBridge,
  contracts: Contract[],
  pageIndex: number
): Promise<void> {
  const totalPages = getContractPageCount(contracts)
  const start = pageIndex * ITEMS_PER_PAGE
  const items = contracts.slice(start, start + ITEMS_PER_PAGE)

  const containers: any[] = [
    {
      type: 'text',
      text: `VERTRÄGE [${pageIndex + 1}/${totalPages}]`,
      fontSize: 14,
      bold: true,
    },
  ]

  if (items.length === 0) {
    containers.push({
      type: 'text',
      text: 'Keine Verträge',
      fontSize: 18,
    })
  } else {
    for (const c of items) {
      const line = truncate(
        `${c.category} ${c.insurer} | ${formatCurrency(c.premium)}/J`,
        42
      )
      containers.push({ type: 'text', text: line, fontSize: 14 })
    }
  }

  await bridge.sendPage({ id: `contracts-${pageIndex}`, containers })
}
