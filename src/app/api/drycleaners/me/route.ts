import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ordersTodayFor, availabilityOf } from "@/lib/availability";
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

  const ordersToday = (await ordersTodayFor([dryCleaner.id])).get(dryCleaner.id) ?? 0;
  return NextResponse.json({
    dryCleaner: {
      acceptingOrders: dryCleaner.acceptingOrders,
      dailyOrderLimit: dryCleaner.dailyOrderLimit,
      ordersToday,
      availability: availabilityOf(dryCleaner, ordersToday),
      id: dryCleaner.id,
      businessName: dryCleaner.businessName,
      phone: dryCleaner.phone,
      address: dryCleaner.address,
      latitude: dryCleaner.latitude,
      longitude: dryCleaner.longitude,
      operatingHours: dryCleaner.operatingHours,
      status: dryCleaner.status,
      termsVersion: dryCleaner.termsVersion,
      payoutUpiId: dryCleaner.payoutUpiId,
      razorpayLinked: !!dryCleaner.razorpayAccountId,
      createdAt: dryCleaner.createdAt,
    },
  });
}

const patchSchema = z.object({
  acceptingOrders: z.boolean().optional(),
  dailyOrderLimit: z.number().int().positive().max(10000).nullable().optional(),
  payoutUpiId: z.string().trim().regex(/^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,30}$/, "Enter a UPI ID like name@bank").nullable().optional(),
  operatingHours: z.string().trim().max(80).nullable().optional(),
});

/** PATCH /api/drycleaners/me: switch the store on/off and set the daily order limit. */
export async function PATCH(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "DRYCLEANER_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message?.includes("UPI") ? "Enter a UPI ID like name@bank" : "Enter a whole number of orders, or leave it empty for no limit." }, { status: 400 });
  const dc = await prisma.dryCleaner.findUnique({ where: { ownerId: session.userId } });
  if (!dc) return NextResponse.json({ error: "No dry-cleaner registered on this account yet" }, { status: 404 });
  const updated = await prisma.dryCleaner.update({
    where: { id: dc.id },
    data: {
      ...(parsed.data.acceptingOrders !== undefined ? { acceptingOrders: parsed.data.acceptingOrders } : {}),
      ...(parsed.data.dailyOrderLimit !== undefined ? { dailyOrderLimit: parsed.data.dailyOrderLimit } : {}),
      ...(parsed.data.payoutUpiId !== undefined ? { payoutUpiId: parsed.data.payoutUpiId } : {}),
      ...(parsed.data.operatingHours !== undefined ? { operatingHours: parsed.data.operatingHours } : {}),
    },
  });
  const ordersToday = (await ordersTodayFor([dc.id])).get(dc.id) ?? 0;
  return NextResponse.json({
    acceptingOrders: updated.acceptingOrders,
    dailyOrderLimit: updated.dailyOrderLimit,
    payoutUpiId: updated.payoutUpiId,
    ordersToday,
    availability: availabilityOf(updated, ordersToday),
  });
}
