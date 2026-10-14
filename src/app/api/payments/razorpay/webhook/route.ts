import { NextResponse } from "next/server";
import { recordRazorpayAdvance, verifyWebhookSignature } from "@/lib/razorpay";

/**
 * POST /api/payments/razorpay/webhook
 * Razorpay calls this by itself when a payment is captured, so the order is
 * marked paid even if the customer closes the app right after paying.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhookSignature(raw, sig)) return NextResponse.json({ error: "Bad signature" }, { status: 400 });

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (event?.event === "payment.captured") {
    const p = event.payload?.payment?.entity;
    const orderId = p?.notes?.orderId;
    if (p?.id && orderId && typeof p.amount === "number") {
      await recordRazorpayAdvance(orderId, p.id, p.amount / 100, Number(p.notes?.dcShare ?? 0) || 0);
    }
  }
  return NextResponse.json({ ok: true });
}
