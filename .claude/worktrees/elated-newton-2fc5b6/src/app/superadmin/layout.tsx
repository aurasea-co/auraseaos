import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SuperadminShell } from '@/components/superadmin/SuperadminShell'

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <SuperadminShell email={user.email || ''}>{children}</SuperadminShell>
}
