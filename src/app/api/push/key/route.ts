import { NextResponse } from "next/server";

/** GET /api/push/key: the public VAPID key the browser needs to subscribe. */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "Notifications are not set up yet." }, { status: 503 });
  return NextResponse.json({ key });
}
