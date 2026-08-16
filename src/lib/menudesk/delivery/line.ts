// LINE adapter — Thailand's channel. STUB.
//
// Deliberately not wired to the LINE API yet. Sending needs two things W0 does
// not have: the scan-identity → LINE user id mapping (W5 creates it, when the
// unlock step captures a LINE identity), and the Flex layout for a digest
// (W9). Returning `delivered: false` with a reason is the honest report of
// that state — a stub that returned `true` would make an unsent digest
// indistinguishable from a sent one in every log and metric downstream.
//
// When W9 fills this in, it sends through src/lib/line/messaging.ts
// (sendLineFlexMessage) rather than opening its own HTTP client, so LINE
// credentials and retry behaviour stay in one place shared with RateDesk.

import type { ChannelAdapter, ChannelRecipient, DeliveryResult } from './channel'

const NOT_IMPLEMENTED =
  'LINE adapter is a W0 stub — scan identities have no LINE user id until W5, ' +
  'and the digest Flex layout lands in W9.'

export const lineChannelAdapter: ChannelAdapter = {
  channel: 'line',

  // The payload parameter is omitted rather than named-and-ignored: there is
  // nothing to send it to yet, and TypeScript still checks these against
  // ChannelAdapter. W9 adds it back alongside the Flex layout.
  async sendDigest(to: ChannelRecipient): Promise<DeliveryResult> {
    console.warn(`[menudesk/line] digest not sent to ${to.identityId}: ${NOT_IMPLEMENTED}`)
    return { delivered: false, reason: NOT_IMPLEMENTED }
  },

  async sendAlert(to: ChannelRecipient): Promise<DeliveryResult> {
    console.warn(`[menudesk/line] alert not sent to ${to.identityId}: ${NOT_IMPLEMENTED}`)
    return { delivered: false, reason: NOT_IMPLEMENTED }
  },
}
