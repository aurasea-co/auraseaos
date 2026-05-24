import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components'

// Sent to a prospective owner by Aurasea staff. Frames the trial,
// surfaces any optional first-month discount, and lands the recipient
// on /owner-setup?token=... where the wizard creates account, org,
// and first branch in one flow.

interface OwnerInvitationEmailProps {
  ownerEmail: string
  organizationName: string
  businessType: 'accommodation' | 'fnb' | 'mixed'
  trialDays: number
  planName: string
  discountPct: number
  promoCode?: string
  token: string
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  divider: '#ececec',
  cardBg: '#ffffff',
  rowBg: '#f7f7f5',
  accent: '#534AB7',
  teal: '#1D9E75',
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

export default function OwnerInvitationEmail({
  organizationName,
  trialDays,
  planName,
  discountPct,
  promoCode,
  token,
}: OwnerInvitationEmailProps) {
  const setupUrl = `https://app.auraseaos.com/owner-setup?token=${token}`
  const planLabel = PLAN_LABEL_TH[planName] || planName

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          {/* Logo */}
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
            aurasea
          </Text>

          {/* Hero card with teal top accent */}
          <Section style={{
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderTop: `3px solid ${COLORS.teal}`,
            borderRadius: 10,
            padding: '24px 22px',
            marginBottom: 24,
          }}>
            {promoCode && (
              <Text style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 999,
                background: COLORS.amberBg,
                color: COLORS.amber,
                margin: '0 0 12px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {promoCode}
              </Text>
            )}

            <Text style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 10px' }}>
              คุณได้รับเชิญให้ลองใช้ Aurasea OS
            </Text>
            <Text style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.55, margin: 0 }}>
              ขอบคุณที่สนใจ Aurasea OS — ระบบ AI วิเคราะห์การดำเนินงานสำหรับธุรกิจ Hospitality และ F&B ในไทย
            </Text>
          </Section>

          {/* Trial summary */}
          <Section style={{ backgroundColor: COLORS.rowBg, padding: '14px 16px', borderRadius: 8, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, margin: 0 }}>
              คุณได้รับสิทธิ์ทดลองใช้งานฟรี <strong>{trialDays} วัน</strong>
              <br />
              แผน <strong>{planLabel}</strong> สำหรับ <strong>{organizationName || 'บริษัทของคุณ'}</strong>
            </Text>
          </Section>

          {/* Discount box (conditional) */}
          {discountPct > 0 && (
            <Section style={{
              background: COLORS.amberBg,
              border: `1px solid ${COLORS.amberBorder}`,
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 24,
            }}>
              <Text style={{ fontSize: 13, color: COLORS.amber, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
                พิเศษสำหรับคุณ: ลด {discountPct}% เดือนแรกหากต่ออายุภายใน 7 วันหลังหมดทดลอง
              </Text>
            </Section>
          )}

          {/* Value props */}
          <Section style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, margin: '0 0 10px' }}>
              📊 สรุปธุรกิจทุกเช้า 7.00 น. ทาง LINE
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, margin: '0 0 10px' }}>
              ⚡ แจ้งเตือนอัตโนมัติเมื่อตัวเลขผิดปกติ
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, margin: 0 }}>
              📈 วิเคราะห์แนวโน้ม Margin / ADR / Occupancy
            </Text>
          </Section>

          {/* CTA */}
          <Section style={{ textAlign: 'center' as const, marginBottom: 12 }}>
            <Button
              href={setupUrl}
              style={{
                backgroundColor: COLORS.accent,
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 600,
                padding: '14px 32px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              เริ่มต้นใช้งานฟรี {trialDays} วัน →
            </Button>
          </Section>
          <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center' as const, margin: '0 0 28px' }}>
            ลิงก์นี้หมดอายุใน 7 วัน
          </Text>

          <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 16px' }} />

          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, lineHeight: 1.5, margin: 0 }}>
            Aurasea OS · หากคุณไม่ได้คาดหวังอีเมลนี้ ไม่ต้องดำเนินการใดๆ
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
