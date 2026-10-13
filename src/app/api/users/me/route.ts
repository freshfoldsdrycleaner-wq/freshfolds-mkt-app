import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

/**
 * GET /api/users/me — the logged-in user's own basic profile, for any role.
 * PATCH /api/users/me — update name and/or attach an email to the account.
 * Used right after first registration to capture a display name, since
 * phone-OTP signup alone doesn't ask for one.
 */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role } });
}

export async function PATCH(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: parsed.data,
  });

  return NextResponse.json({ user: { id: updated.id, name: updated.name, phone: updated.phone, email: updated.email, role: updated.role } });
}

/**
 * DELETE /api/users/me — customer deletes their own account (required by app stores).
 * Personal details are erased and the login can no longer be used. Past orders are
 * kept without any personal details because dry-cleaners and Fresh Folds need them
 * for accounting. Blocked while an order is still in progress.
 */
export async function DELETE(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Please contact Fresh Folds to close this account." }, { status: 403 });
  }
  const open = await prisma.order.count({
    where: { customerId: session.userId, status: { notIn: ["DELIVERED", "CLOSED", "CANCELLED"] } },
  });
  if (open > 0) {
    return NextResponse.json({ error: "You still have an order in progress. Please delete your account after it is delivered or cancelled." }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({ where: { userId: session.userId } }),
    prisma.notification.deleteMany({ where: { userId: session.userId } }),
    prisma.user.update({
      where: { id: session.userId },
      data: { name: "Deleted user", email: null, phone: `deleted-${session.userId}` },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
