import { prisma } from "@/lib/prisma";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export type CouponResult =
  | { ok: true; code: string; discountAmount: number; label: string }
  | { ok: false; error: string };

/**
 * Validates an offer code against a subtotal for one customer and returns
 * the rupee discount. Used by both the "Apply" check at checkout and by
 * order creation, so the two can never disagree. Never trusts the client.
 */
export async function evaluateCoupon(
  rawCode: string,
  subtotal: number,
  customerId: string
): Promise<CouponResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Enter an offer code." };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) return { ok: false, error: "This offer code is not valid." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This offer code has expired." };
  }
  const minOrder = Number(coupon.minOrderValue);
  if (subtotal < minOrder) {
    return { ok: false, error: `This offer needs a minimum order of Rs ${minOrder}.` };
  }

  if (coupon.usageLimit != null) {
    const used = await prisma.order.count({
      where: { couponCode: code, status: { not: "CANCELLED" } },
    });
    if (used >= coupon.usageLimit) return { ok: false, error: "This offer code is fully used." };
  }
  const usedByCustomer = await prisma.order.count({
    where: { couponCode: code, customerId, status: { not: "CANCELLED" } },
  });
  if (usedByCustomer >= coupon.perCustomerLimit) {
    return { ok: false, error: "You have already used this offer code." };
  }

  let discount =
    coupon.discountType === "PERCENT"
      ? (subtotal * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue);
  if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  discount = round2(Math.min(discount, subtotal));
  if (discount <= 0) return { ok: false, error: "This offer does not apply to your order." };

  const label =
    coupon.discountType === "PERCENT"
      ? `${Number(coupon.discountValue)}% off`
      : `Rs ${Number(coupon.discountValue)} off`;
  return { ok: true, code, discountAmount: discount, label };
}
