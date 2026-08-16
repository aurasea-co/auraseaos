// Layout for MenuDesk's anonymous scan funnel.
//
// Deliberately bare next to (app)/layout.tsx: no sidebar, no tab bar, no user
// context, and above all no auth check. The visitor here has no account and is
// standing in a kitchen on a mid-range Android — every chrome element is
// something between them and photographing their menu (Bible §04).
//
// src/middleware.ts short-circuits these routes before any session gating, so
// nothing in this subtree can redirect to /login.

export default function MenuDeskFunnelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-brand-menudesk-navy">
      {children}
    </div>
  )
}
