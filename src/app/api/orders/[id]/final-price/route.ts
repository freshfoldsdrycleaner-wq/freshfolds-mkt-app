import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { recalculateAfterFinalPrice } from "@/lib/pricing";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({ finalTotal: z.number().positive() });

/**
 * POST /api/orders/:id/final-price
 * Section 15/60: post-inspection price correction. The dry-cleaner sets
 * the actual final order value; commission, dry-cleaner net, and the
 * customer's remaining balance are ALL recalculated here, server-side,
 * from the commission rate locked in at booking — never from the
 * platform's current rate, and never trusted from the client.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "DRYCLEANER_ADMIN", "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  if (!isOwner && session.role !== "FRESHFOLD_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const breakdown = recalculateAfterFinalPrice(
    parsed.data.finalTotal,
    Number(order.commissionRate),
    Number(order.amountPaid)
  );

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: {
        finalTotal: parsed.data.finalTotal,
        commissionAmount: breakdown.commissionAmount,
        dryCleanerNetAmount: breakdown.dryCleanerNetAmount,
        balanceDue: breakdown.customerBalanceDue,
      },
    });
    await tx.commissionTransaction.create({
      data: {
        orderId: order.id,
        dryCleanerId: order.dryCleanerId,
        commissionRate: order.commissionRate,
        orderValue: parsed.data.finalTotal,
        commissionAmount: breakdown.commissionAmount,
        dryCleanerNetAmount: breakdown.dryCleanerNetAmount,
      },
    });
    return o;
  });

  await getNotificationProvider().send({
    userId: order.customerId,
    orderId: order.id,
    title: "Order total updated",
    message: `${order.orderNumber}: final total is now ${parsed.data.finalTotal}. Remaining balance: ${breakdown.customerBalanceDue}.`,
  });

  return NextResponse.json({
    order: {
      id: updated.id,
      finalTotal: Number(updated.finalTotal),
      commissionAmount: Number(updated.commissionAmount),
      dryCleanerNetAmount: Number(updated.dryCleanerNetAmount),
      balanceDue: Number(updated.balanceDue),
    },
  });
}
