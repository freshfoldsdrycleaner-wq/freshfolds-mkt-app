import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider } from "@/lib/providers/notification";

// Calendar day in India (IST), used for the customer's same-day rule.
function istDay(d: Date) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

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

  if (order.status !== "ORDER_PLACED") {
    return NextResponse.json(
      { error: "This order can no longer be cancelled here because processing has started. Please contact us on WhatsApp." },
      { status: 409 }
    );
  }

  if (isCustomer && istDay(order.createdAt) !== istDay(new Date())) {
    return NextResponse.json(
      { error: "Orders can only be cancelled on the same day they were placed. Please contact us on WhatsApp." },
      { status: 409 }
    );
  }

  try {
    const next = assertTransition(order.status, "CANCELLED");
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: next, balanceDue: 0 },
      });
      // A cancelled order must not count towards commission totals.
      await tx.commissionTransaction.deleteMany({ where: { orderId: order.id } });
    });

    await getNotificationProvider().send({
      userId: isCustomer ? order.dryCleaner.ownerId : order.customerId,
      orderId: order.id,
      title: "Order cancelled",
      message: `${order.orderNumber} was cancelled by the ${isCustomer ? "customer" : "dry-cleaner"}.`,
    });

    return NextResponse.json({ order: { id: order.id, status: next } });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}