import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const bodySchema = z.object({
  endpoint: z.string().url().max(1000),
  app: z.enum(["customer", "dryclean", "admin"]),
});

/** POST /api/push/subscribe: link this phone's push endpoint to the signed-in user. */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId: session.userId, endpoint: parsed.data.endpoint } },
    update: { app: parsed.data.app },
    create: { userId: session.userId, endpoint: parsed.data.endpoint, app: parsed.data.app },
  });
  return NextResponse.json({ ok: true });
}
