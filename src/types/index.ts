// Shared request/response shapes used across API routes and (later) the UI.
// Keeping these separate from Prisma's generated types means the wire
// format can stay stable even if the DB schema evolves.

export type UserRole = "CUSTOMER" | "DRYCLEANER_ADMIN" | "DELIVERY_PERSON" | "FRESHFOLD_ADMIN";

export interface DryCleanerSummary {
  id: string;
  businessName: string;
  address: string;
  distanceKm: number;
  estimatedPickupMinutes: number;
  rating: number | null;
  reviewCount: number;
  startingPrice: number | null;
  operatingHours: string | null;
}

export interface ServiceDto {
  id: string;
  category: string;
  itemName: string;
  serviceName: string;
  price: number;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: string;
  dryCleanerName: string;
  estimatedTotal: number;
  finalTotal: number | null;
  amountPaid: number;
  balanceDue: number | null;
  createdAt: string | Date;
}
