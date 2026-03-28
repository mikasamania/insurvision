import type { Reminder } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatDate, priorityIcon } from '../utils/formatter'
import { truncate } from '../utils/truncate'

const ITEMS_PER_PAGE = 3

export function getReminderPageCount(reminders: Reminder[]): number {
  return Math.max(1, Math.ceil(reminders.length / ITEMS_PER_PAGE))
}

export async function showReminderPage(
  bridge: EvenAppBridge,
  reminders: Reminder[],
  pageIndex: number
): Promise<void> {
  const totalPages = getReminderPageCount(reminders)
  const start = pageIndex * ITEMS_PER_PAGE
  const items = reminders.slice(start, start + ITEMS_PER_PAGE)

  const containers: any[] = [
    {
      type: 'text',
      text: `WIEDERVORLAGEN [${pageIndex + 1}/${totalPages}]`,
      fontSize: 14,
      bold: true,
    },
  ]

  if (items.length === 0) {
    containers.push({
      type: 'text',
      text: 'Keine offenen Wiedervorlagen',
      fontSize: 18,
    })
  } else {
    for (const r of items) {
      const prio = priorityIcon(r.priority)
      const date = formatDate(r.due_date)
      const line = truncate(`${date} ${r.title} ${prio}`, 42)
      containers.push({ type: 'text', text: line, fontSize: 14 })
    }
  }

  await bridge.sendPage({ id: `reminders-${pageIndex}`, containers })
}
