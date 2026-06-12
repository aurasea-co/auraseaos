import { redirect } from 'next/navigation'

// Competitor rates moved out of Settings into the RateDesk section
// (one click from the hotel owner's primary surface instead of
// Settings → Competitor rates). This permanent redirect keeps old
// bookmarks, LINE links, and email links from 404-ing.
export default function CompetitorsRedirect() {
  redirect('/ratedesk/competitors')
}
