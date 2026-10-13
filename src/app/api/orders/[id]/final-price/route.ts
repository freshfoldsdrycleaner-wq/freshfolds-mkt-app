import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { recalculateAfterFinalPrice, customerPrice } from "@/lib/pricing";
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

  const discount = Number(order.discountAmount ?? 0);
  let payableTotal: number;
  let breakdown: { commissionAmount: number; dryCleanerNetAmount: number; customerBalanceDue: number };
  if (order.markupPricing) {
    // The dry-cleaner enters HIS OWN price for the work. The app fee is added on
    // top automatically; any offer is paid by Fresh Folds, not by him.
    const dcAmount = Math.round(parsed.data.finalTotal * 100) / 100;
    const customerTotal = customerPrice(dcAmount, Number(order.commissionRate));
    payableTotal = Math.max(0, Math.round((customerTotal - discount) * 100) / 100);
    breakdown = {
      commissionAmount: Math.round((payableTotal - dcAmount) * 100) / 100,
      dryCleanerNetAmount: dcAmount,
      customerBalanceDue: Math.round((payableTotal - Number(order.amountPaid)) * 100) / 100,
    };
  } else {
    // Older orders: the entered value is the full price and commission comes out of it.
    payableTotal = Math.max(0, Math.round((parsed.data.finalTotal - discount) * 100) / 100);
    breakdown = recalculateAfterFinalPrice(payableTotal, Number(order.commissionRate), Number(order.amountPaid));
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: {
        finalTotal: payableTotal,
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
        orderValue: payableTotal,
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
    message: `${order.orderNumber}: your total is now Rs ${payableTotal}. Balance to pay: Rs ${breakdown.customerBalanceDue}.`,
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
