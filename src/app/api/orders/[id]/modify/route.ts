import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({
  pickupAddress: z.string().min(3).optional(),
  deliveryAddress: z.string().min(3).optional(),
  preferredPickupAt: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the details you entered." }, { status: 400 });
  }
  const { pickupAddress, deliveryAddress, preferredPickupAt } = parsed.data;
  if (!pickupAddress && !deliveryAddress && !preferredPickupAt) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (session.role !== "CUSTOMER" || order.customerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status !== "ORDER_PLACED") {
    return NextResponse.json(
      { error: "This order can no longer be changed because processing has started. Please contact us on WhatsApp." },
      { status: 409 }
    );
  }
  if (preferredPickupAt && new Date(preferredPickupAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Preferred pickup time must be in the future" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      ...(pickupAddress ? { pickupAddress } : {}),
      ...(deliveryAddress ? { deliveryAddress } : {}),
      ...(preferredPickupAt ? { preferredPickupAt: new Date(preferredPickupAt) } : {}),
    },
  });

  await getNotificationProvider().send({
    userId: order.dryCleaner.ownerId,
    orderId: order.id,
    title: "Order details changed",
    message: `${order.orderNumber}: the customer updated the pickup details.`,
  });

  return NextResponse.json({ order: { id: updated.id, status: updated.status } });
}