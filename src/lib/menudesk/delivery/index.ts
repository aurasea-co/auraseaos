// Channel selection, by environment variable.
//
// CHANNEL_ADAPTER=line|noop. Defaults to `noop`, so a missing or misspelt
// value degrades to sending nothing rather than to sending on whatever channel
// happened to be first in the map.

import type { ChannelAdapter } from './channel'
import { lineChannelAdapter } from './line'
import { noopChannelAdapter } from './noop'

const ADAPTERS: Record<string, ChannelAdapter> = {
  line: lineChannelAdapter,
  noop: noopChannelAdapter,
}

export function getChannelAdapter(): ChannelAdapter {
  const configured = (process.env.CHANNEL_ADAPTER || 'noop').toLowerCase()
  const adapter = ADAPTERS[configured]

  if (!adapter) {
    console.warn(
      `[menudesk] Unknown CHANNEL_ADAPTER '${configured}' — falling back to noop. ` +
        `Valid values: ${Object.keys(ADAPTERS).join(', ')}.`,
    )
    return noopChannelAdapter
  }

  return adapter
}

export type {
  AlertPayload,
  ChannelAdapter,
  ChannelPayload,
  ChannelRecipient,
  DeliveryResult,
  DigestDish,
  DigestPayload,
} from './channel'

export { lineChannelAdapter } from './line'
export { noopChannelAdapter } from './noop'
