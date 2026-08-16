// Country data registry — the composition root's lookup.
//
// The engine never calls this. Route handlers and the CLI resolve a provider
// here and inject it, which is what keeps "add a country" a data change.

import type { CountryDataProvider } from '@/lib/menudesk/engine'
import { thailandDataProvider } from './th'

/**
 * ISO 3166-1 alpha-2 → provider. Thailand is the only entry today; Bible §13
 * is explicit that spraying across SEA before winning one market is the way to
 * lose, so this map growing is a business decision, not a housekeeping one.
 */
const PROVIDERS: Record<string, CountryDataProvider> = {
  TH: thailandDataProvider,
}

export const DEFAULT_COUNTRY_CODE = 'TH'

/** Country codes with a provider — for validation at the edge. */
export function supportedCountryCodes(): string[] {
  return Object.keys(PROVIDERS)
}

/**
 * Resolve a provider, throwing on an unknown country.
 *
 * Throwing rather than falling back to Thailand is deliberate: a silent
 * fallback would price an Indonesian menu with Thai ingredient costs and
 * present the result with a straight face.
 */
export function getCountryDataProvider(countryCode: string): CountryDataProvider {
  const provider = PROVIDERS[countryCode.toUpperCase()]
  if (!provider) {
    throw new Error(
      `[menudesk] No CountryDataProvider for '${countryCode}'. ` +
        `Supported: ${supportedCountryCodes().join(', ')}.`,
    )
  }
  return provider
}

export { thailandDataProvider } from './th'
