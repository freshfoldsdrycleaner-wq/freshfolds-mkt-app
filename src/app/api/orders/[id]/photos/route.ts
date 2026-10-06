import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError } from "@/lib/auth";

const bodySchema = z.object({
  // Object-storage URL, or (soft launch) a small compressed JPEG data URL taken in the app.
  photoUrl: z
    .string()
    .refine(
      (v) =>
        (v.startsWith("data:image/jpeg;base64,") && v.length <= 700_000) ||
        (/^https:\/\//.test(v) && v.length <= 2000),
      "Photo is invalid or too large"
    ),
  itemRef: z.string().max(100).optional(),
});

async function assertAssignedDeliveryPerson(orderId: string, userId: string) {
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { orderId, deliveryPersonId: userId, assignmentType: "PICKUP" },
  });
  return !!assignment;
}

/**
 * POST /api/orders/:id/photos
 * Section 12: mandatory pickup photo process. Only the delivery person
 * actually assigned to this order's pickup may attach photos — a
 * delivery person can't touch orders that aren't theirs (section 26/40).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let allowed = false;
  if (session.role === "DELIVERY_PERSON") {
    allowed = await assertAssignedDeliveryPerson(params.id, session.userId);
  } else if (session.role === "DRYCLEANER_ADMIN" || session.role === "FRESHFOLD_ADMIN") {
    // Soft launch: the dry-cleaner picks up personally and photographs the clothes.
    const o = await prisma.order.findUnique({
      where: { id: params.id },
      include: { dryCleaner: { select: { ownerId: true } } },
    });
    allowed =
      !!o &&
      (session.role === "FRESHFOLD_ADMIN" || o.dryCleaner.ownerId === session.userId) &&
      ["ORDER_PLACED", "PICKUP_ASSIGNED", "PICKUP_IN_PROGRESS", "PICKED_UP", "RECEIVED_BY_DRY_CLEANER", "INSPECTION"].includes(o.status);
  }
  if (!allowed) {
    return NextResponse.json({ error: "Not allowed to add photos to this order" }, { status: 403 });
  }

  const existing = await prisma.pickupPhoto.count({ where: { orderId: params.id } });
  if (existing >= 12) {
    return NextResponse.json({ error: "Maximum 12 photos per order" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const photo = await prisma.pickupPhoto.create({
    data: { orderId: params.id, uploadedBy: session.userId, ...parsed.data },
  });

  return NextResponse.json({ photo }, { status: 201 });
}

/**
 * GET /api/orders/:id/photos — only the order's own customer, the owning
 * dry-cleaner, the assigned delivery person, or admin may view them
 * (section 40/41: pickup photos are personal property, access-controlled).
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

  const photos = await prisma.pickupPhoto.findMany({ where: { orderId: params.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ photos });
}
