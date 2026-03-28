/**
 * Type definitions for Even Hub SDK bridge interface.
 * These mirror the @evenrealities/even_hub_sdk API.
 */

export interface TextContainer {
  type: 'text'
  text: string
  fontSize?: number
  bold?: boolean
  alignment?: 'left' | 'center' | 'right'
  isEventCapture?: number
}

export interface ImageContainer {
  type: 'image'
  src: string
  width?: number
  height?: number
}

export type Container = TextContainer | ImageContainer

export interface Page {
  id: string
  containers: Container[]
}

export type TouchEvent = 'tap_left' | 'tap_right'
export type RingEvent = 'swipe_forward' | 'swipe_back' | 'ring_tap'

export interface EvenAppBridge {
  sendPage(page: Page): Promise<void>
  onTouchEvent(callback: (event: TouchEvent) => void): void
  onRingEvent(callback: (event: RingEvent) => void): void
}
