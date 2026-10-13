import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { normalizeCode } from "@/lib/coupons";

async function guard(req: Request) {
  const session = requireSession(req);
  requireRole(session, "DRYCLEANER_ADMIN");
  const dc = await prisma.dryCleaner.findUnique({ where: { ownerId: session.userId } });
  if (!dc) throw new ForbiddenError("No dry-cleaner profile");
  return dc;
}

function authError(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  throw e;
}

/** GET /api/dryclean/offers: this dry-cleaner's own offers with how often each was used. */
export async function GET(req: Request) {
  let dc;
  try {
    dc = await guard(req);
  } catch (e) {
    return authError(e);
  }
  const coupons = await prisma.coupon.findMany({ where: { dryCleanerId: dc.id }, orderBy: { createdAt: "desc" } });
  const usage = await prisma.order.groupBy({
    by: ["couponCode"],
    where: { dryCleanerId: dc.id, couponCode: { not: null }, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });
  const usedBy = new Map(usage.map((u) => [u.couponCode, u._count._all]));
  return NextResponse.json({
    offers: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: Number(c.discountValue),
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
      minOrderValue: Number(c.minOrderValue),
      expiresAt: c.expiresAt,
      active: c.active,
      used: usedBy.get(c.code) ?? 0,
    })),
  });
}

const createSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{3,20}$/, "Code must be 3-20 letters/numbers"),
    description: z.string().max(100).optional(),
    discountType: z.enum(["PERCENT", "FLAT"]),
    discountValue: z.number().positive(),
    minOrderValue: z.number().nonnegative().default(0),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((v) => v.discountType !== "PERCENT" || v.discountValue <= 100, { message: "Percent cannot be more than 100" });

/** POST /api/dryclean/offers: create an offer valid only at this dry-cleaner. */
export async function POST(req: Request) {
  let dc;
  try {
    dc = await guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the details." }, { status: 400 });
  }
  const v = parsed.data;
  const code = normalizeCode(v.code);
  if (await prisma.coupon.findUnique({ where: { code } })) {
    return NextResponse.json({ error: "That code is already taken. Try another." }, { status: 409 });
  }
  await prisma.coupon.create({
    data: {
      code,
      description: v.description,
      discountType: v.discountType,
      discountValue: v.discountValue,
      minOrderValue: v.minOrderValue,
      expiresAt: v.expiresOn ? new Date(`${v.expiresOn}T23:59:59+05:30`) : undefined,
      perCustomerLimit: 1000000,
      dryCleanerId: dc.id,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** PATCH /api/dryclean/offers: switch one of his own offers on or off. */
export async function PATCH(req: Request) {
  let dc;
  try {
    dc = await guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = z.object({ id: z.string(), active: z.boolean() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const r = await prisma.coupon.updateMany({ where: { id: parsed.data.id, dryCleanerId: dc.id }, data: { active: parsed.data.active } });
  if (r.count === 0) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
