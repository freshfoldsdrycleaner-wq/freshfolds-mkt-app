import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * GET /api/drycleaners/me
 * A dry-cleaner owner's view of their own business, regardless of status
 * (PENDING/ACTIVE/SUSPENDED/DEACTIVATED) — unlike the public
 * /api/drycleaners/:id route, which only ever shows ACTIVE businesses to
 * customers. Returns 404 if this account hasn't registered one yet.
 */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "DRYCLEANER_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const dryCleaner = await prisma.dryCleaner.findUnique({ where: { ownerId: session.userId } });
  if (!dryCleaner) {
    return NextResponse.json({ error: "No dry-cleaner registered on this account yet" }, { status: 404 });
  }

  return NextResponse.json({
    dryCleaner: {
      id: dryCleaner.id,
      businessName: dryCleaner.businessName,
      phone: dryCleaner.phone,
      address: dryCleaner.address,
      latitude: dryCleaner.latitude,
      longitude: dryCleaner.longitude,
      operatingHours: dryCleaner.operatingHours,
      status: dryCleaner.status,
      createdAt: dryCleaner.createdAt,
    },
  });
}
