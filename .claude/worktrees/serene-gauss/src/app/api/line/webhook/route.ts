import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendLineFlexMessage, replyLineMessage } from '@/lib/line/messaging'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature')
  const secret = process.env.LINE_CHANNEL_SECRET

  if (!secret || !signature) {
    return NextResponse.json({ error: 'Not configured' }, { status: 400 })
  }

  // Verify signature
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64')
  if (hash !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const { events } = JSON.parse(body)

  for (const event of events) {
    if (event.type === 'follow') {
      await handleFollow(event.source.userId)
    }
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event.source.userId, event.message.text, event.replyToken)
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleFollow(lineUserId: string) {
  const linkUrl = `https://auraseaos.com/api/line/link?lineUserId=${Buffer.from(lineUserId).toString('base64')}`

  await sendLineFlexMessage(lineUserId, 'ยินดีต้อนรับสู่ Aurasea', {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: 'ยินดีต้อนรับสู่ Aurasea', weight: 'bold', size: 'lg' },
        { type: 'text', text: 'เชื่อมต่อบัญชีเพื่อรับสรุปธุรกิจทุกเช้า', wrap: true, color: '#6b6b6b', size: 'sm' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: { type: 'uri', label: 'เชื่อมต่อบัญชี Aurasea', uri: linkUrl },
          style: 'primary',
          color: '#534AB7',
        },
      ],
    },
  })
}

async function handleMessage(lineUserId: string, text: string, replyToken: string) {
  // Check if user is already linked
  const supabase = createServiceClient()
  const { data: profile } = await supabase.from('profiles').select('user_id').eq('line_user_id', lineUserId).maybeSingle()

  if (profile) {
    await replyLineMessage(replyToken, 'บัญชี Aurasea ของคุณเชื่อมต่อแล้ว ✓\nคุณจะได้รับสรุปธุรกิจทุกเช้าผ่าน Line')
  } else {
    const linkUrl = `https://auraseaos.com/api/line/link?lineUserId=${Buffer.from(lineUserId).toString('base64')}`
    await replyLineMessage(replyToken, `กรุณาเชื่อมต่อบัญชี Aurasea ก่อน:\n${linkUrl}`)
  }
}
