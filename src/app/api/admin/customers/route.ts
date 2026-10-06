import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/** GET /api/admin/customers: all registered customers with phone, email and order totals (Fresh Fold admin only). */
export async function GET(req: Request) {
  try {
    requireRole(requireSession(req), "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const users = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    orderBy: { createdAt: "desc" },
    include: {
      ordersAsCustomer: { select: { status: true, estimatedTotal: true, finalTotal: true, createdAt: true } },
    },
  });

  return NextResponse.json({
    customers: users.map((u) => {
      const live = u.ordersAsCustomer.filter((o) => o.status !== "CANCELLED");
      const last = u.ordersAsCustomer.reduce<Date | null>((m, o) => (!m || o.createdAt > m ? o.createdAt : m), null);
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        joinedAt: u.createdAt,
        orders: u.ordersAsCustomer.length,
        spent: Math.round(live.reduce((s, o) => s + Number(o.finalTotal ?? o.estimatedTotal), 0) * 100) / 100,
        lastOrderAt: last,
      };
    }),
  });
}
