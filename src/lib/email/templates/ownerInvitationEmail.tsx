import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components'

// Sent to a prospective owner by Aurasea staff. Frames the trial,
// surfaces any optional first-month discount, and lands the recipient
// on /owner-setup?token=... where the wizard creates account, org,
// and first branch in one flow.

export type OwnerInvitationTier = 'founding' | 'early_adopter' | 'standard'

interface OwnerInvitationEmailProps {
  ownerEmail: string
  organizationName: string
  businessType: 'accommodation' | 'fnb' | 'mixed'
  trialDays: number
  planName: string
  planPrice?: number
  discountPct: number
  promoCode?: string
  tier?: OwnerInvitationTier
  token: string
}

const COLORS = {
  text: '#1a1a1a',
  body: '#3a3a3a',
  muted: '#9b9b9b',
  subtle: '#6b6b6b',
  border: '#e5e5e5',
  divider: '#ececec',
  cardBg: '#ffffff',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  teal: '#1D9E75',
  tealBg: '#E6F4EF',
  tealBorder: '#BBE0D0',
  gold: '#A06A1F',
  goldBg: '#FBF1DE',
  goldBorder: '#E9CC8E',
  amber: '#D97706',
  amberBg: '#FEF6E7',
  amberBorder: '#FCD9A0',
  bg: '#ffffff',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

const PLAN_LABEL_TH: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
}

// Derive tier from promoCode when an explicit tier isn't passed in.
function inferTier(promoCode: string | undefined, explicit: OwnerInvitationTier | undefined): OwnerInvitationTier {
  if (explicit) return explicit
  const code = (promoCode || '').toUpperCase()
  if (code.startsWith('FOUNDING')) return 'founding'
  if (code.startsWith('EARLY')) return 'early_adopter'
  return 'standard'
}

// Pull the "#47" off the end of a promo label like "FOUNDING-47" or
// "Early Adopter #12". Empty string if no number can be found — the
// badge then renders without the trailing "#N".
function extractMemberNumber(promoCode: string | undefined): string {
  if (!promoCode) return ''
  const m = promoCode.match(/(\d+)\s*$/)
  return m ? m[1] : ''
}

export default function OwnerInvitationEmail({
  organizationName,
  trialDays,
  planName,
  planPrice,
  discountPct,
  promoCode,
  tier: tierProp,
  token,
}: OwnerInvitationEmailProps) {
  const setupUrl = `https://app.auraseaos.com/owner-setup?token=${token}`
  const planLabel = PLAN_LABEL_TH[planName] || planName
  const tier = inferTier(promoCode, tierProp)
  const memberNumber = extractMemberNumber(promoCode)

  const isFounding = tier === 'founding'
  const isEarly = tier === 'early_adopter'

  const heroHeading = isFounding
    ? 'ขอเชิญคุณเป็น Founding Partner ของ Aurasea OS'
    : isEarly
      ? 'คุณได้รับสิทธิ์ทดลองใช้ Aurasea OS ก่อนใคร'
      : 'คุณได้รับเชิญให้ลองใช้ Aurasea OS'

  // Standard-tier invitations with a non-empty promo code used to
  // render no badge at all — only FOUNDING/EARLY prefixes produced
  // one. Fall back to a neutral "PROMO · {code}" pill so super
  // admins typing arbitrary labels (SETT2026, PARTNER-XYZ, etc.)
  // still see their promo carried through to the owner's inbox.
  const trimmedPromo = (promoCode || '').trim()
  const badgeLabel = isFounding
    ? `Founding Partner${memberNumber ? ` #${memberNumber}` : ''}`
    : isEarly
      ? `Early Adopter${memberNumber ? ` #${memberNumber}` : ''}`
      : trimmedPromo
        ? `Promo · ${trimmedPromo}`
        : null

  const badgeBg = isFounding ? COLORS.goldBg : isEarly ? COLORS.tealBg : COLORS.rowBg
  const badgeFg = isFounding ? COLORS.gold : isEarly ? COLORS.teal : COLORS.subtle
  const badgeBorder = isFounding ? COLORS.goldBorder : isEarly ? COLORS.tealBorder : COLORS.border

  const orgDisplay = organizationName || 'ธุรกิจของคุณ'
  const priceLine = planPrice
    ? `แผน ${planLabel} มูลค่า ฿${planPrice.toLocaleString('th-TH')}/เดือน`
    : `แผน ${planLabel}`

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          {/* Header: brand + tier badge */}
          <Section style={{
            background: COLORS.cardBg,
            borderTop: `3px solid ${COLORS.teal}`,
            borderLeft: `1px solid ${COLORS.border}`,
            borderRight: `1px solid ${COLORS.border}`,
            borderBottom: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: '24px 22px',
            marginBottom: 18,
          }}>
            <Text style={{ fontSize: 12, color: COLORS.muted, letterSpacing: '0.02em', margin: '0 0 14px' }}>
              aurasea
            </Text>

            {badgeLabel && (
              <Text style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 999,
                background: badgeBg,
                color: badgeFg,
                border: `1px solid ${badgeBorder}`,
                margin: '0 0 14px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {badgeLabel}
              </Text>
            )}

            <Text style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 14px' }}>
              {heroHeading}
            </Text>

            <Text style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: '0 0 10px' }}>
              สวัสดีครับ/ค่ะ
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: '0 0 10px' }}>
              Aurasea OS คือระบบ AI ที่ช่วยเจ้าของธุรกิจ Hospitality และ F&B ในไทยวิเคราะห์การดำเนินงานได้ง่ายขึ้น — โดยไม่ต้องนั่งดู spreadsheet
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.body, lineHeight: 1.65, margin: 0 }}>
              เราเลือกคุณมาเป็นหนึ่งในผู้ใช้กลุ่มแรก เพราะเชื่อว่า <strong style={{ color: COLORS.text }}>{orgDisplay}</strong> จะเป็นตัวอย่างที่ดีของธุรกิจที่ใช้ข้อมูลขับเคลื่อนการตัดสินใจ
            </Text>
          </Section>

          {/* Trial offer box */}
          <Section style={{
            background: COLORS.tealBg,
            border: `1px solid ${COLORS.tealBorder}`,
            borderRadius: 10,
            padding: '18px 20px',
            marginBottom: 24,
          }}>
            <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.teal, margin: '0 0 10px' }}>
              🎁 สิทธิพิเศษของคุณ
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.7, margin: '0 0 4px' }}>
              ✓ ทดลองใช้งานฟรี <strong>{trialDays} วัน</strong> — ไม่ต้องใส่บัตรเครดิต
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.7, margin: '0 0 4px' }}>
              ✓ {priceLine}
            </Text>
            {discountPct > 0 && (
              <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.7, margin: 0 }}>
                ✓ ลด <strong>{discountPct}%</strong> เดือนแรกหากต่ออายุ
              </Text>
            )}
          </Section>

          {/* Value props */}
          <Text style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, margin: '0 0 14px' }}>
            คุณจะได้อะไรจาก Aurasea OS?
          </Text>

          <Section style={{
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: '18px 20px',
            marginBottom: 12,
          }}>
            <Text style={{ fontSize: 22, margin: '0 0 6px' }}>⏰</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: '0 0 6px' }}>
              ประหยัดเวลา
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.body, lineHeight: 1.6, margin: 0 }}>
              สรุปธุรกิจทุกเช้า 7.00 น. ทาง LINE — ไม่ต้องเปิด spreadsheet ตื่นมาเห็นตัวเลขสำคัญทันที
            </Text>
          </Section>

          <Section style={{
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: '18px 20px',
            marginBottom: 12,
          }}>
            <Text style={{ fontSize: 22, margin: '0 0 6px' }}>🔔</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: '0 0 6px' }}>
              รู้ทันปัญหา
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.body, lineHeight: 1.6, margin: 0 }}>
              แจ้งเตือนอัตโนมัติเมื่อ Margin หรือ Labour cost ผิดปกติ — จัดการได้ก่อนปัญหาจะลุกลาม
            </Text>
          </Section>

          <Section style={{
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            padding: '18px 20px',
            marginBottom: 24,
          }}>
            <Text style={{ fontSize: 22, margin: '0 0 6px' }}>📈</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: '0 0 6px' }}>
              ตัดสินใจได้ดีขึ้น
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.body, lineHeight: 1.6, margin: 0 }}>
              วิเคราะห์แนวโน้ม ADR, Occupancy, Margin ย้อนหลัง 30-90 วัน พร้อมคำแนะนำที่ practical สำหรับธุรกิจของคุณ
            </Text>
          </Section>

          {/* CTA */}
          <Section style={{ textAlign: 'center' as const, marginBottom: 10 }}>
            <Button
              href={setupUrl}
              style={{
                backgroundColor: COLORS.accent,
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 600,
                padding: '16px 36px',
                borderRadius: 10,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              เริ่มต้นใช้งานฟรี {trialDays} วัน →
            </Button>
          </Section>
          <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center' as const, margin: '0 0 14px' }}>
            ลิงก์นี้หมดอายุใน 7 วัน · ไม่ต้องใส่บัตรเครดิต
          </Text>

          {discountPct > 0 && (
            <Section style={{
              background: COLORS.amberBg,
              border: `1px solid ${COLORS.amberBorder}`,
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 28,
            }}>
              <Text style={{ fontSize: 12, color: COLORS.amber, textAlign: 'center' as const, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
                ⏰ ส่วนลด {discountPct}% สำหรับเดือนแรก — สำหรับผู้ที่ต่ออายุภายใน 7 วันหลังหมดทดลองเท่านั้น
              </Text>
            </Section>
          )}

          {discountPct === 0 && <div style={{ marginBottom: 16 }} />}

          <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 14px' }} />

          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, lineHeight: 1.6, margin: 0 }}>
            Aurasea OS · app.auraseaos.com
            <br />
            หากคุณไม่ได้คาดหวังอีเมลนี้ ไม่ต้องดำเนินการใดๆ
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
