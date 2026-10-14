import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider, notifyAdmins } from "@/lib/providers/notification";
import { refundRazorpayAdvance } from "@/lib/razorpay";

/**
 * POST /api/orders/:id/cancel
 * Soft-launch rules: the customer who placed the order, the owning
 * dry-cleaner, or a Fresh Fold admin can cancel, any time while the order
 * is still ORDER_PLACED (i.e. before pickup has been recorded).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isCustomer = session.role === "CUSTOMER" && order.customerId === session.userId;
  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  if (!isCustomer && !isOwner && !isAdmin) {
    return NextResponse.json({ error: "You cannot cancel this order." }, { status: 403 });
  }

  const adminCancellable = ["ORDER_PLACED", "PICKUP_ASSIGNED", "PICKUP_IN_PROGRESS"].includes(order.status);
  if (order.status !== "ORDER_PLACED" && !(isAdmin && adminCancellable)) {
    return NextResponse.json(
      { error: "This order can no longer be cancelled because pickup has already started." },
      { status: 409 }
    );
  }

  try {
    const nextStatus = assertTransition(order.status, "CANCELLED");

    await prisma.$transaction(async (tx) => {
      await tx.commissionTransaction.deleteMany({ where: { orderId: order.id } });
      await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus, balanceDue: 0 },
      });
    });

    const paid = Number(order.amountPaid);
    let refunded = 0;
    let failed = 0;
    if (paid > 0) {
      try {
        ({ refunded, failed } = await refundRazorpayAdvance(order.id));
      } catch {
        failed = paid;
      }
    }
    const manualRefund = Math.max(0, paid - refunded);
    const notifier = getNotificationProvider();
    if (refunded > 0) {
      await notifier.send({
        userId: order.customerId,
        orderId: order.id,
        title: "Refund started",
        message: `${order.orderNumber}: Rs ${refunded} has been refunded to your original payment method. It reaches your account in 5-7 working days.`,
      });
    }
    if (manualRefund > 0 || failed > 0) {
      await notifyAdmins({
        orderId: order.id,
        title: "Refund needed",
        message: `${order.orderNumber} was cancelled. Rs ${manualRefund || failed} advance must be refunded manually.`,
      });
    }
    if (isCustomer) {
      await notifier.send({
        userId: order.dryCleaner.ownerId,
        orderId: order.id,
        title: "Order cancelled",
        message: `${order.orderNumber} was cancelled by the customer.`,
      });
    } else {
      await notifier.send({
        userId: order.customerId,
        orderId: order.id,
        title: "Order cancelled",
        message: isAdmin
          ? `${order.orderNumber} was cancelled by Fresh Folds.`
          : `${order.orderNumber} was cancelled by the dry-cleaner.`,
      });
      if (isAdmin) {
        await notifier.send({
          userId: order.dryCleaner.ownerId,
          orderId: order.id,
          title: "Order cancelled",
          message: `${order.orderNumber} was cancelled by Fresh Folds.`,
        });
      }
    }

    return NextResponse.json({
      order: { id: order.id, status: nextStatus },
      refundDue: manualRefund,
      refunded,
    });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
