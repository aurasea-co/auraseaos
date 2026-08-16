// The adapter that sends nothing.
//
// Default in development and in tests, so running the funnel locally cannot
// push a message to a real restaurant owner's phone. It logs what it would
// have sent — silence would make a misconfigured CHANNEL_ADAPTER look
// identical to a working one.

import type {
  AlertPayload,
  ChannelAdapter,
  ChannelRecipient,
  DeliveryResult,
  DigestPayload,
} from './channel'

export const noopChannelAdapter: ChannelAdapter = {
  channel: 'noop',

  async sendDigest(
    to: ChannelRecipient,
    payload: DigestPayload,
  ): Promise<DeliveryResult> {
    console.info(
      `[menudesk/noop] digest → identity ${to.identityId}: ` +
        `${payload.headlineAmount} ${payload.currencyCode} over ${payload.periodLabel}, ` +
        `${payload.dishes.length} dish(es), action: ${payload.action}`,
    )
    return { delivered: true }
  },

  async sendAlert(
    to: ChannelRecipient,
    payload: AlertPayload,
  ): Promise<DeliveryResult> {
    console.info(
      `[menudesk/noop] alert → identity ${to.identityId}: ` +
        `${payload.title} — ${payload.detail} (action: ${payload.action})`,
    )
    return { delivered: true }
  },
}
