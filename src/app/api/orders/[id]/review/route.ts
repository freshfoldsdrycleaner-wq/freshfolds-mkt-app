import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getNotificationProvider } from "@/lib/providers/notification";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().trim().max(500).optional(),
});

async function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: { dryCleaner: { select: { ownerId: true } } },
  });
}

/** GET /api/orders/:id/review — the review for this order (if any). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const review = await prisma.review.findUnique({ where: { orderId: params.id } });
  return NextResponse.json({
    review: review ? { rating: review.rating, review: review.review, createdAt: review.createdAt } : null,
  });
}

/** POST /api/orders/:id/review — customer rates the dry-cleaner after delivery. One review per order. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Only the customer can rate" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Please choose 1 to 5 stars." }, { status: 400 });

  const order = await loadOrder(params.id);
  if (!order || order.customerId !== session.userId) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "DELIVERED" && order.status !== "CLOSED") {
    return NextResponse.json({ error: "You can rate once your order is delivered." }, { status: 409 });
  }
  const existing = await prisma.review.findUnique({ where: { orderId: order.id } });
  if (existing) return NextResponse.json({ error: "You have already rated this order." }, { status: 409 });

  const created = await prisma.review.create({
    data: {
      orderId: order.id,
      customerId: session.userId,
      dryCleanerId: order.dryCleanerId,
      rating: parsed.data.rating,
      review: parsed.data.review || null,
    },
  });

  try {
    await getNotificationProvider().send({
      userId: order.dryCleaner.ownerId,
      orderId: order.id,
      title: "New rating",
      message: `${order.orderNumber}: a customer rated you ${parsed.data.rating} of 5 stars.`,
    });
  } catch {}

  return NextResponse.json({ review: { rating: created.rating, review: created.review } }, { status: 201 });
}
