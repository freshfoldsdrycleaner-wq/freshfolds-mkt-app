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
