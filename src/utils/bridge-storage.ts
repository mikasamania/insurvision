/**
 * Bridge-Storage Helper
 *
 * Persistiert Werte über die Even Hub SDK Bridge (bridge.setLocalStorage /
 * bridge.getLocalStorage). Das ist der OFFIZIELLE Storage für Apps, der
 * vom Even Hub verwaltet wird und über WebView-Neustarts hinweg persistiert.
 *
 * Browser-localStorage ist KEIN zuverlässiger Storage in der WebView:
 * Der Storage-Kontext kann sich unterscheiden von dem, was man z.B. in
 * Safari/Chrome auf dem gleichen Gerät sieht.
 *
 * Fallback-Strategie:
 * 1. Bridge-Storage (wenn Bridge verfügbar)
 * 2. Browser-localStorage (Entwicklung / normaler Browser)
 * 3. import.meta.env (Build-time Default für VITE_API_KEY etc.)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

let cachedBridge: EvenAppBridge | null = null

/** Setze die Bridge, die für getStorage/setStorage verwendet werden soll */
export function setStorageBridge(bridge: EvenAppBridge | null): void {
  cachedBridge = bridge
}

/**
 * Lese einen Wert: Bridge zuerst, dann Browser-localStorage, dann Default.
 * Async weil Bridge-Aufrufe async sind.
 */
export async function getStorage(key: string, envFallback?: string): Promise<string> {
  // 1. Versuche Bridge-Storage (offizieller WebView Storage)
  if (cachedBridge) {
    try {
      const val = await cachedBridge.getLocalStorage(key)
      if (val && val.length > 0) return val
    } catch { /* Bridge failed, fallback */ }
  }

  // 2. Browser localStorage
  try {
    const val = window.localStorage?.getItem(key)
    if (val && val.length > 0) return val
  } catch { /* localStorage blocked, fallback */ }

  // 3. Build-time env fallback
  return envFallback || ''
}

/**
 * Speichere einen Wert in Bridge-Storage UND Browser-localStorage.
 * Beides wird gesetzt für maximale Zuverlässigkeit.
 */
export async function setStorage(key: string, value: string): Promise<void> {
  // Browser localStorage (sofort, synchron)
  try {
    window.localStorage?.setItem(key, value)
  } catch { /* localStorage blocked */ }

  // Bridge-Storage (async, wenn verfügbar)
  if (cachedBridge) {
    try {
      await cachedBridge.setLocalStorage(key, value)
    } catch (e) {
      console.warn('[IV] Bridge setLocalStorage failed:', e)
    }
  }
}

/** Lösche einen Wert aus beiden Stores */
export async function removeStorage(key: string): Promise<void> {
  try { window.localStorage?.removeItem(key) } catch {}
  if (cachedBridge) {
    try { await cachedBridge.setLocalStorage(key, '') } catch {}
  }
}
