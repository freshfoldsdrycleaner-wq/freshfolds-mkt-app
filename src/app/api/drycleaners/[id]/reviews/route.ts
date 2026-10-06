import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/drycleaners/:id/reviews — public: everyone can see ratings. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rows = await prisma.review.findMany({
    where: { dryCleanerId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { customer: { select: { name: true } } },
  });
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  return NextResponse.json({
    average,
    count,
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      review: r.review,
      createdAt: r.createdAt,
      name: ((r.customer.name || "Customer").trim().split(/\s+/)[0] || "Customer").slice(0, 20),
    })),
  });
}
