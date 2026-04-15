/**
 * Maps between the app's unified entry model and the two separate Supabase tables.
 * Live DB has: accommodation_daily_metrics and fnb_daily_metrics (NOT a single daily_metrics table).
 */

export function getEntryTable(businessType: string): string {
  return businessType === 'accommodation'
    ? 'accommodation_daily_metrics'
    : 'fnb_daily_metrics'
}

// ---- Accommodation ----

export interface AccommodationDailyMetric {
  id: string
  branch_id: string
  metric_date: string
  total_rooms: number | null
  rooms_sold: number | null
  revenue: number
  additional_cost_today: number | null
  cash_balance: number | null
  monthly_fixed_cost: number | null
  staff_count: number | null
  confidence_score: number | null
  rooms_on_books_7: number | null
  rooms_on_books_14: number | null
  variable_cost_per_room: number | null
  channel_direct: number | null
  channel_ota: number | null
  notes: string | null
  created_at: string
}

export interface AccommodationEntryInsert {
  branch_id: string
  metric_date: string
  rooms_sold: number
  revenue: number
  total_rooms?: number
  channel_direct?: number | null
  channel_ota?: number | null
  notes?: string | null
}

// ---- F&B ----

export interface FnbDailyMetric {
  id: string
  branch_id: string
  metric_date: string
  total_customers: number | null
  revenue: number
  avg_ticket: number | null
  additional_cost_today: number | null
  other_cost_today: number | null
  cash_balance: number | null
  monthly_fixed_cost: number | null
  staff_count: number | null
  top3_menu_revenue: number | null
  promo_spend: number | null
  cost_food: number | null
  cost_nonfood: number | null
  notes: string | null
  created_at: string
}

export interface FnbEntryInsert {
  branch_id: string
  metric_date: string
  revenue: number
  total_customers: number
  avg_ticket?: number | null
  additional_cost_today?: number | null
  cost_food?: number | null
  cost_nonfood?: number | null
  notes?: string | null
}

// ---- Unified view for home dashboard ----

export interface UnifiedMetric {
  metric_date: string
  revenue: number
  // Hotel
  rooms_sold: number | null
  adr: number | null // computed: revenue / rooms_sold
  // F&B
  customers: number | null
  avg_ticket: number | null
  cost: number | null // total cost (additional_cost_today for both)
}

/** Normalize metric_date to YYYY-MM-DD (Supabase may return timestamp format) */
function normalizeDate(d: string): string {
  return d ? d.substring(0, 10) : d
}

export function accommodationToUnified(m: AccommodationDailyMetric): UnifiedMetric {
  const adr = m.rooms_sold && m.rooms_sold > 0 ? m.revenue / m.rooms_sold : null
  return {
    metric_date: normalizeDate(m.metric_date),
    revenue: m.revenue,
    rooms_sold: m.rooms_sold,
    adr,
    customers: null,
    avg_ticket: null,
    cost: m.additional_cost_today,
  }
}

export function fnbToUnified(m: FnbDailyMetric): UnifiedMetric {
  const totalCost = (m.additional_cost_today || 0) + (m.other_cost_today || 0)
  return {
    metric_date: normalizeDate(m.metric_date),
    revenue: m.revenue,
    rooms_sold: null,
    adr: null,
    customers: m.total_customers,
    avg_ticket: m.avg_ticket,
    cost: totalCost > 0 ? totalCost : null,
  }
}
