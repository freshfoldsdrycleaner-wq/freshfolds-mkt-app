import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HOME: Record<string, string> = { customer: "/customer", dryclean: "/dryclean", admin: "/admin" };

/**
 * GET /api/push/latest?endpoint=...
 * Called by the service worker when a push arrives. The endpoint URL is a long
 * private token known only to that phone, so it identifies the device. Returns
 * the newest notification(s) not yet shown on it.
 */
export async function GET(req: Request) {
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const fallback = { title: "Fresh Folds", body: "You have a new order update.", url: "/" };
  if (!endpoint) return NextResponse.json(fallback);

  const subs = await prisma.pushSubscription.findMany({ where: { endpoint } });
  if (subs.length === 0) return NextResponse.json(fallback);

  type N = { title: string; message: string; createdAt: Date; app: string };
  const found: N[] = [];
  for (const s of subs) {
    const rows = await prisma.notification.findMany({
      where: { userId: s.userId, createdAt: { gt: s.lastShownAt } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    rows.forEach((r) => found.push({ title: r.title, message: r.message, createdAt: r.createdAt, app: s.app }));
    await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastShownAt: new Date() } });
  }
  if (found.length === 0) return NextResponse.json({ ...fallback, url: HOME[subs[0].app] ?? "/" });

  found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const top = found[0];
  return NextResponse.json({
    title: top.title,
    body: top.message + (found.length > 1 ? ` (+${found.length - 1} more)` : ""),
    url: HOME[top.app] ?? "/",
  });
}
