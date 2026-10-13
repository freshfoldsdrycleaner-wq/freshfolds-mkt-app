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
    const rz = await createRazorpayOrder(amount, order.orderNumber, { orderId: order.id, orderNumber: order.orderNumber });
    return NextResponse.json({ keyId: process.env.RAZORPAY_KEY_ID, razorpayOrderId: rz.id, amount: rz.amount, currency: rz.currency, orderNumber: order.orderNumber });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
