// Entry point for the anonymous scan (Bible §04 step 1).
//
// The flow itself is a client component — it drives the camera, canvas, and
// upload, none of which exist on the server. Public: src/middleware.ts
// short-circuits /scan before any session gating.

import { ScanFlow } from './ScanFlow'

export const metadata = {
  title: 'MenuDesk',
}

export default function ScanPage() {
  return <ScanFlow />
}
