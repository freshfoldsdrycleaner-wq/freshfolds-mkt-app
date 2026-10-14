import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { advanceDue, createRazorpayOrder, razorpayEnabled } from "@/lib/razorpay";

const bodySchema = z.object({ orderId: z.string().min(1) });

/** POST /api/payments/razorpay/order — start an online payment of the advance still due. */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!razorpayEnabled()) return NextResponse.json({ error: "Online payment is not available yet." }, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });
  if (!order || order.customerId !== session.userId) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["CANCELLED", "CLOSED", "DELIVERED"].includes(order.status)) {
    return NextResponse.json({ error: "This order no longer needs payment." }, { status: 409 });
  }
  const amount = advanceDue(Number(order.estimatedTotal), Number(order.amountPaid));
  if (amount <= 0) return NextResponse.json({ error: "Your advance is already paid." }, { status: 409 });

  try {
    // If this dry-cleaner has a Razorpay linked account, his share of the advance (advance minus
    // Fresh Folds' fee) is sent to him automatically; Fresh Folds keeps the fee in its own account.
    const dc = await prisma.dryCleaner.findUnique({ where: { id: order.dryCleanerId }, select: { razorpayAccountId: true } });
    const fee = Math.min(amount, Math.max(0, Number(order.commissionAmount ?? 0)));
    const dcShare = Math.round((amount - fee) * 100) / 100;
    const baseNotes = { orderId: order.id, orderNumber: order.orderNumber };
    let rz;
    let splitRupees = 0;
    if (dc?.razorpayAccountId && dcShare > 0) {
      try {
        rz = await createRazorpayOrder(
          amount,
          order.orderNumber,
          { ...baseNotes, dcShare: String(dcShare) },
          [{ account: dc.razorpayAccountId, amount: Math.round(dcShare * 100), currency: "INR", notes: { orderNumber: order.orderNumber } }]
        );
        splitRupees = dcShare;
      } catch {
        // Route not available for this account yet: take the payment normally and settle by hand.
        rz = await createRazorpayOrder(amount, order.orderNumber, baseNotes);
      }
    } else {
      rz = await createRazorpayOrder(amount, order.orderNumber, baseNotes);
    }
    void splitRupees;
    return NextResponse.json({ keyId: process.env.RAZORPAY_KEY_ID, razorpayOrderId: rz.id, amount: rz.amount, currency: rz.currency, orderNumber: order.orderNumber });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
