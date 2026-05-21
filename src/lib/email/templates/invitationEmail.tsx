import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components'

interface InvitationEmailProps {
  inviteeName?: string
  inviterName: string
  organizationName: string
  branchName: string
  role: 'manager' | 'staff'
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
  bg: '#ffffff',
} as const

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "IBM Plex Sans Thai", sans-serif'

const ROLE_LABEL_TH: Record<'manager' | 'staff', string> = {
  manager: 'Manager',
  staff: 'Staff',
}

const ROLE_DESC_TH: Record<'manager' | 'staff', string> = {
  manager: 'Manager — ดูภาพรวมธุรกิจ, รับสรุปเช้าทาง LINE, ดู Trends และ Cost',
  staff: 'Staff — กรอกข้อมูลประจำวัน (ยอดขาย, ลูกค้า, ต้นทุน)',
}

export default function InvitationEmail({
  inviterName,
  organizationName,
  branchName,
  role,
  token,
}: InvitationEmailProps) {
  const joinUrl = `https://app.auraseaos.com/join?token=${token}`
  const roleLabel = ROLE_LABEL_TH[role]
  const roleDesc = ROLE_DESC_TH[role]

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: FONT_STACK, margin: 0, padding: 0, color: COLORS.text }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          {/* Logo */}
          <Text style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: '-0.01em', margin: '0 0 28px' }}>
            aurasea
          </Text>

          {/* Heading */}
          <Text style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 8px' }}>
            คุณได้รับเชิญให้เข้าร่วม {organizationName}
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.5, margin: '0 0 20px' }}>
            {inviterName} ได้เชิญคุณเป็น {roleLabel} ของ {branchName}
          </Text>

          {/* Role description */}
          <Section style={{ backgroundColor: COLORS.rowBg, padding: '14px 16px', borderRadius: 6, marginBottom: 24 }}>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.55, margin: 0 }}>
              {roleDesc}
            </Text>
          </Section>

          {/* CTA */}
          <Section style={{ textAlign: 'center' as const, marginBottom: 12 }}>
            <Button
              href={joinUrl}
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
              รับคำเชิญและเริ่มใช้งาน →
            </Button>
          </Section>
          <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center' as const, margin: '0 0 28px' }}>
            ลิงก์นี้หมดอายุใน 7 วัน
          </Text>

          <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 24px' }} />

          {/* About */}
          <Text style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, margin: '0 0 14px' }}>
            Aurasea OS คืออะไร?
          </Text>

          <Section style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.55, margin: '0 0 10px' }}>
              📊 สรุปธุรกิจทุกเช้า 7.00 น. ทาง LINE
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.55, margin: '0 0 10px' }}>
              ⚡ แจ้งเตือนอัตโนมัติเมื่อ Margin หรือ Labour ผิดปกติ
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.55, margin: '0 0 24px' }}>
              📝 กรอกข้อมูลง่าย ใช้เวลาไม่ถึง 2 นาทีต่อวัน
            </Text>
          </Section>

          <Hr style={{ borderTop: `1px solid ${COLORS.divider}`, margin: '0 0 16px' }} />

          {/* Footer */}
          <Text style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center' as const, lineHeight: 1.5, margin: 0 }}>
            Aurasea OS · หากคุณไม่ได้คาดหวังอีเมลนี้ ไม่ต้องดำเนินการใดๆ
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
