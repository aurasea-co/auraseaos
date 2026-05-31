// Role-based access for the RateDesk surface.
//
// Two layers:
//   - Page-level   (can you load /ratedesk at all?)
//   - Element-level (can you SEE this specific KPI / link / button?)
//
// Auto Push approval (`rate_approval`) and the room-settings link
// (`room_settings_link`) are pre-declared in the element matrix so
// the wiring is ready the moment those features ship. They don't
// render anywhere today; the active call sites only consult
// `total_rev​enue`. See the RateDesk dashboard page for the
// summary comment block.

export type RateDeskPage =
  | 'ratedesk_dashboard'
  | 'ratedesk_recommendations'
  | 'ratedesk_competitors'
  | 'ratedesk_import'
  | 'ratedesk_auto_push'      // approve rate changes — owner + manager (Pro tier, gated separately)
  | 'ratedesk_room_settings'  // structural room-type config — owner only

export type RateDeskElement =
  | 'total_revenue'           // ฿ revenue figure — owner only
  | 'rate_approval'           // approve button — owner + manager
  | 'room_settings_link'      // "Manage →" link from dashboard → /settings/rooms
  | 'billing_link'            // package/pricing — owner only

export type RateDeskRole = 'owner' | 'manager' | 'staff' | 'superadmin'

const PAGE_ACCESS: Record<RateDeskRole, ReadonlyArray<RateDeskPage>> = {
  owner: [
    'ratedesk_dashboard',
    'ratedesk_recommendations',
    'ratedesk_competitors',
    'ratedesk_import',
    'ratedesk_auto_push',
    'ratedesk_room_settings',
  ],
  manager: [
    'ratedesk_dashboard',
    'ratedesk_recommendations',
    'ratedesk_competitors',
    'ratedesk_import',
    'ratedesk_auto_push',
    // No ratedesk_room_settings — structural config is owner-only.
  ],
  // Super-admins are platform staff, not tenant staff. They mirror
  // owner access so support / debugging can walk the same surfaces
  // a real owner sees.
  superadmin: [
    'ratedesk_dashboard',
    'ratedesk_recommendations',
    'ratedesk_competitors',
    'ratedesk_import',
    'ratedesk_auto_push',
    'ratedesk_room_settings',
  ],
  // Tenant staff have no RateDesk surface — they sit on the entry
  // form and operational tasks. Direct URL navigation triggers the
  // redirect in the dashboard page guard.
  staff: [],
}

const ELEMENT_ACCESS: Record<RateDeskRole, ReadonlyArray<RateDeskElement>> = {
  owner: ['total_revenue', 'rate_approval', 'room_settings_link', 'billing_link'],
  // Manager: operational decisions (rate approval, recs) but no
  // P&L visibility (revenue), no structural config (room settings),
  // no billing.
  manager: ['rate_approval'],
  superadmin: ['total_revenue', 'rate_approval', 'room_settings_link', 'billing_link'],
  staff: [],
}

export function canAccessRateDesk(role: RateDeskRole, page: RateDeskPage): boolean {
  return PAGE_ACCESS[role]?.includes(page) ?? false
}

export function canSeeElement(role: RateDeskRole, element: RateDeskElement): boolean {
  return ELEMENT_ACCESS[role]?.includes(element) ?? false
}

// Cross-cutting wrapper for "can this user see Total Revenue anywhere?"
// — RateDesk, F&B home, exports, charts. Single source of truth so a
// future role-rule tweak only needs to change ELEMENT_ACCESS above and
// every call site updates automatically. Accepts the broader AppRole
// string (rather than RateDeskRole specifically) so non-RateDesk
// callers don't have to narrow first.
export function canSeeRevenue(role: string): boolean {
  // Anything outside our known role set defaults to no. Defensive
  // against future role additions ('viewer', 'auditor', etc) that
  // shouldn't auto-inherit revenue visibility.
  const known: ReadonlyArray<RateDeskRole> = ['owner', 'manager', 'staff', 'superadmin']
  if (!known.includes(role as RateDeskRole)) return false
  return canSeeElement(role as RateDeskRole, 'total_revenue')
}
