import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/admin/stats
 * Section 27/66: the admin financial dashboard's headline numbers.
 * Everything here is computed from actual Order/Service rows, never
 * from anything a client could have sent — matching rule 14.
 */
export async function GET(req: Request) {
  try {
    const session = requireSession(req);
    requireRole(session, "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [orders, customerCount, dryCleanerCounts, pendingServiceCount] = await Promise.all([
    prisma.order.findMany({
      select: {
        estimatedTotal: true,
        finalTotal: true,
        commissionAmount: true,
        dryCleanerNetAmount: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.dryCleaner.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.service.count({ where: { status: { not: "ACTIVE" } } }),
  ]);

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const totals = orders.reduce(
    (acc, o) => {
      const value = Number(o.finalTotal ?? o.estimatedTotal);
      acc.grossOrderValue += value;
      acc.totalCommission += Number(o.commissionAmount ?? 0);
      acc.dryCleanerEarnings += Number(o.dryCleanerNetAmount ?? 0);
      acc.customerPaymentsCollected += Number(o.amountPaid);
      acc.pendingCustomerPayments += Number(o.balanceDue ?? 0);
      if (o.status === "CANCELLED") acc.cancelledOrders += 1;
      else if (o.status === "CLOSED" || o.status === "DELIVERED") acc.completedOrders += 1;
      else acc.activeOrders += 1;
      return acc;
    },
    {
      grossOrderValue: 0,
      totalCommission: 0,
      dryCleanerEarnings: 0,
      customerPaymentsCollected: 0,
      pendingCustomerPayments: 0,
      activeOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
    }
  );

  const dryCleanerStatusCounts = Object.fromEntries(
    dryCleanerCounts.map((g) => [g.status, g._count._all])
  );

  return NextResponse.json({
    totalCustomers: customerCount,
    totalDryCleaners: Object.values(dryCleanerStatusCounts).reduce((a: number, b: any) => a + b, 0),
    dryCleanersByStatus: dryCleanerStatusCounts,
    totalOrders: orders.length,
    activeOrders: totals.activeOrders,
    completedOrders: totals.completedOrders,
    cancelledOrders: totals.cancelledOrders,
    pendingServiceChanges: pendingServiceCount,
    grossOrderValue: round2(totals.grossOrderValue),
    totalCommission: round2(totals.totalCommission),
    dryCleanerEarnings: round2(totals.dryCleanerEarnings),
    customerPaymentsCollected: round2(totals.customerPaymentsCollected),
    pendingCustomerPayments: round2(totals.pendingCustomerPayments),
  });
}
