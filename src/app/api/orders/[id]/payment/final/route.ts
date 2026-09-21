import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getPaymentProvider } from "@/lib/providers/payment";
import { getNotificationProvider } from "@/lib/providers/notification";

/**
 * POST /api/orders/:id/payment/final
 * Section 18: the remaining balance is collected here — either the
 * customer pays in-app, or the dry-cleaner confirms cash/UPI collected in
 * person. Either way, payment status is verified server-side (never
 * trusted from the frontend, rule 14) before the order is allowed to move
 * PAYMENT_PENDING -> PAYMENT_COMPLETED.
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.status !== "PAYMENT_PENDING") {
    return NextResponse.json({ error: "Order is not awaiting payment" }, { status: 409 });
  }

  const balanceDue = Number(order.balanceDue ?? 0);
  if (balanceDue <= 0) {
    return NextResponse.json({ error: "No balance due on this order" }, { status: 409 });
  }

  try {
    const nextStatus = assertTransition(order.status, "PAYMENT_COMPLETED");

    const result = await prisma.$transaction(async (tx) => {
      const chargeResult = await getPaymentProvider().charge({
        orderId: order.id,
        amount: balanceDue,
        purpose: "FINAL",
      });

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: balanceDue,
          paymentType: "FINAL",
          transactionId: chargeResult.transactionId,
          status: chargeResult.status,
        },
      });

      if (chargeResult.status !== "SUCCESS") {
        throw new Error("Final payment failed");
      }

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          amountPaid: Number(order.amountPaid) + balanceDue,
          balanceDue: 0,
          settlementStatus: "PARTIALLY_SETTLED",
          status: nextStatus,
        },
      });

      return { payment, updatedOrder };
    });

    await getNotificationProvider().send({
      userId: order.customerId,
      orderId: order.id,
      title: "Payment successful",
      message: `${order.orderNumber}: payment of ${balanceDue} received. Your order will proceed to delivery.`,
    });

    return NextResponse.json({
      order: {
        id: result.updatedOrder.id,
        status: result.updatedOrder.status,
        amountPaid: Number(result.updatedOrder.amountPaid),
        balanceDue: Number(result.updatedOrder.balanceDue),
      },
      payment: { ...result.payment, amount: Number(result.payment.amount) },
    });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
