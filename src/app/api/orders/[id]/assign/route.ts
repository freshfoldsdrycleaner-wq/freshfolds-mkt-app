import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { assertTransition, IllegalOrderTransitionError } from "@/lib/orderStateMachine";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z
  .object({
    deliveryPersonId: z.string().optional(),
    deliveryPersonPhone: z.string().min(6).max(20).optional(),
    assignmentType: z.enum(["PICKUP", "DELIVERY"]),
  })
  .refine((d) => d.deliveryPersonId || d.deliveryPersonPhone, {
    message: "deliveryPersonId or deliveryPersonPhone is required",
  });

/**
 * POST /api/orders/:id/assign
 * Section 11/19/23: the dry-cleaner assigns one of their own delivery
 * staff to a pickup or delivery. A PICKUP assignment also advances the
 * order to PICKUP_ASSIGNED (the customer-visible signal that someone is
 * on it); a DELIVERY assignment advances it to DELIVERY_ASSIGNED.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isOwner = session.role === "DRYCLEANER_ADMIN" && order.dryCleaner.ownerId === session.userId;
  if (!isOwner && session.role !== "FRESHFOLD_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deliveryPerson = parsed.data.deliveryPersonId
    ? await prisma.user.findUnique({ where: { id: parsed.data.deliveryPersonId } })
    : await prisma.user.findUnique({ where: { phone: parsed.data.deliveryPersonPhone! } });

  if (!deliveryPerson || deliveryPerson.role !== "DELIVERY_PERSON") {
    return NextResponse.json(
      { error: "No delivery-person account found for that phone number. They need to register first." },
      { status: 400 }
    );
  }

  const nextStatus = parsed.data.assignmentType === "PICKUP" ? "PICKUP_ASSIGNED" : "DELIVERY_ASSIGNED";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.create({
        data: {
          orderId: order.id,
          deliveryPersonId: deliveryPerson.id,
          assignmentType: parsed.data.assignmentType,
        },
      });
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: assertTransition(order.status, nextStatus as any) },
      });
      return { assignment, updatedOrder };
    });

    await getNotificationProvider().send({
      userId: order.customerId,
      orderId: order.id,
      title: "Delivery update",
      message: `${order.orderNumber}: ${nextStatus.replaceAll("_", " ")}`,
    });

    return NextResponse.json({
      assignment: result.assignment,
      order: { id: result.updatedOrder.id, status: result.updatedOrder.status },
    });
  } catch (e) {
    if (e instanceof IllegalOrderTransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
