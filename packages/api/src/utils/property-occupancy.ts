import { PropertyStatus } from '@prisma/client';

export function isOccupiedPropertyStatus(status: string): boolean {
  return status === PropertyStatus.RENTED || status === PropertyStatus.SOLD;
}

export function propertyOccupancyRate(occupied: number, total: number): number | null {
  return total > 0 ? Math.round((occupied / total) * 1000) / 10 : null;
}
