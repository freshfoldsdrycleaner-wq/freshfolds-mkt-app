import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/admin/drycleaners?status=PENDING
 * Section 28: admin's dry-cleaner management list — defaults to PENDING
 * so the "approvals" screen has a ready-made query, but any status (or
 * none, for everything) works.
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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const dryCleaners = await prisma.dryCleaner.findMany({
    where: status ? { status: status as any } : {},
    include: { owner: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });

  const agg = await prisma.review.groupBy({ by: ["dryCleanerId"], _avg: { rating: true }, _count: { _all: true } });
  const ratingOf = new Map(agg.map((a) => [a.dryCleanerId, a]));

  return NextResponse.json({
    dryCleaners: dryCleaners.map((dc) => ({
      id: dc.id,
      businessName: dc.businessName,
      address: dc.address,
      status: dc.status,
      ownerName: dc.owner.name,
      ownerPhone: dc.owner.phone,
      termsVersion: dc.termsVersion,
      termsAcceptedAt: dc.termsAcceptedAt,
      termsAcceptedBy: dc.termsAcceptedBy,
      createdAt: dc.createdAt,
      avgRating: ratingOf.get(dc.id)?._avg.rating != null ? Math.round(ratingOf.get(dc.id)!._avg.rating! * 10) / 10 : null,
      reviewCount: ratingOf.get(dc.id)?._count._all ?? 0,
    })),
  });
}
