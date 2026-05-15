import { Html, Head, Body, Container, Section, Text } from '@react-email/components'

interface Props {
  branchName: string
  lang: 'th' | 'en'
  labourPct: number
  threshold: number
  branchType: 'accommodation' | 'fnb'
  occupancy?: number
  covers?: number
  coversTarget?: number
}

export default function LabourAlert({ branchName, lang, labourPct, threshold, branchType, occupancy, covers, coversTarget }: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f7f5', fontFamily: '-apple-system, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
          <Section style={{ backgroundColor: '#fff', padding: '32px', borderRadius: 8 }}>
            <Text style={{ fontSize: 16, color: '#534AB7', margin: '0 0 16px' }}>aurasea</Text>
            <div style={{ borderLeft: '3px solid #A32D2D', padding: '12px 16px', backgroundColor: '#FCEBEB', borderRadius: 4, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#791F1F', margin: 0, fontWeight: 'bold' }}>
                {lang === 'th'
                  ? `⚠ Labour cost ${labourPct.toFixed(1)}% เกินเกณฑ์ ${threshold}%`
                  : `⚠ Labour cost ${labourPct.toFixed(1)}% exceeds ${threshold}% threshold`}
              </Text>
              <Text style={{ fontSize: 13, color: '#791F1F', margin: '4px 0 0' }}>{branchName}</Text>
            </div>
            <Text style={{ fontSize: 13, color: '#6b6b6b', margin: '0 0 8px' }}>
              {branchType === 'accommodation'
                ? (lang === 'th' ? `Occupancy ${occupancy || 0}% — กะพนักงานยังคงเต็ม` : `Occupancy ${occupancy || 0}%`)
                : (lang === 'th' ? `Covers ${covers || 0} คน — ต่ำกว่าเป้า ${coversTarget || 0} คน` : `${covers || 0} covers vs ${coversTarget || 0} target`)}
            </Text>
            <Text style={{ fontSize: 13, color: '#1a1a1a', margin: 0 }}>
              {branchType === 'accommodation'
                ? (lang === 'th' ? `ลองลดกะช่วงที่ occupancy ต่ำ` : `Consider reducing shifts during low occupancy`)
                : (lang === 'th' ? `ลองลดกะช่วงเช้าถ้า covers น้อย` : `Consider reducing morning shifts if covers are low`)}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
