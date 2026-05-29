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
