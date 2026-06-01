// Canonical types for hotel CSV ingestion (Phase R1).
//
// THB stored as plain numeric to match the existing
// accommodation_daily_metrics convention. No satang conversion.
//
// Multiple CSV rows per date (one per room type) aggregate into a
// single CanonicalHotelDay before the API route writes to the DB.

export interface RoomTypeOccupancy {
  /** Free-text e.g. 'Deluxe', 'Suite', 'Standard'. */
  roomType: string
  totalRooms: number
  occupiedRooms: number
  /** THB. The CSV-input value before aggregation. */
  rateThb: number
}

export interface CanonicalHotelDay {
  /** YYYY-MM-DD, normalized to Bangkok wall date. */
  date: string
  roomTypeBreakdown: RoomTypeOccupancy[]
  /** Aggregated: sum(occupiedRooms) / sum(totalRooms). 0–1 float. */
  occupancyRate: number
  /** Weighted by occupiedRooms across room types. */
  adrThb: number
  /** adrThb × occupancyRate. */
  revparThb: number
  /** Sum of rateThb × occupiedRooms across room types. */
  totalRevenueThb: number
}

// ── F&B ────────────────────────────────────────────────────────────────────
//
// CanonicalFnbDay is the ingestion contract for POS / spreadsheet imports
// that carry per-menu-item sales. Coexists with the existing
// fnb_daily_metrics table (which holds aggregate daily entries from the
// manual form). The two granularities are intentional:
//   - fnb_daily_metrics — owner-typed daily totals (covers, sales, cost)
//   - fnb_daily_sales   — POS-grained SKU × day rows that roll UP into
//                          the daily totals via the menu_items join
// A future POS adapter (Loyverse, FoodStory, Storehub) emits
// CanonicalFnbDay rows; the API route writes them to fnb_daily_sales
// keyed by menu_items.id. Manual entries continue to write to
// fnb_daily_metrics directly without going through this path.
//
// THB integers throughout. No satang. Money fields carry the `Thb`
// suffix to make the unit visible at every call site.

export interface CanonicalFnbItemSale {
  /** Provider-specific stable identifier for the menu item (POS SKU,
   *  Loyverse ID, etc). Optional — manual / spreadsheet imports may
   *  not have one. When absent, the importer matches by name within
   *  the branch's menu_items catalog. */
  externalItemId?: string
  /** Free-text display name as it appears in the source system. Used
   *  for matching when externalItemId is absent. */
  name: string
  /** Optional category label ("Drinks", "Main", "Dessert"). When the
   *  source carries one, it lands on menu_items.category. */
  category?: string
  unitsSold: number
  /** THB integer per unit. */
  unitPriceThb: number
  /** THB integer per unit. Optional — many POS systems don't expose
   *  cost / COGS data. When provided, drives the food_cost_pct
   *  computation in the daily roll-up. */
  unitCostThb?: number
}

export interface CanonicalFnbDay {
  /** YYYY-MM-DD, normalized to Bangkok wall date. */
  date: string
  items: CanonicalFnbItemSale[]
  /** Sum of unitsSold × unitPriceThb across items. THB integer. The
   *  parser is responsible for computing this; downstream consumers
   *  shouldn't recompute (rounding drift). */
  totalRevenueThb: number
  /** Optional — number of covers / guests for the day. Many POS
   *  systems track this separately from item sales; spreadsheet
   *  imports often don't include it at all. */
  totalCovers?: number
  /** Where the data came from. Maps to fnb_daily_sales.source for
   *  audit + reconciliation between manual entries and POS-imported
   *  rows on the same date. */
  source: 'loyverse' | 'foodstory' | 'storehub' | 'csv' | 'manual'
}

export interface IngestionParseResult {
  days: CanonicalHotelDay[]
  warnings: IngestionWarning[]
  errors: IngestionError[]
}

export interface IngestionWarning {
  /** 1-based CSV row number including header. Use 0 for whole-file warnings. */
  row: number
  code:
    | 'missing_room_type'
    | 'zero_total_rooms'
    | 'future_date'
    | 'duplicate_room_type'
    | 'incomplete_row'
  messageTh: string
  messageEn: string
}

export interface IngestionError {
  row: number
  code:
    | 'missing_column'
    | 'invalid_date'
    | 'invalid_number'
    | 'occupied_exceeds_total'
    | 'empty_file'
  messageTh: string
  messageEn: string
}
