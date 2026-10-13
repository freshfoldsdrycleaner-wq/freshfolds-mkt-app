import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { calculateEstimatedOrder, generateOrderNumber, effectivePrice, customerPrice } from "@/lib/pricing";
import { getNotificationProvider } from "@/lib/providers/notification";
import { evaluateCoupon } from "@/lib/coupons";

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
  couponCode: z.string().optional(),
  contactName: z.string().trim().min(1).max(80).optional(),
  contactPhone: z.string().trim().regex(/^[0-9+\s-]{10,15}$/, "Enter a valid contact phone number").optional(),
  preferredPickupAt: z.string().datetime().optional(),
  items: z.array(itemSchema).min(1),
});

/**
 * POST /api/orders
 * Pricing and the platform commission are computed here from the
 * dry-cleaner's live Service rows — never from anything the client sent.
 * Soft-launch mode: NO payment is taken or recorded at booking. The order
 * starts fully unpaid; the dry-cleaner collects cash/UPI directly and
 * confirms it later via /payment/final.
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
  const { dryCleanerId, pickupAddress, deliveryAddress, preferredPickupAt, items, couponCode, contactName, contactPhone } = parsed.data;

  // Rule 1: can only order from an ACTIVE dry-cleaner.
  const dryCleaner = await prisma.dryCleaner.findUnique({ where: { id: dryCleanerId } });
  if (!dryCleaner || dryCleaner.status !== "ACTIVE") {
    return NextResponse.json({ error: "Dry-cleaner is not available" }, { status: 400 });
  }

  if (preferredPickupAt && new Date(preferredPickupAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Preferred pickup time must be in the future" }, { status: 400 });
  }

  const serviceIds = items.map((i) => i.serviceId);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, dryCleanerId, status: "ACTIVE" },
  });
  if (services.length !== serviceIds.length) {
    return NextResponse.json({ error: "One or more services are invalid or unavailable" }, { status: 400 });
  }
  const serviceById = new Map(services.map((s) => [s.id, s]));

  // The dry-cleaner's own price is what he earns. The customer pays that plus the
  // app fee on top, so every customer-facing price already includes the fee.
  const priced = calculateEstimatedOrder(
    items.map((i) => {
      const svc = serviceById.get(i.serviceId)!;
      return {
        itemName: svc.itemName,
        serviceName: svc.serviceName,
        quantity: i.quantity,
        unitPrice: customerPrice(effectivePrice(Number(svc.price), Number(svc.discountPercent)), DEFAULT_COMMISSION_RATE),
      };
    }),
    DEFAULT_BOOKING_PERCENT
  );
  const dryCleanerAmount = Math.round(
    items.reduce((sum, i) => {
      const svc = serviceById.get(i.serviceId)!;
      return sum + effectivePrice(Number(svc.price), Number(svc.discountPercent)) * i.quantity;
    }, 0) * 100
  ) / 100;

  // Optional admin-created offer code: computed here on the server from the
  // customer subtotal. Offers are paid for by Fresh Folds, not the dry-cleaner.
  let appliedCode: string | null = null;
  let discountAmount = 0;
  if (couponCode && couponCode.trim()) {
    const result = await evaluateCoupon(couponCode, priced.estimatedTotal, session.userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    appliedCode = result.code;
    discountAmount = result.discountAmount;
  }
  const orderTotal = Math.round((priced.estimatedTotal - discountAmount) * 100) / 100;

  // Fresh Folds' share is whatever the customer pays above the dry-cleaner's own amount.
  const commission = {
    commissionAmount: Math.round((orderTotal - dryCleanerAmount) * 100) / 100,
    dryCleanerNetAmount: dryCleanerAmount,
  };

  const orderNumber = generateOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId: session.userId,
        dryCleanerId,
        pickupAddress,
        deliveryAddress,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        preferredPickupAt: preferredPickupAt ? new Date(preferredPickupAt) : undefined,
        estimatedTotal: orderTotal,
        couponCode: appliedCode,
        discountAmount,
        commissionRate: DEFAULT_COMMISSION_RATE,
        markupPricing: true,
        commissionAmount: commission.commissionAmount,
        dryCleanerNetAmount: commission.dryCleanerNetAmount,
        amountPaid: 0,
        balanceDue: orderTotal,
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

    await tx.commissionTransaction.create({
      data: {
        orderId: created.id,
        dryCleanerId,
        commissionRate: DEFAULT_COMMISSION_RATE,
        orderValue: orderTotal,
        commissionAmount: commission.commissionAmount,
        dryCleanerNetAmount: commission.dryCleanerNetAmount,
      },
    });

    return created;
  });

  await getNotificationProvider().send({
    userId: session.userId,
    orderId: order.id,
    title: "Order confirmed",
    message: `${order.orderNumber} is confirmed. ${dryCleaner.businessName} will be assigned for pickup shortly.`,
  });
  await getNotificationProvider().send({
    userId: dryCleaner.ownerId,
    orderId: order.id,
    title: "New order",
    message: `${order.orderNumber}: a new order worth Rs ${Math.round(Number(order.estimatedTotal))} was placed. Open the app to arrange pickup.`,
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
        preferredPickupAt: order.preferredPickupAt,
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