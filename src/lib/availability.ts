import { prisma } from "@/lib/prisma";

/** Start of today in India (IST, UTC+5:30) as a UTC Date. */
export function startOfTodayIST(): Date {
  const IST_MS = 5.5 * 3600 * 1000;
  const istNow = new Date(Date.now() + IST_MS);
  const istMidnight = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  return new Date(istMidnight - IST_MS);
}

export async function ordersTodayFor(dryCleanerIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.order.groupBy({
    by: ["dryCleanerId"],
    where: { dryCleanerId: { in: dryCleanerIds }, createdAt: { gte: startOfTodayIST() }, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.dryCleanerId, r._count._all]));
}

export interface Availability {
  open: boolean;
  message: string | null;
}

export function availabilityOf(
  dc: { acceptingOrders: boolean; dailyOrderLimit: number | null },
  ordersToday: number
): Availability {
  if (!dc.acceptingOrders) return { open: false, message: "Currently closed. Not taking orders right now." };
  if (dc.dailyOrderLimit != null && ordersToday >= dc.dailyOrderLimit) {
    return { open: false, message: "Fully booked for today. Please try again tomorrow." };
  }
  return { open: true, message: null };
}
