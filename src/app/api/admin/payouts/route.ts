import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { FF_ADVANCE_PREFIX } from "@/lib/upi";

function guard(req: Request) {
  const session = requireSession(req);
  requireRole(session, "FRESHFOLD_ADMIN");
}
function authError(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  throw e;
}

/**
 * GET /api/admin/payouts
 * Per dry-cleaner: advances paid to Fresh Folds' UPI (on non-cancelled orders),
 * minus Fresh Folds' commission on those orders, minus payouts already made.
 * owed > 0 means Fresh Folds owes the dry-cleaner; owed < 0 the reverse.
 */
export async function GET(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }

  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCESS",
      paymentType: "BOOKING",
      transactionId: { startsWith: FF_ADVANCE_PREFIX },
      order: { status: { not: "CANCELLED" } },
    },
    include: { order: { select: { id: true, dryCleanerId: true, commissionAmount: true } } },
  });
  const payouts = await prisma.vendorPayout.findMany({ orderBy: { createdAt: "desc" } });
  const dcs = await prisma.dryCleaner.findMany({ select: { id: true, businessName: true } });

  const rows = dcs.map((dc) => {
    const mine = payments.filter((p) => p.order.dryCleanerId === dc.id);
    const advances = mine.reduce((s, p) => s + Number(p.amount), 0);
    const orderIds = new Set(mine.map((p) => p.order.id));
    let commission = 0;
    for (const p of mine) {
      if (orderIds.has(p.order.id)) {
        commission += Number(p.order.commissionAmount ?? 0);
        orderIds.delete(p.order.id); // count each order's commission once
      }
    }
    const paid = payouts.filter((x) => x.dryCleanerId === dc.id).reduce((s, x) => s + Number(x.amount), 0);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      dryCleanerId: dc.id,
      businessName: dc.businessName,
      advancesCollected: round(advances),
      commission: round(commission),
      alreadyPaid: round(paid),
      owed: round(advances - commission - paid),
      history: payouts
        .filter((x) => x.dryCleanerId === dc.id)
        .slice(0, 5)
        .map((x) => ({ id: x.id, amount: Number(x.amount), note: x.note, createdAt: x.createdAt })),
    };
  });

  return NextResponse.json({ rows });
}

const postSchema = z.object({
  dryCleanerId: z.string(),
  amount: z.number().positive().max(1_000_000),
  note: z.string().max(120).optional(),
});

/** POST /api/admin/payouts: record that you paid a dry-cleaner (UPI/bank). */
export async function POST(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  const dc = await prisma.dryCleaner.findUnique({ where: { id: parsed.data.dryCleanerId }, select: { id: true } });
  if (!dc) return NextResponse.json({ error: "Dry-cleaner not found" }, { status: 404 });
  const payout = await prisma.vendorPayout.create({
    data: { dryCleanerId: dc.id, amount: parsed.data.amount, note: parsed.data.note || null },
  });
  return NextResponse.json({ payout: { id: payout.id, amount: Number(payout.amount) } }, { status: 201 });
}
