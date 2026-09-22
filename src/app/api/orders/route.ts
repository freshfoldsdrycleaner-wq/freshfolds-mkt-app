import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { calculateEstimatedOrder, calculateCommissionBreakdown, generateOrderNumber, effectivePrice } from "@/lib/pricing";
import { getPaymentProvider } from "@/lib/providers/payment";
import { getNotificationProvider } from "@/lib/providers/notification";

const DEFAULT_COMMISSION_RATE = Number(process.env.DEFAULT_COMMISSION_RATE ?? 10);
const DEFAULT_BOOKING_PERCENT = Number(process.env.DEFAULT_BOOKING_PAYMENT_PERCENT ?? 20);

const itemSchema = z.object({
  serviceId: z.string(), // looked up server-side; the client never sends a price
  quantity: z.number().int().positive(),
});
const bodySchema = z.object({ 
  dryCleanerId: z.string(), 
  pickupAddress: z.string().min(3), 
  deliveryAddress: z.string().min(3), 
  preferredPickupAt: z.string().datetime().optional(), 
  items: z.array(itemSchema).min(1), 
})

/**
 * POST /api/orders
 * Section 7/9/37/55-58: the whole point of this endpoint is that pricing,
 * the 20% booking payment, and the 10% platform commission are ALL computed
 * here from the dry-cleaner's live Service rows and the current
 * PlatformSetting — never from anything the client sent.
 */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "CUSTOMER");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { dryCleanerId, pickupAddress, deliveryAddress, items } = parsed.data;

  // Rule 1: can only order from an ACTIVE dry-cleaner.
  const dryCleaner = await prisma.dryCleaner.findUnique({ where: { id: dryCleanerId } });
  if (!dryCleaner || dryCleaner.status !== "ACTIVE") {
    return NextResponse.json({ error: "Dry-cleaner is not available" }, { status: 400 });
  }

  const serviceIds = items.map((i) => i.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, dryCleanerId, status: "ACTIVE" },
  });
  if (services.length !== serviceIds.length) {
    return NextResponse.json({ error: "One or more services are invalid or unavailable" }, { status: 400 });
  }
  const serviceById = new Map(services.map((s) => [s.id, s]));

  const priced = calculateEstimatedOrder(
    items.map((i) => {
      const svc = serviceById.get(i.serviceId)!;
      return {
        itemName: svc.itemName,
        serviceName: svc.serviceName,
        quantity: i.quantity,
        unitPrice: effectivePrice(Number(svc.price), Number(svc.discountPercent)),
      };
    }),
    DEFAULT_BOOKING_PERCENT
  );

  // Commission rate is locked in at booking time (section 61) — later
  // admin-wide rate changes never retroactively affect this order.
  const commission = calculateCommissionBreakdown(
    priced.estimatedTotal,
    DEFAULT_COMMISSION_RATE,
    priced.bookingPayment
  );

  const orderNumber = generateOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: session.userId,
        dryCleanerId,
        pickupAddress,
        deliveryAddress,
        estimatedTotal: priced.estimatedTotal,
        commissionRate: DEFAULT_COMMISSION_RATE,
        commissionAmount: commission.commissionAmount,
        dryCleanerNetAmount: commission.dryCleanerNetAmount,
        amountPaid: 0,
        balanceDue: priced.estimatedTotal,
        items: {
          create: priced.items.map((i) => ({
            itemName: i.itemName,
            serviceName: i.serviceName,
            quantity: i.quantity,
            estimatedPrice: i.estimatedPrice,
          })),
        },
      },
      include: { items: true },
    });

    // Section 36: charge the 20% booking payment through the payment
    // abstraction — status is verified server-side, never assumed.
    const chargeResult = await getPaymentProvider().charge({
      orderId: created.id,
      amount: priced.bookingPayment,
      purpose: "BOOKING",
    });

    await tx.payment.create({
      data: {
        orderId: created.id,
        amount: priced.bookingPayment,
        paymentType: "BOOKING",
        transactionId: chargeResult.transactionId,
        status: chargeResult.status,
      },
    });

    if (chargeResult.status !== "SUCCESS") {
      throw new Error("Booking payment failed");
    }

    const updated = await tx.order.update({
      where: { id: created.id },
      data: {
        amountPaid: priced.bookingPayment,
        balanceDue: priced.remainingAfterBooking,
      },
      include: { items: true },
    });

    await tx.commissionTransaction.create({
      data: {
        orderId: updated.id,
        dryCleanerId,
        commissionRate: DEFAULT_COMMISSION_RATE,
        orderValue: priced.estimatedTotal,
        commissionAmount: commission.commissionAmount,
        dryCleanerNetAmount: commission.dryCleanerNetAmount,
      },
    });

    return updated;
  });

  await getNotificationProvider().send({
    userId: session.userId,
    orderId: order.id,
    title: "Order confirmed",
    message: `${order.orderNumber} is confirmed. ${dryCleaner.businessName} will be assigned for pickup shortly.`,
  });

  return NextResponse.json(
    {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        estimatedTotal: Number(order.estimatedTotal),
        amountPaid: Number(order.amountPaid),
        balanceDue: Number(order.balanceDue),
        items: order.items.map((i) => ({ ...i, estimatedPrice: Number(i.estimatedPrice) })),
      },
    },
    { status: 201 }
  );
}

/**
 * GET /api/orders — the caller's own orders (customer), or a dry-cleaner's
 * incoming orders if called by that dry-cleaner's owner account.
 */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const where =
    session.role === "DRYCLEANER_ADMIN"
      ? { dryCleaner: { ownerId: session.userId } }
      : session.role === "FRESHFOLD_ADMIN"
      ? {}
      : { customerId: session.userId };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { items: true, dryCleaner: { select: { businessName: true } } },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      dryCleanerName: o.dryCleaner.businessName,
      estimatedTotal: Number(o.estimatedTotal),
      finalTotal: o.finalTotal ? Number(o.finalTotal) : null,
      amountPaid: Number(o.amountPaid),
      balanceDue: o.balanceDue ? Number(o.balanceDue) : null,
      commissionRate: Number(o.commissionRate),
      commissionAmount: o.commissionAmount ? Number(o.commissionAmount) : null,
      dryCleanerNetAmount: o.dryCleanerNetAmount ? Number(o.dryCleanerNetAmount) : null,
      settlementStatus: o.settlementStatus,
      createdAt: o.createdAt,
    })),
  });
}
