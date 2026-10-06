import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/orders/:id
 * Section 40 (rule 12): a customer may only see their own order; a
 * dry-cleaner only orders placed with them; admin sees everything.
 * The customer's name and phone are returned to the dry-cleaner / admin
 * only, so the dry-cleaner can arrange pickup.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      dryCleaner: { select: { id: true, businessName: true, ownerId: true, address: true, phone: true } },
      customer: { select: { name: true, phone: true } },
      pickupPhotos: true,
      defects: true,
      payments: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwnerCustomer = session.role === "CUSTOMER" && order.customerId === session.userId;
  const isOwnerDryCleaner =
    session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  const isAdmin = session.role === "FRESHFOLD_ADMIN";
  if (!isOwnerCustomer && !isOwnerDryCleaner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      dryCleaner: { id: order.dryCleaner.id, name: order.dryCleaner.businessName, address: order.dryCleaner.address, phone: order.dryCleaner.phone },
      customer: isOwnerCustomer ? undefined : { name: order.customer.name, phone: order.customer.phone },
      pickupAddress: order.pickupAddress,
      deliveryAddress: order.deliveryAddress,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      preferredPickupAt: order.preferredPickupAt,
      estimatedTotal: Number(order.estimatedTotal),
      couponCode: order.couponCode,
      discountAmount: Number(order.discountAmount),
      finalTotal: order.finalTotal ? Number(order.finalTotal) : null,
      commissionRate: Number(order.commissionRate),
      commissionAmount: order.commissionAmount ? Number(order.commissionAmount) : null,
      dryCleanerNetAmount: order.dryCleanerNetAmount ? Number(order.dryCleanerNetAmount) : null,
      amountPaid: Number(order.amountPaid),
      balanceDue: order.balanceDue ? Number(order.balanceDue) : null,
      items: order.items.map((i) => ({
        ...i,
        estimatedPrice: Number(i.estimatedPrice),
        finalPrice: i.finalPrice ? Number(i.finalPrice) : null,
      })),
      pickupPhotos: order.pickupPhotos,
      defects: order.defects,
      payments: order.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
  });
}