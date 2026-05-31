// Line Messaging API integration — Phase 6
// Replaces Line Notify (discontinued March 31, 2025)
// Uses Line OA: Aurasea via Messaging API

const LINE_API = 'https://api.line.me/v2/bot'

export async function sendLineMessage(userId: string, message: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.log('[LINE] Not configured — LINE_CHANNEL_ACCESS_TOKEN not set')
    return false
  }

  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: message }],
    }),
  })
  return res.ok
}

export async function sendLineFlexMessage(
  userId: string,
  altText: string,
  flexContent: object
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return false

  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'flex', altText, contents: flexContent }],
    }),
  })
  if (!res.ok) {
    // LINE returns descriptive JSON on rejection — surface it so a
    // malformed bubble doesn't silently disappear into res.ok=false.
    const body = await res.text()
    console.error(`[LINE] flex push failed ${res.status}: ${body.slice(0, 500)}`)
  }
  return res.ok
}

// LINE Messaging API allows up to 5 messages per push() call. Used by
// the morning brief when a recipient has both a hotel branch (renders
// as a Flex bubble with the Auto Push approve button) and one or more
// F&B branches in the same org (render as text). Without this, the
// route had to pick one shape and the F&B owners got their hotel brief
// downgraded to text, hiding the Pro-tier ✓ button.
//
// The caller is responsible for the message-object shape — text or
// flex — because the route already knows which is which. The function
// just enforces the 5-message cap and returns the API ok bit.
export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'flex'; altText: string; contents: object }

export async function sendLineMixed(userId: string, messages: LineMessage[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) {
    console.log('[LINE] Not configured — LINE_CHANNEL_ACCESS_TOKEN not set')
    return false
  }
  if (messages.length === 0) return false

  const capped = messages.length > 5 ? messages.slice(0, 5) : messages

  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages: capped }),
  })
  if (!res.ok) {
    // Surface the body once — the LINE API returns useful JSON errors
    // describing exactly which message failed validation.
    const body = await res.text()
    console.error(`[LINE] mixed push failed ${res.status}: ${body.slice(0, 500)}`)
  }
  return res.ok
}

export async function replyLineMessage(replyToken: string, message: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return false

  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: message }],
    }),
  })
  return res.ok
}

export function buildMorningFlashLine(params: {
  branchName: string
  branchType: 'accommodation' | 'fnb'
  date: string
  adr?: number
  adrTarget?: number
  occupancy?: number
  roomsAvailable?: number
  revenue?: number
  margin?: number
  /** 30-day rolling avg margin (F&B). Preferred over `margin` when supplied. */
  marginAvg?: number
  covers?: number
  sales?: number
  /** Per-cover avg spend (F&B). Appended to the covers line when > 0. */
  avgSpend?: number
  recommendation: string
}): string {
  const { branchName, branchType, date } = params

  // Buddhist year compressed to 2 digits (e.g. 2569 → 69). Applied to both
  // accommodation and F&B headers. Idempotent so callers may pre-shorten.
  const shortDate = date.replace(/25(\d{2})/, '$1')

  if (branchType === 'accommodation') {
    const gap = params.adr && params.adrTarget ? params.adr - params.adrTarget : 0
    const adrGapText = gap < 0
      ? ` · ต่ำกว่าเป้า ฿${Math.round(Math.abs(gap))}`
      : gap > 0
        ? ` · เกินเป้า ฿${Math.round(Math.abs(gap))}`
        : ''
    return `● ${branchName} — ${shortDate}\nADR ฿${Math.round(params.adr || 0)}${adrGapText}\nOcc ${Math.round(params.occupancy || 0)}% · ${params.roomsAvailable || 0} ห้องว่าง\nรายได้ ฿${(params.revenue || 0).toLocaleString()}\n\n💡 ${params.recommendation}`
  }

  // F&B formatting:
  //   - Margin shown as a 30-day average if `marginAvg` is supplied, otherwise
  //     falls back to the latest day's margin. Rendered as an integer percent.
  //   - "ลูกค้า X · ฿Y/คน" and "รายได้ ฿Z" rendered on separate lines so each
  //     stat reads on its own row in the LINE chat.
  const marginPct = Math.round(params.marginAvg || params.margin || 0)
  const avgSpend = params.avgSpend
  const coversLeft = avgSpend && avgSpend > 0
    ? `ลูกค้า ${params.covers || 0} · ฿${Math.round(avgSpend).toLocaleString()}/คน`
    : `ลูกค้า ${params.covers || 0}`
  const revenueLine = `รายได้ ฿${(params.sales || 0).toLocaleString()}`
  return `● ${branchName} — ${shortDate}\nMargin (ไม่รวมเงินเดือน) ${marginPct}%\n${coversLeft}\n${revenueLine}\n\n💡 ${params.recommendation}`
}
