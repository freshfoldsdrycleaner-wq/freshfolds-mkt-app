/**
 * All order financial math lives here, and ONLY here.
 * Per spec sections 37 and 55-64: commission and booking-payment figures
 * must be calculated server-side and must never be trusted from the client.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * A service's discount is applied server-side before any pricing math runs
 * — the customer is always charged (and commission always calculated on)
 * the discounted price, never the pre-discount list price.
 */
export function effectivePrice(price: number, discountPercent: number): number {
  return round2(price * (1 - discountPercent / 100));
}

export interface OrderItemInput {
  itemName: string;
  serviceName: string;
  quantity: number;
  unitPrice: number; // looked up server-side from Service.price, never from client
}

export interface EstimatedOrder {
  items: (OrderItemInput & { estimatedPrice: number })[];
  estimatedTotal: number;
  bookingPaymentPercent: number;
  bookingPayment: number;
  remainingAfterBooking: number;
}

/**
 * Section 7 / 37: subtotal + 20% booking payment / 80% remaining.
 */
export function calculateEstimatedOrder(
  items: OrderItemInput[],
  bookingPaymentPercent = 20
): EstimatedOrder {
  const pricedItems = items.map((i) => ({
    ...i,
    estimatedPrice: round2(i.unitPrice * i.quantity),
  }));

  const estimatedTotal = round2(
    pricedItems.reduce((sum, i) => sum + i.estimatedPrice, 0)
  );
  const bookingPayment = round2(estimatedTotal * (bookingPaymentPercent / 100));

  return {
    items: pricedItems,
    estimatedTotal,
    bookingPaymentPercent,
    bookingPayment,
    remainingAfterBooking: round2(estimatedTotal - bookingPayment),
  };
}

export interface CommissionBreakdown {
  orderValue: number;
  commissionRatePercent: number;
  commissionAmount: number;
  dryCleanerNetAmount: number;
  amountPaidByCustomer: number;
  customerBalanceDue: number;
}

/**
 * Sections 55-60: platform commission is a percentage of the *applicable*
 * order value (estimated at booking, or final after inspection), deducted
 * from the dry-cleaner's earnings. The customer is never charged extra for it.
 *
 * `amountPaidByCustomer` is whatever the customer has actually paid so far
 * (e.g. the 20% booking payment) — used only to compute the customer's
 * remaining balance, and kept completely separate from the commission split.
 */
export function calculateCommissionBreakdown(
  orderValue: number,
  commissionRatePercent: number,
  amountPaidByCustomer: number
): CommissionBreakdown {
  const commissionAmount = round2(orderValue * (commissionRatePercent / 100));
  const dryCleanerNetAmount = round2(orderValue - commissionAmount);
  const customerBalanceDue = round2(orderValue - amountPaidByCustomer);

  return {
    orderValue: round2(orderValue),
    commissionRatePercent,
    commissionAmount,
    dryCleanerNetAmount,
    amountPaidByCustomer: round2(amountPaidByCustomer),
    customerBalanceDue,
  };
}

/**
 * Section 60: when the dry-cleaner's post-inspection final total differs
 * from the original estimate, everything (commission, dry-cleaner net,
 * customer balance) must be recalculated from the *final* total — while
 * the amount the customer already paid at booking stays fixed.
 */
export function recalculateAfterFinalPrice(
  finalTotal: number,
  commissionRatePercent: number,
  amountAlreadyPaid: number
): CommissionBreakdown {
  return calculateCommissionBreakdown(
    finalTotal,
    commissionRatePercent,
    amountAlreadyPaid
  );
}

export function generateOrderNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `FF-${y}${m}${d}-${rand}`;
}
