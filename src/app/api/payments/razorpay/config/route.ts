import { NextResponse } from "next/server";
import { razorpayEnabled } from "@/lib/razorpay";

/** GET /api/payments/razorpay/config — tells the app whether online payment is switched on. */
export async function GET() {
  return NextResponse.json({ enabled: razorpayEnabled() });
}
