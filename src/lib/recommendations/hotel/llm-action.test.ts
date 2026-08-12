import { describe, it, expect } from 'vitest'
import { validateGeneratedText } from './llm-action'

describe('validateGeneratedText', () => {
  const allowed = new Set([80, 46, 869, 365, 1000, 1100, 15])

  it('accepts plain Thai text using only numbers from the allowed set', () => {
    const result = validateGeneratedText(
      'Occupancy วันนี้ 80% สูงกว่าปกติ — ปรับห้อง Deluxe ขึ้นจาก 1,000 เป็น 1,100 บาท และปิดส่วนลดออนไลน์ได้',
      allowed,
    )
    expect(result.valid).toBe(true)
  })

  it('rejects empty output', () => {
    expect(validateGeneratedText('   ', allowed)).toEqual({ valid: false, reason: 'empty' })
  })

  it('rejects output over the length cap', () => {
    const long = 'ห้องพักราคาดี '.repeat(50)
    const result = validateGeneratedText(long, allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/length cap/)
  })

  it('rejects markdown formatting', () => {
    const result = validateGeneratedText('**ควรขึ้นราคา** ห้อง Deluxe วันนี้', allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('contains markdown')
  })

  it('rejects a bullet list', () => {
    const result = validateGeneratedText('- ขึ้นราคา Deluxe\n- คงราคา Suite', allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('contains markdown')
  })

  it('rejects predominantly non-Thai output', () => {
    const result = validateGeneratedText('Raise the Deluxe room rate today and hold the Suite rate.', allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('not plain Thai')
  })

  it('rejects a number not present in the provided facts (invented figure)', () => {
    const result = validateGeneratedText('Occupancy วันนี้ 99% แนะนำขึ้นราคาทันที', allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/number not in provided facts: 99/)
  })

  it('rejects a recomputed delta the model was never given (e.g. a rate difference)', () => {
    // 100 = 1100 - 1000, a number the model would have had to compute
    // itself — even though both operands are in the allowed set, the
    // result isn't, and shouldn't be treated as safe.
    const result = validateGeneratedText('ปรับ Deluxe ขึ้น 100 บาท จาก 1,000 เป็น 1,100', allowed)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toMatch(/number not in provided facts: 100/)
  })

  it('accepts numbers formatted with thousands separators', () => {
    const result = validateGeneratedText('ราคาแนะนำวันนี้อยู่ที่ 1,100 บาท คงราคาห้องอื่นไว้', allowed)
    expect(result.valid).toBe(true)
  })
})
