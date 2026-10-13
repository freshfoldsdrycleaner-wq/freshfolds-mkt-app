import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

/** GET /api/drycleaners/:id/offers: live offers this shop gives, shown in the customer's cart. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const now = new Date();
  const offers = await prisma.coupon.findMany({
    where: { dryCleanerId: params.id, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    offers: offers.map((c) => ({
      code: c.code,
      description: c.description,
      label: c.discountType === "PERCENT" ? `${Number(c.discountValue)}% off` : `Rs ${Number(c.discountValue)} off`,
      minOrderValue: Number(c.minOrderValue),
    })),
  });
}
