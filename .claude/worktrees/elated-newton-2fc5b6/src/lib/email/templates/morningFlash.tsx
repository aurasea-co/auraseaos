import { Html, Head, Body, Container, Section, Text, Button } from '@react-email/components'

interface MorningFlashProps {
  branchName: string
  businessDate: string
  lang: 'th' | 'en'
  branchType: 'accommodation' | 'fnb'
  adr?: number
  adrTarget?: number
  occupancy?: number
  occupancyTarget?: number
  revenue?: number
  roomsAvailable?: number
  margin?: number
  marginTarget?: number
  covers?: number
  coversTarget?: number
  sales?: number
  recommendationText: string
  plan: 'starter' | 'growth' | 'pro'
  entryUrl: string
}

export default function MorningFlash(props: MorningFlashProps) {
  const { branchName, businessDate, lang, branchType, recommendationText, entryUrl } = props
  const isHotel = branchType === 'accommodation'

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f7f5', fontFamily: '-apple-system, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#534AB7', padding: '24px 32px', borderRadius: '8px 8px 0 0' }}>
            <Text style={{ color: '#fff', fontSize: 16, margin: 0 }}>aurasea</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', margin: '8px 0 0' }}>{branchName}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '4px 0 0' }}>{businessDate}</Text>
          </Section>

          {/* Metrics */}
          <Section style={{ backgroundColor: '#fff', padding: '24px 32px' }}>
            {isHotel ? (
              <>
                <MetricRow label="ADR" value={`฿${Math.round(props.adr || 0).toLocaleString()}`} target={props.adrTarget ? `฿${props.adrTarget.toLocaleString()}` : undefined} above={(props.adr || 0) >= (props.adrTarget || 0)} />
                <MetricRow label="Occupancy" value={`${Math.round(props.occupancy || 0)}%`} target={props.occupancyTarget ? `${props.occupancyTarget}%` : undefined} above={(props.occupancy || 0) >= (props.occupancyTarget || 0)} />
                <MetricRow label={lang === 'th' ? 'รายได้' : 'Revenue'} value={`฿${(props.revenue || 0).toLocaleString()}`} />
                <MetricRow label={lang === 'th' ? 'ห้องว่าง' : 'Available'} value={`${props.roomsAvailable || 0} ${lang === 'th' ? 'ห้อง' : 'rooms'}`} />
              </>
            ) : (
              <>
                <MetricRow label="Margin" value={`${(props.margin || 0).toFixed(1)}%`} target={props.marginTarget ? `${props.marginTarget}%` : undefined} above={(props.margin || 0) >= (props.marginTarget || 0)} />
                <MetricRow label="Covers" value={`${props.covers || 0}`} target={props.coversTarget ? `${props.coversTarget}` : undefined} above={(props.covers || 0) >= (props.coversTarget || 0)} />
                <MetricRow label={lang === 'th' ? 'ยอดขาย' : 'Sales'} value={`฿${(props.sales || 0).toLocaleString()}`} />
              </>
            )}
          </Section>

          {/* Recommendation */}
          <Section style={{ backgroundColor: '#fff', padding: '0 32px 24px' }}>
            <div style={{ borderLeft: '3px solid #534AB7', padding: '12px 16px', backgroundColor: '#f7f7f5', borderRadius: 4 }}>
              <Text style={{ fontSize: 14, lineHeight: '1.6', color: '#1a1a1a', margin: 0 }}>{recommendationText}</Text>
            </div>
          </Section>

          {/* CTA */}
          <Section style={{ backgroundColor: '#fff', padding: '0 32px 32px', borderRadius: '0 0 8px 8px' }}>
            <Button href={entryUrl} style={{ backgroundColor: '#534AB7', color: '#fff', fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 6, textDecoration: 'none', display: 'inline-block' }}>
              {lang === 'th' ? 'กรอกข้อมูลวันนี้' : 'Enter today\'s data'}
            </Button>
          </Section>

          {/* Footer */}
          <Section style={{ padding: '16px 32px' }}>
            <Text style={{ fontSize: 11, color: '#9b9b9b', textAlign: 'center' as const, margin: 0 }}>
              {lang === 'th' ? 'ส่งโดย Aurasea' : 'Sent by Aurasea'}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

function MetricRow({ label, value, target, above }: { label: string; value: string; target?: string; above?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <Text style={{ fontSize: 12, color: '#9b9b9b', margin: 0 }}>{label}</Text>
      <div style={{ textAlign: 'right' as const }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: above === undefined ? '#1a1a1a' : above ? '#1D9E75' : '#A32D2D', margin: 0 }}>{value}</Text>
        {target && <Text style={{ fontSize: 11, color: '#9b9b9b', margin: '2px 0 0' }}>vs {target}</Text>}
      </div>
    </div>
  )
}
