import { Html, Head, Body, Container, Section, Text, Button } from '@react-email/components'

interface Props {
  branchName: string
  lang: 'th' | 'en'
  streakDays: number
  entryUrl: string
}

export default function MissedEntryReminder({ branchName, lang, streakDays, entryUrl }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f7f5', fontFamily: '-apple-system, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
          <Section style={{ backgroundColor: '#fff', padding: '32px', borderRadius: 8 }}>
            <Text style={{ fontSize: 16, color: '#534AB7', margin: '0 0 4px' }}>aurasea</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 16px' }}>
              {lang === 'th' ? `⚠ ยังไม่ได้กรอกข้อมูลวันนี้` : `⚠ Entry not submitted today`}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: '1.6', color: '#6b6b6b', margin: '0 0 20px' }}>
              {lang === 'th'
                ? `สาขา ${branchName} ยังไม่มีการกรอกข้อมูลวันนี้ กรอกได้จนถึงเที่ยงคืน`
                : `${branchName} hasn't submitted today's entry. You can still submit until midnight.`}
            </Text>
            <Button href={entryUrl} style={{ backgroundColor: '#534AB7', color: '#fff', fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 6, textDecoration: 'none', display: 'inline-block' }}>
              {lang === 'th' ? 'กรอกข้อมูลตอนนี้ →' : 'Enter data now →'}
            </Button>
            <Text style={{ fontSize: 11, color: '#9b9b9b', margin: '16px 0 0' }}>
              {lang === 'th' ? `สถิติการกรอกล่าสุด: ${streakDays}/7 วัน` : `Recent streak: ${streakDays}/7 days`}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
