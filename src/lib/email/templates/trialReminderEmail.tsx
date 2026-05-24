import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components'

interface TrialReminderEmailProps {
  organizationName: string
  daysRemaining: number
  daysWithData: number
  totalRevenueLogged: number
  discountPct: number
  upgradeUrl: string
}

const COLORS = {
  text: '#1a1a1a',
  muted: '#9b9b9b',
  border: '#e5e5e5',
  divider: '#ececec',
  rowBg: '#f7f7f5',
  amberBg: '#FEF6E7',
  amberBorder: '#FCD9A0',
  amber: '#D97706',
  accent: '#534AB7',
  teal: '#1D9E75',
  bg: '#ffffff',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

export default function TrialReminderEmail({
  organizationName,
  daysRemaining,
  daysWithData,
  totalRevenueLogged,
  discountPct,
  upgradeUrl,
}: TrialReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, margin: '0 0 28px' }}>aurasea</Text>

          <Text style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 8px' }}>
            การทดลองใช้ Aurasea OS ของคุณจะสิ้นสุดในอีก {daysRemaining} วัน
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.55, margin: '0 0 20px' }}>
            ขอบคุณที่ทดลองใช้งานกับ <strong>{organizationName}</strong>
          </Text>

          {/* Metrics summary */}
          <Section style={{ backgroundColor: COLORS.rowBg, padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.7, margin: 0 }}>
              📅 บันทึกข้อมูล <strong>{daysWithData} วัน</strong> ระหว่างทดลอง
              <br />
              💰 ยอดขายรวมที่บันทึก <strong>฿{Math.round(totalRevenueLogged).toLocaleString()}</strong>
            </Text>
          </Section>

          {/* Discount nudge */}
          {discountPct > 0 && (
            <Section style={{
              background: COLORS.amberBg,
              border: `1px solid ${COLORS.amberBorder}`,
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 20,
            }}>
              <Text style={{ fontSize: 13, color: COLORS.amber, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
                💎 ต่ออายุภายใน 7 วันหลังหมดทดลอง รับส่วนลด {discountPct}% เดือนแรก
              </Text>
            </Section>
          )}

          <Section style={{ textAlign: 'center' as const, marginBottom: 12 }}>
            <Button
              href={upgradeUrl}
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
              {discountPct > 0 ? `ต่ออายุและรับส่วนลด ${discountPct}% →` : 'ต่ออายุการใช้งาน →'}
            </Button>
          </Section>

          <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '24px 0 16px' }} />
          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, lineHeight: 1.5, margin: 0 }}>
            Aurasea OS · หากคุณไม่ต้องการต่ออายุ ข้อมูลของคุณจะถูกเก็บไว้อย่างปลอดภัย
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
