import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fetchRazorpayOrder, recordRazorpayAdvance, verifyCheckoutSignature } from "@/lib/razorpay";

const bodySchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/** POST /api/payments/razorpay/verify — called by the app right after a successful payment. */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: b.orderId } });
  if (!order || order.customerId !== session.userId) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) {
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 400 });
  }
  try {
    const rz = await fetchRazorpayOrder(b.razorpay_order_id);
    if (rz.notes?.orderId !== order.id || rz.amount_paid <= 0) {
      return NextResponse.json({ error: "Payment does not match this order." }, { status: 400 });
    }
    await recordRazorpayAdvance(order.id, b.razorpay_payment_id, rz.amount_paid / 100);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
