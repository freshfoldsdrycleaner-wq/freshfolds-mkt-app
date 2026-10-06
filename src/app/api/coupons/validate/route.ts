import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { evaluateCoupon } from "@/lib/coupons";

const bodySchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().nonnegative(),
});

/**
 * POST /api/coupons/validate
 * Customer checks an offer code against their cart before ordering.
 * The real discount is recomputed again when the order is placed.
 */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "CUSTOMER");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter an offer code." }, { status: 400 });

  const result = await evaluateCoupon(parsed.data.code, parsed.data.subtotal, session.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    code: result.code,
    discountAmount: result.discountAmount,
    label: result.label,
  });
}
