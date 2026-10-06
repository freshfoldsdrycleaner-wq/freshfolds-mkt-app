import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/** GET /api/admin/orders: every order with full customer, dry-cleaner, item and payment details (Fresh Fold admin only). */
export async function GET(req: Request) {
  try {
    requireRole(requireSession(req), "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      customer: { select: { name: true, phone: true, email: true } },
      dryCleaner: { select: { businessName: true, phone: true } },
      items: true,
      payments: { orderBy: { createdAt: "asc" } },
      _count: { select: { pickupPhotos: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      customer: o.customer,
      dryCleaner: { name: o.dryCleaner.businessName, phone: o.dryCleaner.phone },
      pickupAddress: o.pickupAddress,
      deliveryAddress: o.deliveryAddress,
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      preferredPickupAt: o.preferredPickupAt,
      estimatedTotal: Number(o.estimatedTotal),
      finalTotal: o.finalTotal ? Number(o.finalTotal) : null,
      couponCode: o.couponCode,
      discountAmount: Number(o.discountAmount),
      amountPaid: Number(o.amountPaid),
      balanceDue: o.balanceDue ? Number(o.balanceDue) : null,
      commissionAmount: o.commissionAmount ? Number(o.commissionAmount) : null,
      advanceClaimedAt: o.advanceClaimedAt,
      photos: o._count.pickupPhotos,
      items: o.items.map((i) => ({
        itemName: i.itemName,
        serviceName: i.serviceName,
        quantity: i.quantity,
        estimatedPrice: Number(i.estimatedPrice),
      })),
      payments: o.payments.map((p) => ({
        amount: Number(p.amount),
        type: p.paymentType,
        status: p.status,
        via: p.transactionId.startsWith("FFUPI-") ? "Fresh Folds UPI" : p.transactionId.startsWith("CASH-") ? "Cash / dry-cleaner" : "Other",
        at: p.createdAt,
      })),
    })),
  });
}
