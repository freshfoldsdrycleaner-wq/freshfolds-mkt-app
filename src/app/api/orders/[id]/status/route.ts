import { NextResponse } from "next/server";
import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

/**
 * POST /api/orders/:id/status
 * Section 16/23/39: the only way an order's status can change. The
 * requested status is validated against the state machine before anything
 * is written — illegal jumps (e.g. ORDER_PLACED -> DELIVERED) are rejected
 * with a 409, regardless of who's asking. The owning dry-cleaner, an admin,
 * or the delivery person actually assigned to this order may call it.
 * Moving to PICKED_UP additionally requires a recorded condition report
 * (Defect row) AND the customer's sign-off on it (rule 8/9) — see the
 * hasPickupConditionReport guard below.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwnerDryCleaner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  let isAssignedDelivery = false;
  if (session.role === "DELIVERY_PERSON") {
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderId: order.id, deliveryPersonId: session.userId },
    });
    isAssignedDelivery = !!assignment;
  }
  if (!isOwnerDryCleaner && !isAdmin && !isAssignedDelivery) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let hasPickupConditionReport: boolean | undefined;
    if (parsed.data.status === "PICKED_UP") {
      const [defectCount, confirmedOrder] = await Promise.all([
        prisma.defect.count({ where: { orderId: order.id } }),
        prisma.order.findUnique({ where: { id: order.id }, select: { pickupConditionConfirmedAt: true } }),
      ]);
      // Rule 8 & 9: both the delivery person's condition report AND the
      // customer's sign-off on it must exist before pickup can complete.
      hasPickupConditionReport = defectCount > 0 && !!confirmedOrder?.pickupConditionConfirmedAt;
    }

    const nextStatus = assertTransition(order.status, parsed.data.status, { hasPickupConditionReport });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });

    await getNotificationProvider().send({
      userId: order.customerId,
      orderId: order.id,
      title: "Order update",
      message: `${order.orderNumber} is now: ${nextStatus.replaceAll("_", " ")}`,
    });

    return NextResponse.json({ order: { id: updated.id, status: updated.status } });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
