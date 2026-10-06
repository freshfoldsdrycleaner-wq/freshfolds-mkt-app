import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({ ref: z.string().trim().max(40).optional() });

/**
 * POST /api/orders/:id/advance-claim
 * The customer says they paid the advance to Fresh Folds' UPI. This does NOT
 * mark anything as paid: the Fresh Folds admin checks their own UPI app and
 * confirms it (see /api/admin/advance).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (session.role !== "CUSTOMER" || order.customerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "This order is cancelled." }, { status: 409 });
  }
  if (Number(order.amountPaid) > 0) {
    return NextResponse.json({ error: "Advance is already confirmed." }, { status: 409 });
  }
  await prisma.order.update({
    where: { id: order.id },
    data: { advanceClaimedAt: new Date(), advanceRef: parsed.data.ref || null },
  });
  return NextResponse.json({ ok: true });
}
