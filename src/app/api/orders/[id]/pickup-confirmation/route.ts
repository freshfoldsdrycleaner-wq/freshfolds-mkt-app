import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

/**
 * POST /api/orders/:id/pickup-confirmation
 * Section 14/rule 9: the customer reviews the photos + defect report and
 * confirms they agree with it. Requires at least one Defect row to exist
 * first (i.e. the delivery person already recorded the condition) —
 * otherwise there's nothing to confirm.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "CUSTOMER");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order || order.customerId !== session.userId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const conditionReportCount = await prisma.defect.count({ where: { orderId: order.id } });
  if (conditionReportCount === 0) {
    return NextResponse.json({ error: "No condition report has been recorded for this order yet" }, { status: 409 });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { pickupConditionConfirmedAt: new Date() },
  });

  return NextResponse.json({ order: { id: updated.id, pickupConditionConfirmedAt: updated.pickupConditionConfirmedAt } });
}
