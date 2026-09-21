import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { haversineDistanceKm, estimateMinutesFromKm } from "@/lib/geo";
import { effectivePrice } from "@/lib/pricing";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/drycleaners?lat=..&lng=..&q=..&maxKm=10&sort=distance|rating|price
 * Section 4-5: nearby search, no paid Maps API — filtering happens in the
 * DB, distance ranking happens in-process with haversine on the (small)
 * candidate set. Only ACTIVE dry-cleaners are ever returned to customers.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const q = searchParams.get("q")?.trim();
  const maxKm = Number(searchParams.get("maxKm") ?? 15);
  const sort = searchParams.get("sort") ?? "distance";

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const dryCleaners = await prisma.dryCleaner.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
              { services: { some: { itemName: { contains: q, mode: "insensitive" } } } },
              { services: { some: { serviceName: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      services: { where: { status: "ACTIVE" } },
      reviews: true,
    },
  });

  const withDistance = dryCleaners
    .map((dc) => {
      const distanceKm = haversineDistanceKm(lat, lng, dc.latitude, dc.longitude);
      const avgRating =
        dc.reviews.length > 0
          ? dc.reviews.reduce((s, r) => s + r.rating, 0) / dc.reviews.length
          : null;
      const startingPrice = dc.services.length
        ? Math.min(...dc.services.map((s) => effectivePrice(Number(s.price), Number(s.discountPercent))))
        : null;

      return {
        id: dc.id,
        businessName: dc.businessName,
        address: dc.address,
        distanceKm,
        estimatedPickupMinutes: estimateMinutesFromKm(distanceKm),
        rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        reviewCount: dc.reviews.length,
        startingPrice,
        operatingHours: dc.operatingHours,
      };
    })
    .filter((dc) => dc.distanceKm <= maxKm);

  withDistance.sort((a, b) => {
    if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    if (sort === "price") return (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity);
    return a.distanceKm - b.distanceKm;
  });

  return NextResponse.json({ dryCleaners: withDistance });
}

const registerSchema = z.object({
  businessName: z.string().min(1),
  phone: z.string().min(6),
  address: z.string().min(3),
  latitude: z.number(),
  longitude: z.number(),
  operatingHours: z.string().optional(),
});

/**
 * POST /api/drycleaners — section 22/28: a DRYCLEANER_ADMIN registers
 * their own business. It ALWAYS starts PENDING and is invisible to
 * customer search until a FRESHFOLD_ADMIN approves it (see
 * /api/admin/drycleaners/:id/status). One dry-cleaner per owner account.
 */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "DRYCLEANER_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const existing = await prisma.dryCleaner.findUnique({ where: { ownerId: session.userId } });
  if (existing) {
    return NextResponse.json({ error: "This account already has a registered dry-cleaner" }, { status: 409 });
  }

  const parsed = registerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const dryCleaner = await prisma.dryCleaner.create({
    data: { ownerId: session.userId, status: "PENDING", ...parsed.data },
  });

  return NextResponse.json({ dryCleaner: { id: dryCleaner.id, status: dryCleaner.status } }, { status: 201 });
}
