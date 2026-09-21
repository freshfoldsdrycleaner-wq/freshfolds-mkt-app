import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/drycleaners/:id — full profile + live price catalog (section 6).
 * Prices are never hard-coded on the frontend: this is the single source
 * of truth a customer's order screen reads from.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const dryCleaner = await prisma.dryCleaner.findUnique({
    where: { id: params.id },
    include: {
      services: { where: { status: "ACTIVE" }, orderBy: [{ category: "asc" }, { itemName: "asc" }] },
      reviews: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!dryCleaner || dryCleaner.status !== "ACTIVE") {
    return NextResponse.json({ error: "Dry-cleaner not found" }, { status: 404 });
  }

  const avgRating =
    dryCleaner.reviews.length > 0
      ? Math.round(
          (dryCleaner.reviews.reduce((s, r) => s + r.rating, 0) / dryCleaner.reviews.length) * 10
        ) / 10
      : null;

  return NextResponse.json({
    id: dryCleaner.id,
    businessName: dryCleaner.businessName,
    address: dryCleaner.address,
    operatingHours: dryCleaner.operatingHours,
    rating: avgRating,
    services: dryCleaner.services.map((s) => {
      const price = Number(s.price);
      const discountPercent = Number(s.discountPercent);
      const effectivePrice = Math.round(price * (1 - discountPercent / 100) * 100) / 100;
      return {
        id: s.id,
        category: s.category,
        itemName: s.itemName,
        serviceName: s.serviceName,
        price,
        discountPercent,
        effectivePrice,
        hasPhoto: s.hasPhoto,
      };
    }),
    reviews: dryCleaner.reviews.map((r) => ({
      rating: r.rating,
      review: r.review,
      createdAt: r.createdAt,
    })),
  });
}
