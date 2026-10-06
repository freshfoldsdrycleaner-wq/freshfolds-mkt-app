import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { normalizeCode } from "@/lib/coupons";

function guard(req: Request) {
  const session = requireSession(req);
  requireRole(session, "FRESHFOLD_ADMIN");
  return session;
}

function authError(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  throw e;
}

const createSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{3,20}$/, "Code must be 3-20 letters/numbers"),
    description: z.string().max(200).optional(),
    discountType: z.enum(["PERCENT", "FLAT"]),
    discountValue: z.number().positive(),
    maxDiscount: z.number().positive().optional(),
    minOrderValue: z.number().nonnegative().default(0),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // last valid day (IST)
    usageLimit: z.number().int().positive().optional(),
    perCustomerLimit: z.number().int().positive().default(1),
    isPublic: z.boolean().default(false),
  })
  .refine((v) => v.discountType !== "PERCENT" || v.discountValue <= 100, {
    message: "Percent cannot be more than 100",
  });

/** GET /api/admin/coupons: all offer codes with how many times each was used. */
export async function GET(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  const usage = await prisma.order.groupBy({
    by: ["couponCode"],
    where: { couponCode: { not: null }, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });
  const usedBy = new Map(usage.map((u) => [u.couponCode, u._count._all]));
  return NextResponse.json({
    coupons: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: Number(c.discountValue),
      maxDiscount: c.maxDiscount != null ? Number(c.maxDiscount) : null,
      minOrderValue: Number(c.minOrderValue),
      expiresAt: c.expiresAt,
      usageLimit: c.usageLimit,
      perCustomerLimit: c.perCustomerLimit,
      active: c.active,
      isPublic: c.isPublic,
      used: usedBy.get(c.code) ?? 0,
    })),
  });
}

/** POST /api/admin/coupons: create an offer code (Fresh Fold admin only). */
export async function POST(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "Please check the details.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const v = parsed.data;
  const code = normalizeCode(v.code);
  if (await prisma.coupon.findUnique({ where: { code } })) {
    return NextResponse.json({ error: "That code already exists." }, { status: 409 });
  }
  const created = await prisma.coupon.create({
    data: {
      code,
      description: v.description,
      discountType: v.discountType,
      discountValue: v.discountValue,
      maxDiscount: v.discountType === "PERCENT" ? v.maxDiscount : undefined,
      minOrderValue: v.minOrderValue,
      expiresAt: v.expiresOn ? new Date(`${v.expiresOn}T23:59:59+05:30`) : undefined,
      usageLimit: v.usageLimit,
      perCustomerLimit: v.perCustomerLimit,
      isPublic: v.isPublic,
    },
  });
  return NextResponse.json({ coupon: { id: created.id, code: created.code } }, { status: 201 });
}

const patchSchema = z.object({ id: z.string(), active: z.boolean().optional(), isPublic: z.boolean().optional() });

/** PATCH /api/admin/coupons: switch an offer code on or off. */
export async function PATCH(req: Request) {
  try {
    guard(req);
  } catch (e) {
    return authError(e);
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await prisma.coupon.update({ where: { id: parsed.data.id }, data: { active: parsed.data.active, isPublic: parsed.data.isPublic } });
  return NextResponse.json({ ok: true });
}
