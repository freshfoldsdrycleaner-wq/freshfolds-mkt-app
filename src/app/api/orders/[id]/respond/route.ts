import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TERMS_VERSION } from "@/lib/dryCleanerTerms";
import { requireSession } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider, notifyAdmins } from "@/lib/providers/notification";

const bodySchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
  reason: z.string().trim().max(200).optional(),
});

/**
 * POST /api/orders/:id/respond
 * The dry-cleaner accepts or declines a newly placed order. The customer is
 * notified either way. A decline cancels the order; if the customer already
 * paid an advance, the admin is told so the refund is not forgotten.
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
    include: { dryCleaner: { select: { ownerId: true, businessName: true, termsVersion: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (isOwner && order.dryCleaner.termsVersion !== TERMS_VERSION) {
    return NextResponse.json({ error: "Please accept the partner terms in the app first." }, { status: 403 });
  }
  if (order.status !== "ORDER_PLACED" || order.acceptedAt) {
    return NextResponse.json({ error: "This order has already been answered." }, { status: 409 });
  }

  const notifier = getNotificationProvider();

  if (parsed.data.action === "ACCEPT") {
    await prisma.order.update({ where: { id: order.id }, data: { acceptedAt: new Date() } });
    await notifier.send({
      userId: order.customerId,
      orderId: order.id,
      title: "Order accepted",
      message: `${order.orderNumber}: ${order.dryCleaner.businessName} accepted your order and will pick up your clothes soon.`,
    });
    return NextResponse.json({ ok: true, accepted: true });
  }

  try {
    const next = assertTransition(order.status, "CANCELLED");
    const paid = Number(order.amountPaid);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: next, declineReason: parsed.data.reason || null },
    });
    await notifier.send({
      userId: order.customerId,
      orderId: order.id,
      title: "Order declined",
      message:
        `${order.orderNumber}: ${order.dryCleaner.businessName} could not take this order` +
        (parsed.data.reason ? ` (${parsed.data.reason})` : "") +
        "." +
        (paid > 0 ? ` Your advance of Rs ${paid} will be refunded.` : " Please try another dry-cleaner."),
    });
    if (paid > 0 || order.advanceClaimedAt) {
      await notifyAdmins({
        orderId: order.id,
        title: "Refund needed",
        message: `${order.orderNumber} was declined. Advance of Rs ${paid} may need to be refunded.`,
      });
    }
    return NextResponse.json({ ok: true, accepted: false });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
