// Single source of truth for how many days of free trial a superadmin
// can grant when manually inviting an owner. Both the invite-owner
// page's dropdown (src/app/superadmin/invite-owner/page.tsx) and the
// API route's server-side validation (src/app/api/superadmin/
// invite-owner/route.ts) import from here — they used to each hardcode
// their own copy of this list, and had already drifted from the
// public marketing policy (ratedesk.ai promises a 60-day trial; the
// old lists still offered 90 as a selectable/acceptable value with no
// shared source to keep them in sync).
//
// Policy: 60 days is the maximum free trial ever granted, matching the
// site copy. If this ever changes, it changes here once — not in two
// places that can silently disagree again.
export const MAX_TRIAL_DAYS = 60

export const TRIAL_OPTIONS = [14, 30, 60] as const
