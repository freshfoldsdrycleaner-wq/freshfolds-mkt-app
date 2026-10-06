import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({
  advanceAmount: z.number().min(0),
});

/**
 * POST /api/orders/:id/self-pickup
 * Soft-launch mode: the dry-cleaner collects the clothes personally and
 * takes the advance (cash/UPI) at the door. One tap records the advance
 * and moves the order straight to PICKED_UP. Only the owning dry-cleaner
 * (or a Fresh Fold admin) can call it, and only while ORDER_PLACED.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the amount collected (0 if nothing)." }, { status: 400 });
  }
  const advance = Math.round(parsed.data.advanceAmount * 100) / 100;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (order.status !== "ORDER_PLACED") {
    return NextResponse.json({ error: "Pickup can only be recorded for a newly placed order." }, { status: 409 });
  }

  const balanceDue = Number(order.balanceDue ?? order.estimatedTotal);
  if (advance > balanceDue) {
    return NextResponse.json({ error: "Amount is more than the order total." }, { status: 400 });
  }

  try {
    const s1 = assertTransition(order.status, "PICKUP_ASSIGNED");
    const s2 = assertTransition(s1, "PICKUP_IN_PROGRESS");
    const s3 = assertTransition(s2, "PICKED_UP", { hasPickupConditionReport: true });

    const updated = await prisma.$transaction(async (tx) => {
      if (advance > 0) {
        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: advance,
            paymentType: "BOOKING",
            transactionId: `CASH-${order.orderNumber}-${Date.now()}`,
            status: "SUCCESS",
          },
        });
      }
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: s3,
          amountPaid: Number(order.amountPaid) + advance,
          balanceDue: balanceDue - advance,
          pickupConditionConfirmedAt: new Date(),
        },
      });
    });

    await getNotificationProvider().send({
      userId: order.customerId,
      orderId: order.id,
      title: "Clothes picked up",
      message:
        advance > 0
          ? `${order.orderNumber}: picked up. Advance of ${advance} received.`
          : `${order.orderNumber}: your clothes have been picked up.`,
    });

    return NextResponse.json({
      order: {
        id: updated.id,
        status: updated.status,
        amountPaid: Number(updated.amountPaid),
        balanceDue: Number(updated.balanceDue),
      },
    });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}