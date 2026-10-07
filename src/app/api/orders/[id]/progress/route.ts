import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TERMS_VERSION } from "@/lib/dryCleanerTerms";
import { requireSession } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getPaymentProvider } from "@/lib/providers/payment";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({ step: z.enum(["READY", "OUT_FOR_DELIVERY", "DELIVERED"]) });

/**
 * POST /api/orders/:id/progress
 * One-tap steps for the dry-cleaner after cleaning has started:
 *   READY             PROCESSING -> ... -> PAYMENT_PENDING (ready, pay on delivery)
 *   OUT_FOR_DELIVERY  PAYMENT_PENDING -> DELIVERY_ASSIGNED -> OUT_FOR_DELIVERY
 *   DELIVERED         OUT_FOR_DELIVERY -> DELIVERED, recording the full balance as received
 * Every move still goes through the state machine, and the customer is notified.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true, termsVersion: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isOwner && order.dryCleaner.termsVersion !== TERMS_VERSION) {
    return NextResponse.json({ error: "Please accept the partner terms in the app first." }, { status: 403 });
  }

  const notifier = getNotificationProvider();
  try {
    if (parsed.data.step === "READY") {
      if (order.status !== "PROCESSING") return NextResponse.json({ error: "Cleaning has not started on this order." }, { status: 409 });
      const a = assertTransition(order.status, "QUALITY_CHECK");
      const b = assertTransition(a, "COMPLETED");
      const c = assertTransition(b, "PAYMENT_PENDING");
      await prisma.order.update({ where: { id: order.id }, data: { status: c } });
      const due = Number(order.balanceDue ?? 0);
      await notifier.send({
        userId: order.customerId,
        orderId: order.id,
        title: "Your clothes are ready",
        message: `${order.orderNumber}: your clothes are ready.${due > 0 ? ` Balance of Rs ${due} is payable on delivery.` : ""}`,
      });
      return NextResponse.json({ ok: true, status: c });
    }

    if (parsed.data.step === "OUT_FOR_DELIVERY") {
      if (order.status !== "PAYMENT_PENDING" && order.status !== "PAYMENT_COMPLETED") {
        return NextResponse.json({ error: "The order is not ready yet." }, { status: 409 });
      }
      const a = assertTransition(order.status, "DELIVERY_ASSIGNED");
      const b = assertTransition(a, "OUT_FOR_DELIVERY");
      await prisma.order.update({ where: { id: order.id }, data: { status: b } });
      await notifier.send({
        userId: order.customerId,
        orderId: order.id,
        title: "Out for delivery",
        message: `${order.orderNumber}: your clothes are on the way.`,
      });
      return NextResponse.json({ ok: true, status: b });
    }

    // DELIVERED + full payment received
    if (order.status !== "OUT_FOR_DELIVERY") {
      return NextResponse.json({ error: "The order is not out for delivery yet." }, { status: 409 });
    }
    const next = assertTransition(order.status, "DELIVERED");
    const balance = Number(order.balanceDue ?? 0);
    await prisma.$transaction(async (tx) => {
      let paidNow = 0;
      if (balance > 0) {
        const charge = await getPaymentProvider().charge({ orderId: order.id, amount: balance, purpose: "FINAL" });
        if (charge.status !== "SUCCESS") throw new Error("Final payment failed");
        await tx.payment.create({
          data: { orderId: order.id, amount: balance, paymentType: "FINAL", transactionId: charge.transactionId, status: charge.status },
        });
        paidNow = balance;
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: next,
          amountPaid: Number(order.amountPaid) + paidNow,
          balanceDue: 0,
          settlementStatus: "PARTIALLY_SETTLED",
        },
      });
    });
    await notifier.send({
      userId: order.customerId,
      orderId: order.id,
      title: "Delivered",
      message: `${order.orderNumber}: delivered${balance > 0 ? `, payment of Rs ${balance} received` : ""}. Thank you! Please rate your dry-cleaner in the app.`,
    });
    return NextResponse.json({ ok: true, status: next });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message || "Could not update the order." }, { status: 500 });
  }
}
