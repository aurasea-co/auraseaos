// LLM-generated "Today's action" line for the RateDesk morning brief.
// Best-effort ONLY — the caller (per-branch-loader.ts) always has the
// deterministic renderBaseAction() template ready as a fallback, and
// must use it whenever this module returns null. The brief must always
// send; this module's entire contract is "never throw, never hang past
// the timeout, never return something that isn't safe to show".
//
// Forced tool-use (same pattern as vision-extract.ts) so the response is
// always the structured shape below, never free-form prose to re-parse.
// Validation is deliberately paranoid: every fact the model was given is
// numeric and traceable, so any number in the output that isn't one of
// those exact figures is treated as invented (or recomputed — e.g. a
// rate delta the model did the subtraction for itself) and rejected,
// even though the number might be "correct". The system prompt says
// never invent or recompute — this is the automatic check for that,
// not just a hope the model complies.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '@/lib/ai/anthropic-client'
import type { DailyAction } from './engine'

export const ACTION_MODEL = 'claude-haiku-4-5-20251001'
const REQUEST_TIMEOUT_MS = 7000
const MAX_OUTPUT_LENGTH = 320

export interface TodaysActionFacts {
  branchName: string
  /** 0..100. */
  occupancyPct: number
  weekdayNorm: {
    weekdayNameTh: string
    /** 0..100. */
    baselinePct: number
    /** Signed points vs baseline. */
    todayVsNormPct: number
  } | null
  trend: 'improving' | 'worsening' | 'steady'
  /** True when TOMORROW (the night the rec applies to) is Fri/Sat. */
  isWeekend: boolean
  /** Signed points below target occupancy; null when at/above target or no target set. */
  belowTargetPct: number | null
  adrThb: number
  revparThb: number
  perRoomRates: ReadonlyArray<{
    roomType: string
    currentRateThb: number
    suggestedRateThb: number
    direction: 'increase' | 'hold' | 'decrease'
  }>
  competitorCallout: {
    name: string
    /** Always positive — direction carries the sign. */
    gapThb: number
    direction: 'higher' | 'lower'
  } | null
  demandCalendarEvent: { nameTh: string; nameEn: string } | null
}

export interface GeneratedAction {
  action: DailyAction
  model: string
  latencyMs: number
}

const SYSTEM_PROMPT =
  'คุณเป็นที่ปรึกษาด้านการตั้งราคาโรงแรมมืออาชีพในประเทศไทย เขียนคำแนะนำสั้น ๆ หนึ่งข้อ ' +
  'ไม่เกิน 2 ประโยค เป็นภาษาไทยล้วน โดยใช้ตัวเลขที่ให้มาเท่านั้น ห้ามคิดตัวเลขใหม่หรือคำนวณ ' +
  'ตัวเลขเพิ่มเติมเด็ดขาด (เช่น ห้ามลบราคาปัจจุบันกับราคาที่แนะนำเพื่อบอกส่วนต่างเอง) ' +
  'ให้คำแนะนำที่เจาะจงและปฏิบัติได้จริง เช่น ห้องประเภทไหนควรปรับ เปิดหรือปิดดีลออนไลน์ หรือคงราคาไว้ ' +
  'ห้ามใช้ศัพท์เทคนิคภาษาอังกฤษ (ห้ามใช้คำว่า "pts" หรือ "OTA" — ให้พูดเป็นภาษาไทยแทน) ' +
  'ห้ามใช้ markdown หรือสัญลักษณ์จัดรูปแบบใด ๆ ' +
  'น้ำเสียงอบอุ่น ระมัดระวัง เป็นคำแนะนำเท่านั้น — เจ้าของกิจการเป็นผู้ตัดสินใจสุดท้ายเสมอ'

const ACTION_TOOL = {
  name: 'todays_action',
  description: 'One short, situational pricing/action recommendation for a Thai hotel revenue manager.',
  input_schema: {
    type: 'object' as const,
    properties: {
      recommendation_th: {
        type: 'string',
        description:
          'ONE short recommendation, at most 2 sentences, in plain Thai. Use ONLY the numbers given in ' +
          'the facts message — never invent or recompute a number (including simple subtraction like a ' +
          'rate delta). No markdown. No English abbreviations like "pts" or "OTA" — say them in Thai. ' +
          'Warm, conservative, advisory tone — the owner makes the final call.',
      },
    },
    required: ['recommendation_th'],
  },
}

function directionTh(direction: 'increase' | 'hold' | 'decrease'): string {
  if (direction === 'increase') return 'ขึ้น'
  if (direction === 'decrease') return 'ลด'
  return 'คงเดิม'
}

function factsToPrompt(facts: TodaysActionFacts): string {
  const lines: string[] = []
  lines.push(`สาขา: ${facts.branchName}`)
  lines.push(`Occupancy คืนล่าสุด: ${facts.occupancyPct}%`)
  if (facts.weekdayNorm) {
    const sign = facts.weekdayNorm.todayVsNormPct >= 0 ? '+' : ''
    lines.push(
      `ปกติวัน${facts.weekdayNorm.weekdayNameTh}: ${facts.weekdayNorm.baselinePct}% ` +
        `(วันนี้ต่าง ${sign}${facts.weekdayNorm.todayVsNormPct} จากปกติ)`,
    )
  }
  lines.push(
    `แนวโน้ม 3 วันล่าสุด: ${facts.trend === 'improving' ? 'ดีขึ้น' : facts.trend === 'worsening' ? 'แย่ลง' : 'ทรงตัว'}`,
  )
  lines.push(`คืนพรุ่งนี้เป็น: ${facts.isWeekend ? 'วันหยุดสุดสัปดาห์' : 'วันธรรมดา'}`)
  if (facts.belowTargetPct != null) lines.push(`ต่ำกว่าเป้า Occupancy: ${facts.belowTargetPct} จุด`)
  lines.push(`ADR: ${facts.adrThb} บาท`)
  lines.push(`RevPAR: ${facts.revparThb} บาท`)
  lines.push('ราคาต่อประเภทห้อง (ปัจจุบัน → แนะนำ):')
  for (const r of facts.perRoomRates) {
    lines.push(`- ${r.roomType}: ${r.currentRateThb} บาท → ${r.suggestedRateThb} บาท (${directionTh(r.direction)})`)
  }
  if (facts.competitorCallout) {
    const dirTh = facts.competitorCallout.direction === 'higher' ? 'สูงกว่าเรา' : 'ต่ำกว่าเรา'
    lines.push(`คู่แข่ง: ${facts.competitorCallout.name} ตั้งราคา${dirTh} ${facts.competitorCallout.gapThb} บาท`)
  }
  if (facts.demandCalendarEvent) {
    lines.push(`พรุ่งนี้มีอีเวนต์: ${facts.demandCalendarEvent.nameTh}`)
  }
  return lines.join('\n')
}

// Every whole number the model is allowed to mention — built straight
// from the facts object's own fields (not by re-parsing the prompt
// string), so formatting choices in factsToPrompt can't accidentally
// narrow or widen what's "allowed".
function buildAllowedNumbers(facts: TodaysActionFacts): Set<number> {
  const nums = new Set<number>()
  nums.add(Math.round(facts.occupancyPct))
  if (facts.weekdayNorm) {
    nums.add(Math.round(facts.weekdayNorm.baselinePct))
    nums.add(Math.round(facts.weekdayNorm.todayVsNormPct))
    nums.add(Math.round(Math.abs(facts.weekdayNorm.todayVsNormPct)))
  }
  if (facts.belowTargetPct != null) nums.add(Math.round(facts.belowTargetPct))
  nums.add(Math.round(facts.adrThb))
  nums.add(Math.round(facts.revparThb))
  for (const r of facts.perRoomRates) {
    nums.add(Math.round(r.currentRateThb))
    nums.add(Math.round(r.suggestedRateThb))
  }
  if (facts.competitorCallout) nums.add(Math.round(Math.abs(facts.competitorCallout.gapThb)))
  return nums
}

// Excludes digits immediately adjacent to a letter (Thai or Latin) —
// those are part of an identifier like a room-type label ("Deluxe5",
// "Deluxe6"), not a standalone figure the model computed or invented.
// Discovered via live verification: without this exclusion, every
// output that names a numbered room type was rejected as "inventing"
// the digit suffix of its own name.
function extractNumbers(text: string): number[] {
  const matches = text.match(/(?<![A-Za-z฀-๿])\d[\d,]*(\.\d+)?(?![A-Za-z฀-๿])/g) ?? []
  return matches.map((m) => Math.round(Number(m.replace(/,/g, ''))))
}

function containsMarkdown(text: string): boolean {
  return /(\*\*|__|##|`|^\s*[-*]\s|\[.+\]\(.+\))/m.test(text)
}

// At least half of the non-numeric, non-punctuation characters must be
// Thai script. Loose on purpose (Thai copy legitimately mixes in ฿,
// digits, and the occasional Latin room-type name like "Deluxe5").
function looksLikeThai(text: string): boolean {
  const letters = text.replace(/[0-9\s.,฿%()\-–—:/]/g, '')
  if (letters.length === 0) return false
  const thaiChars = letters.match(/[฀-๿]/g)?.length ?? 0
  return thaiChars / letters.length >= 0.5
}

export function validateGeneratedText(
  text: string,
  allowedNumbers: Set<number>,
): { valid: true } | { valid: false; reason: string } {
  const trimmed = text.trim()
  if (!trimmed) return { valid: false, reason: 'empty' }
  if (trimmed.length > MAX_OUTPUT_LENGTH) return { valid: false, reason: `over length cap (${trimmed.length})` }
  if (containsMarkdown(trimmed)) return { valid: false, reason: 'contains markdown' }
  if (!looksLikeThai(trimmed)) return { valid: false, reason: 'not plain Thai' }
  for (const n of extractNumbers(trimmed)) {
    if (!allowedNumbers.has(n)) return { valid: false, reason: `number not in provided facts: ${n}` }
  }
  return { valid: true }
}

/** Attempts one LLM-generated action line. Returns null on ANY failure —
 *  missing key, timeout, API error, empty output, or output that fails
 *  validateGeneratedText() — so the caller always has a clear signal to
 *  fall back to the deterministic template. Never throws. */
export async function generateTodaysAction(facts: TodaysActionFacts): Promise<GeneratedAction | null> {
  const start = Date.now()
  try {
    const client = getAnthropicClient()
    const allowedNumbers = buildAllowedNumbers(facts)
    const response = await client.messages.create(
      {
        model: ACTION_MODEL,
        max_tokens: 300,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        tools: [ACTION_TOOL],
        tool_choice: { type: 'tool', name: ACTION_TOOL.name },
        messages: [{ role: 'user', content: factsToPrompt(facts) }],
      },
      // maxRetries: 0 — a single fixed-timeout attempt. The SDK's default
      // retry-with-backoff would risk blowing the per-branch budget on a
      // transient error; failing fast into the template fallback is the
      // correct behavior for "the brief must always send at 07:01".
      { timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 },
    )
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const raw = toolUse?.input as { recommendation_th?: unknown } | undefined
    const text = typeof raw?.recommendation_th === 'string' ? raw.recommendation_th : ''
    const result = validateGeneratedText(text, allowedNumbers)
    const latencyMs = Date.now() - start
    if (!result.valid) {
      console.warn(`[llm-action] rejected output for branch="${facts.branchName}" (${result.reason}) — falling back`)
      return null
    }
    console.log(`[llm-action] generated for branch="${facts.branchName}" model=${ACTION_MODEL} latencyMs=${latencyMs}`)
    return {
      // No separate English generation is in scope — the email template
      // only ever renders messageEn when lang='en', and the morning-flash
      // route hardcodes lang='th' today, so this is unreachable in
      // practice. Filled with the same Thai text (never left empty)
      // purely so a future lang='en' path degrades to "shows Thai text"
      // rather than "shows a blank action card".
      action: { messageTh: text.trim(), messageEn: text.trim() },
      model: ACTION_MODEL,
      latencyMs,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    console.warn(
      `[llm-action] generation failed for branch="${facts.branchName}" after ${latencyMs}ms — falling back:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
