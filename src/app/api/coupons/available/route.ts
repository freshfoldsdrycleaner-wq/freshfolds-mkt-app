import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/coupons/available
 * Offers the admin chose to show to everyone, minus the ones this customer
 * can no longer use. Only code, text and minimum order are returned.
 */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "CUSTOMER");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: { active: true, isPublic: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (coupons.length === 0) return NextResponse.json({ offers: [] });

  const codes = coupons.map((c) => c.code);
  const [total, mine] = await Promise.all([
    prisma.order.groupBy({ by: ["couponCode"], where: { couponCode: { in: codes }, status: { not: "CANCELLED" } }, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["couponCode"], where: { couponCode: { in: codes }, customerId: session.userId, status: { not: "CANCELLED" } }, _count: { _all: true } }),
  ]);
  const totalOf = new Map(total.map((t) => [t.couponCode, t._count._all]));
  const mineOf = new Map(mine.map((t) => [t.couponCode, t._count._all]));

  const offers = coupons
    .filter((c) => (c.usageLimit == null || (totalOf.get(c.code) ?? 0) < c.usageLimit) && (mineOf.get(c.code) ?? 0) < c.perCustomerLimit)
    .map((c) => {
      const val = Number(c.discountValue);
      const title = c.discountType === "PERCENT" ? `${val}% off` : `Rs ${val} off`;
      const bits: string[] = [];
      if (c.discountType === "PERCENT" && c.maxDiscount != null) bits.push(`up to Rs ${Number(c.maxDiscount)}`);
      if (Number(c.minOrderValue) > 0) bits.push(`on orders above Rs ${Number(c.minOrderValue)}`);
      if (c.expiresAt) bits.push(`till ${c.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`);
      return { code: c.code, title, detail: bits.join(" · ") };
    });
  return NextResponse.json({ offers });
}
