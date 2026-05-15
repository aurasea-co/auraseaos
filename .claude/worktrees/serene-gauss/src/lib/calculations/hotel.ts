export function calculateADR(revenue: number, roomsSold: number): number {
  if (roomsSold <= 0) return 0
  return revenue / roomsSold
}

export function calculateOccupancy(roomsSold: number, totalRooms: number): number {
  if (totalRooms <= 0) return 0
  return (roomsSold / totalRooms) * 100
}

export function calculateRevPAR(adr: number, occupancy: number): number {
  return adr * (occupancy / 100)
}

export function calculateDailySalaryCost(monthlySalary: number, operatingDays: number): number {
  if (operatingDays <= 0) return 0
  return monthlySalary / operatingDays
}

export function calculateLabourPct(dailySalaryCost: number, revenue: number): number {
  if (revenue <= 0) return 0
  return (dailySalaryCost / revenue) * 100
}

export function calculateMinRevenueForLabourTarget(dailyCost: number, labourTargetPct: number): number {
  if (labourTargetPct <= 0) return 0
  return dailyCost / (labourTargetPct / 100)
}

export function calculateMinRoomsForLabourTarget(minRevenue: number, adrTarget: number): number {
  if (adrTarget <= 0) return 0
  return Math.ceil(minRevenue / adrTarget)
}
