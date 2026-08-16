// The swappable delivery seam.
//
// LINE owns Thailand, and it owns nowhere else — Bible §13 lists Indonesia as
// WhatsApp, Vietnam as Zalo, the Philippines as Messenger, and calls a
// hardcoded channel the single largest obstacle to leaving Thailand. So the
// engine produces a payload and something else decides how it travels.
//
// Payloads are structured, never pre-rendered strings: a Flex bubble, a
// WhatsApp template, and an email body are different shapes, and formatting
// here would smuggle a channel assumption into the engine's output.

import type { TrafficLight } from '@/lib/menudesk/engine'

/**
 * Who to deliver to, in the channel's own address space — a LINE user id, a
 * WhatsApp number. Resolving an account to its address is the adapter's job,
 * so the caller never has to know which channel is configured.
 */
export interface ChannelRecipient {
  /** The MenuDesk scan identity this message concerns. */
  identityId: string
}

/** One dish worth mentioning, already ranked by the engine. */
export interface DigestDish {
  nameRaw: string
  trafficLight: TrafficLight
  foodCostPctLow: number
  foodCostPctHigh: number
}

/**
 * The recurring "here is where money is leaking" message (Bible §07, Tier 3).
 * Bible §02 rule 5 is binding on this payload: every insight ships with an
 * action. `action` is required, so a digest that only reports a problem cannot
 * be constructed.
 */
export interface DigestPayload {
  kind: 'digest'
  /** Bible §02 rule 4 — one hero number, not a dashboard. */
  headlineAmount: number
  currencyCode: string
  periodLabel: string
  dishes: DigestDish[]
  action: string
}

/**
 * A single time-sensitive event — a supplier price rise, a dish crossing into
 * red. Same rule: an alert without a next step is noise the owner learns to
 * ignore, and §12 names that quiet insight→action gap as a way this dies.
 */
export interface AlertPayload {
  kind: 'alert'
  title: string
  detail: string
  action: string
}

export type ChannelPayload = DigestPayload | AlertPayload

/**
 * Outcome of a send. Adapters report failure by returning `delivered: false`
 * rather than throwing — one unreachable owner must not abort a batch, and a
 * caller that needs to react still can.
 */
export interface DeliveryResult {
  delivered: boolean
  /** Present when delivery failed; safe to log, never shown to the owner. */
  reason?: string
}

export interface ChannelAdapter {
  /** Stable id for logs and config, e.g. 'line', 'noop'. */
  readonly channel: string
  sendDigest(to: ChannelRecipient, payload: DigestPayload): Promise<DeliveryResult>
  sendAlert(to: ChannelRecipient, payload: AlertPayload): Promise<DeliveryResult>
}
