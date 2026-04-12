import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLineMessage } from '@/lib/line/messaging'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await req.json()

  // Get user's line_user_id from profiles
  const serviceClient = createServiceClient()
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('line_user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.line_user_id) {
    return NextResponse.json({ error: 'Line not connected' }, { status: 400 })
  }

  const ok = await sendLineMessage(profile.line_user_id, message || 'ทดสอบจาก Aurasea ✓')
  return NextResponse.json({ success: ok })
}
