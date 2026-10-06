import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { FF_ADVANCE_PREFIX } from "@/lib/upi";
import { getNotificationProvider } from "@/lib/providers/notification";

function guard(req: Request) {
  const session = requireSession(req);
  requireRole(session, "FRESHFOLD_ADMIN");
}
function authError(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  throw e;
}

/** GET: orders where the customer says they paid the advance and it is not yet confirmed. */
export async function GET(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const orders = await prisma.order.findMany({
    where: { advanceClaimedAt: { not: null }, status: { not: "CANCELLED" }, amountPaid: { lte: 0 } },
    include: { customer: { select: { name: true, phone: true } }, dryCleaner: { select: { businessName: true } } },
    orderBy: { advanceClaimedAt: "asc" },
  });
  return NextResponse.json({
    claims: orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      customerPhone: o.customer.phone,
      dryCleaner: o.dryCleaner.businessName,
      ref: o.advanceRef,
      claimedAt: o.advanceClaimedAt,
      suggestedAmount: Math.round(Number(o.balanceDue ?? o.estimatedTotal) * 0.2),
    })),
  });
}

const postSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive().max(1_000_000),
  reject: z.boolean().optional(),
});

/**
 * POST: confirm that the advance reached Fresh Folds' UPI (records a BOOKING
 * payment tagged FFUPI-), or reject the claim (payment not received).
 */
export async function POST(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  const { orderId, reject } = parsed.data;
  const amount = Math.round(parsed.data.amount * 100) / 100;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "CANCELLED") return NextResponse.json({ error: "Order is cancelled." }, { status: 409 });

  if (reject) {
    await prisma.order.update({ where: { id: order.id }, data: { advanceClaimedAt: null, advanceRef: null } });
    await getNotificationProvider().send({
      userId: order.customerId,
      orderId: order.id,
      title: "Advance not received",
      message: `${order.orderNumber}: we could not find your advance payment. Please contact Fresh Folds.`,
    });
    return NextResponse.json({ ok: true });
  }

  const balance = Number(order.balanceDue ?? order.estimatedTotal);
  if (amount > balance) return NextResponse.json({ error: "Amount is more than the balance due." }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount,
        paymentType: "BOOKING",
        transactionId: `${FF_ADVANCE_PREFIX}${order.orderNumber}-${Date.now()}`,
        status: "SUCCESS",
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { amountPaid: Number(order.amountPaid) + amount, balanceDue: balance - amount, advanceClaimedAt: null },
    });
  });
  await getNotificationProvider().send({
    userId: order.customerId,
    orderId: order.id,
    title: "Advance received",
    message: `${order.orderNumber}: we received your advance of Rs ${amount}. Thank you!`,
  });
  return NextResponse.json({ ok: true });
}
