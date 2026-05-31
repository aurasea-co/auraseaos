// Competitor rate channels. Each channel represents a distinct
// price-discovery surface the competitor exposes to guests:
//   - ota:     Agoda / Booking.com / Expedia online rates (what guests
//              compare when shopping); used by the engine's undercut
//              signal because it's the apples-to-apples competitive
//              position metric.
//   - walk_in: Front-desk / phone-call rate. Higher latency to discover
//              (requires a real call) but useful for understanding the
//              competitor's pricing-power floor.
//   - package: Room + breakfast / room + extras. Not directly
//              comparable to a standalone room rate; useful for
//              positioning Aurasea customer's own bundle pricing.
//   - promo:   Flash sales, early-bird, member-only — short-lived
//              tactical pricing. Tracking these helps the owner see
//              when a competitor is in discount mode.
//
// The engine treats `ota` and unspecified-channel (legacy data from
// before migration 033) as the SAME bucket; everything else is
// excluded from the undercut signal. This keeps existing competitor
// rows working without a backfill while letting new entries
// distinguish channels.

export type RateChannel = 'ota' | 'walk_in' | 'package' | 'promo'

export const RATE_CHANNELS: ReadonlyArray<RateChannel> = ['ota', 'walk_in', 'package', 'promo']

// Caller is responsible for the i18n — we expose the channel key so
// the UI can look it up in messages.{en,th}.json:
//   t(`rateChannel.${channel}.label`)
//   t(`rateChannel.${channel}.note`)
// Centralising the channel set here avoids drift between the migration
// CHECK constraint, the API validator, and the UI dropdown.

export function isRateChannel(value: unknown): value is RateChannel {
  return typeof value === 'string' && (RATE_CHANNELS as ReadonlyArray<string>).includes(value)
}
