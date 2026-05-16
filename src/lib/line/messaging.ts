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
      ? ` ต่ำกว่าเป้า ฿${Math.round(Math.abs(gap))}`
      : gap > 0
        ? ` เกินเป้า ฿${Math.round(Math.abs(gap))}`
        : ''
    return `🏨 ${branchName} — ${shortDate}\nADR ฿${Math.round(params.adr || 0)}${adrGapText}\nOcc ${Math.round(params.occupancy || 0)}% · ${params.roomsAvailable || 0} ห้องว่าง\nรายได้ ฿${(params.revenue || 0).toLocaleString()}\n\n💡 ${params.recommendation}`
  }

  // F&B formatting:
  //   - Margin shown as a 30-day average if `marginAvg` is supplied, otherwise
  //     falls back to the latest day's margin. Rendered as an integer percent.
  //   - Covers line gains a per-cover spend suffix when avgSpend > 0.
  const marginPct = Math.round(params.marginAvg || params.margin || 0)
  const avgSpend = params.avgSpend
  const coversLine = avgSpend && avgSpend > 0
    ? `Covers ${params.covers || 0} · ฿${(params.sales || 0).toLocaleString()} · ฿${Math.round(avgSpend).toLocaleString()}/คน`
    : `Covers ${params.covers || 0} · ฿${(params.sales || 0).toLocaleString()}`
  return `☕ ${branchName} — ${shortDate}\nMargin (excl. salary) ${marginPct}%\n${coversLine}\n\n💡 ${params.recommendation}`
}
