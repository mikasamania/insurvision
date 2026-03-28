import type { VisionAppointment } from '../types/api'
import type { EvenAppBridge } from '../types/bridge'
import { formatTime, formatDateShort } from '../utils/formatter'
import { truncate } from '../utils/truncate'

const ITEMS_PER_PAGE = 2

export function getAppointmentPageCount(appointments: VisionAppointment[]): number {
  return Math.max(1, Math.ceil(appointments.length / ITEMS_PER_PAGE))
}

export async function showAppointmentPage(
  bridge: EvenAppBridge,
  appointments: VisionAppointment[],
  pageIndex: number
): Promise<void> {
  const totalPages = getAppointmentPageCount(appointments)
  const start = pageIndex * ITEMS_PER_PAGE
  const items = appointments.slice(start, start + ITEMS_PER_PAGE)
  const today = formatDateShort(new Date().toISOString())

  const containers: any[] = [
    {
      type: 'text',
      text: `TERMINE  ${today}  [${pageIndex + 1}/${totalPages}]`,
      fontSize: 14,
      bold: true,
    },
  ]

  if (items.length === 0) {
    containers.push({
      type: 'text',
      text: 'Keine anstehenden Termine',
      fontSize: 18,
    })
  } else {
    for (const apt of items) {
      const time = formatTime(apt.start_time)
      const name = apt.contact?.name || 'Ohne Kontakt'
      const line = truncate(`${time} ${name} | ${apt.title}`, 42)
      containers.push({
        type: 'text',
        text: line,
        fontSize: 16,
      })
    }
  }

  containers.push({
    type: 'text',
    text: '▶ Details  |  ◀ Zurück',
    fontSize: 12,
  })

  await bridge.sendPage({ id: `appointments-${pageIndex}`, containers })
}
