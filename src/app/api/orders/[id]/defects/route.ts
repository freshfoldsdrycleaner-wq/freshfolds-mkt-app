import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const DEFECT_TYPES = ["STAIN", "TEAR", "HOLE", "DISCOLORATION", "MISSING_BUTTON", "BROKEN_ZIP", "EXISTING_DAMAGE", "OTHER"] as const;

const bodySchema = z.discriminatedUnion("found", [
  z.object({
    found: z.literal(true),
    defectType: z.enum(DEFECT_TYPES),
    description: z.string().min(1),
    photoUrl: z.string().url().optional(),
    itemRef: z.string().optional(),
  }),
  z.object({ found: z.literal(false) }), // "No defects found" — still recorded, per rule 8
]);

async function assertAssignedDeliveryPerson(orderId: string, userId: string) {
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { orderId, deliveryPersonId: userId, assignmentType: "PICKUP" },
  });
  return !!assignment;
}

/**
 * POST /api/orders/:id/defects
 * Section 13/rule 8: the delivery person must record either a defect or
 * explicitly "no defects found" — there is no third option, and this
 * record is exactly what the state machine's PICKED_UP guard checks for
 * (see hasPickupConditionReport in the status route).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  if (session.role !== "DELIVERY_PERSON" || !(await assertAssignedDeliveryPerson(params.id, session.userId))) {
    return NextResponse.json({ error: "Not assigned to this order's pickup" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const defect = await prisma.defect.create({
    data: parsed.data.found
      ? {
          orderId: params.id,
          recordedBy: session.userId,
          defectType: parsed.data.defectType,
          description: parsed.data.description,
          photoUrl: parsed.data.photoUrl,
          itemRef: parsed.data.itemRef,
        }
      : {
          orderId: params.id,
          recordedBy: session.userId,
          defectType: "NONE",
          description: "No defects found",
        },
  });

  return NextResponse.json({ defect }, { status: 201 });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
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
  const isAssignedDelivery = session.role === "DELIVERY_PERSON" && (await assertAssignedDeliveryPerson(params.id, session.userId));
  const isAdmin = session.role === "FRESHFOLD_ADMIN";

  if (!isCustomer && !isOwner && !isAssignedDelivery && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const defects = await prisma.defect.findMany({ where: { orderId: params.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ defects });
}
