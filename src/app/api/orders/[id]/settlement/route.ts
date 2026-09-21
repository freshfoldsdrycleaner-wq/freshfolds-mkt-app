import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

const bodySchema = z.object({
  settlementStatus: z.enum(["PENDING", "PARTIALLY_SETTLED", "SETTLED"]),
});

/**
 * POST /api/orders/:id/settlement
 * Section 62/65: admin marks how far along a dry-cleaner's payout is for
 * this order. Separate from the order's delivery status (OrderStatus) —
 * this only tracks money owed to the dry-cleaner, admin-only.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { settlementStatus: parsed.data.settlementStatus },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "SETTLEMENT_STATUS_CHANGE",
      entityType: "Order",
      entityId: order.id,
      oldValue: { settlementStatus: order.settlementStatus },
      newValue: { settlementStatus: updated.settlementStatus },
    },
  });

  return NextResponse.json({ order: { id: updated.id, settlementStatus: updated.settlementStatus } });
}
