import type { EvenAppBridge } from '../types/bridge'

export async function showSplash(bridge: EvenAppBridge): Promise<void> {
  await bridge.sendPage({
    id: 'splash',
    containers: [
      {
        type: 'text',
        text: 'INSURVISION',
        fontSize: 32,
        bold: true,
        alignment: 'center',
      },
      {
        type: 'text',
        text: 'Smart Glasses CRM',
        fontSize: 18,
        alignment: 'center',
      },
      {
        type: 'text',
        text: 'Lade Termine...',
        fontSize: 16,
        alignment: 'center',
      },
    ],
  })
}

export async function showConnected(bridge: EvenAppBridge): Promise<void> {
  await bridge.sendPage({
    id: 'splash-connected',
    containers: [
      {
        type: 'text',
        text: 'INSURVISION',
        fontSize: 32,
        bold: true,
        alignment: 'center',
      },
      {
        type: 'text',
        text: 'Verbunden ✓',
        fontSize: 20,
        alignment: 'center',
      },
    ],
  })
}
