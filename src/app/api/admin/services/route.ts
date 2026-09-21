import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/admin/services
 * Every service across every dry-cleaner that isn't ACTIVE yet — i.e.
 * every pending add, price/discount/photo edit, or removal waiting on
 * approval. This is what powers the admin console's "Pending service
 * changes" screen; resolving one is done via POST /api/admin/services/:id.
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

  const services = await prisma.service.findMany({
    where: { status: { not: "ACTIVE" } },
    include: { dryCleaner: { select: { businessName: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    services: services.map((s) => ({
      id: s.id,
      dryCleanerId: s.dryCleanerId,
      dryCleanerName: s.dryCleaner.businessName,
      category: s.category,
      itemName: s.itemName,
      serviceName: s.serviceName,
      price: Number(s.price),
      discountPercent: Number(s.discountPercent),
      hasPhoto: s.hasPhoto,
      status: s.status,
      pendingData: s.pendingData,
    })),
  });
}
