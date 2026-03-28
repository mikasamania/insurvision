import type { VisionTask } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatDate, priorityIcon } from '../utils/formatter'
import { truncate } from '../utils/truncate'

const ITEMS_PER_PAGE = 3

export function getTaskPageCount(tasks: VisionTask[]): number {
  return Math.max(1, Math.ceil(tasks.length / ITEMS_PER_PAGE))
}

export async function showTaskPage(
  bridge: EvenAppBridge,
  tasks: VisionTask[],
  pageIndex: number,
  isInsurance: boolean
): Promise<void> {
  const totalPages = getTaskPageCount(tasks)
  const start = pageIndex * ITEMS_PER_PAGE
  const items = tasks.slice(start, start + ITEMS_PER_PAGE)
  const label = isInsurance ? 'WIEDERVORLAGEN' : 'TASKS'

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
      text: isInsurance ? 'Keine offenen Wiedervorlagen' : 'Keine offenen Tasks',
      fontSize: 18,
    })
  } else {
    for (const t of items) {
      const prio = priorityIcon(t.priority)
      const date = formatDate(t.due_date)
      const line = truncate(`${date} ${t.title} ${prio}`, 42)
      containers.push({ type: 'text', text: line, fontSize: 14 })
    }
  }

  await bridge.sendPage({ id: `tasks-${pageIndex}`, containers })
}
