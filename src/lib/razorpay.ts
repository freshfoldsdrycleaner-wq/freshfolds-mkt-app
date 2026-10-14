import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { FF_ADVANCE_PREFIX } from "@/lib/upi";
import { getNotificationProvider } from "@/lib/providers/notification";

const API = "https://api.razorpay.com/v1";

export function razorpayEnabled(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function rzp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error?.description || "Payment service error");
  return data as T;
}

export async function createRazorpayOrder(
  amountRupees: number,
  receipt: string,
  notes: Record<string, string>,
  transfers?: { account: string; amount: number; currency: string; notes?: Record<string, string> }[]
) {
  return rzp<{ id: string; amount: number; currency: string }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      receipt: receipt.slice(0, 40),
      notes,
      ...(transfers && transfers.length ? { transfers } : {}),
    }),
  });
}

export async function fetchRazorpayOrder(id: string) {
  return rzp<{ id: string; amount: number; amount_paid: number; status: string; notes?: Record<string, string> }>(`/orders/${encodeURIComponent(id)}`);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout success signature: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** 20% advance still due for an order, in rupees (never negative). */
export function advanceDue(estimatedTotal: number, amountPaid: number): number {
  return Math.max(0, Math.round(estimatedTotal * 0.2) - amountPaid);
}

/**
 * Records a captured Razorpay payment against an order. Safe to call twice
 * (checkout verify and webhook both call it): the payment id is the unique key.
 */
export async function recordRazorpayAdvance(orderId: string, paymentId: string, amountRupees: number, autoSplitRupees = 0): Promise<boolean> {
  const transactionId = `${FF_ADVANCE_PREFIX}RZP-${paymentId}`;
  const done = await prisma.$transaction(async (tx) => {
    if (await tx.payment.findUnique({ where: { transactionId } })) return null;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { dryCleaner: { select: { ownerId: true } } } });
    if (!order) return null;
    await tx.payment.create({
      data: { orderId, amount: amountRupees, paymentType: "BOOKING", transactionId, status: "SUCCESS" },
    });
    const paid = Number(order.amountPaid) + amountRupees;
    const balance = Math.max(0, Number(order.balanceDue ?? order.estimatedTotal) - amountRupees);
    await tx.order.update({ where: { id: orderId }, data: { amountPaid: paid, balanceDue: balance, advanceClaimedAt: null } });
    // The dry-cleaner's share of this advance was sent to him by Razorpay at the moment of payment.
    if (autoSplitRupees > 0) {
      await tx.vendorPayout.create({
        data: { dryCleanerId: order.dryCleanerId, amount: autoSplitRupees, note: `Sent automatically by Razorpay · ${order.orderNumber}` },
      });
    }
    return order;
  });
  if (!done) return false;
  try {
    const n = getNotificationProvider();
    await n.send({ userId: done.customerId, orderId, title: "Advance received", message: `${done.orderNumber}: we received your payment of Rs ${amountRupees}. Thank you!` });
    await n.send({ userId: done.dryCleaner.ownerId, orderId, title: "Advance paid", message: `${done.orderNumber}: the customer paid Rs ${amountRupees} advance online.` });
  } catch {}
  return true;
}

/**
 * Refunds every online (Razorpay) advance of an order back to the customer's
 * original payment method. Used when an order is declined or cancelled.
 * Returns how much was refunded and how much (UPI / cash / failed) still needs
 * a manual refund by the admin.
 */
export async function refundRazorpayAdvance(orderId: string): Promise<{ refunded: number; failed: number }> {
  let refunded = 0;
  let failed = 0;
  if (!razorpayEnabled()) return { refunded, failed };
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, dryCleanerId: true } });
  if (!order) return { refunded, failed };
  const prefix = `${FF_ADVANCE_PREFIX}RZP-`;
  const payments = await prisma.payment.findMany({
    where: { orderId, status: "SUCCESS", transactionId: { startsWith: prefix } },
  });
  for (const p of payments) {
    const paymentId = p.transactionId.slice(prefix.length);
    const amount = Number(p.amount);
    const body = (reverse: boolean) =>
      JSON.stringify({
        amount: Math.round(amount * 100),
        speed: "normal",
        notes: { orderId, reason: "Order declined or cancelled" },
        receipt: `RF-${order.orderNumber}`.slice(0, 40),
        ...(reverse ? { reverse_all: 1 } : {}),
      });
    let reversed = false;
    try {
      try {
        await rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: body(true) });
        reversed = true;
      } catch (e1) {
        const m = String((e1 as Error).message || "").toLowerCase();
        if (m.includes("already") && m.includes("refund")) throw e1;
        // Payment had no automatic split: plain refund.
        await rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: body(false) });
      }
    } catch (e) {
      const m = String((e as Error).message || "").toLowerCase();
      if (m.includes("fully refunded") || (m.includes("already") && m.includes("refund"))) {
        await prisma.payment.update({ where: { id: p.id }, data: { status: "REFUNDED" } });
        continue;
      }
      failed += amount;
      continue;
    }
    await prisma.payment.update({ where: { id: p.id }, data: { status: "REFUNDED" } });
    refunded += amount;
    // Take back the dry-cleaner's automatic share from the payout ledger.
    if (reversed) {
      const sent = await prisma.vendorPayout.findFirst({
        where: { dryCleanerId: order.dryCleanerId, note: `Sent automatically by Razorpay · ${order.orderNumber}`, amount: { gt: 0 } },
      });
      if (sent) {
        await prisma.vendorPayout.create({
          data: { dryCleanerId: order.dryCleanerId, amount: -Number(sent.amount), note: `Refund reversal · ${order.orderNumber}` },
        });
      }
    }
  }
  if (refunded > 0) {
    await prisma.order.update({ where: { id: orderId }, data: { amountPaid: { decrement: refunded } } });
  }
  return { refunded, failed };
}
