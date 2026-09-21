import { OrderStatus } from "@prisma/client";

/**
 * Section 39: a controlled state machine. Nobody — customer, dry-cleaner,
 * delivery person, or a buggy frontend — can push an order to an arbitrary
 * status. Every transition must be listed here to be legal.
 *
 * Stage 1 enforces the linear happy-path graph plus cancellation from any
 * pre-delivery state. Stage 2 adds the extra guard that PICKED_UP requires
 * a recorded pickup condition report, and Stage 3 adds the guard that
 * DELIVERED requires OTP-verified delivery confirmation — those guards hook
 * into `canTransition` via the `context` argument so this file stays the
 * single source of truth as the rules grow.
 */

const CANCELLABLE_FROM: OrderStatus[] = [
  "ORDER_PLACED",
  "PICKUP_ASSIGNED",
  "PICKUP_IN_PROGRESS",
];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  ORDER_PLACED: ["PICKUP_ASSIGNED", "CANCELLED"],
  PICKUP_ASSIGNED: ["PICKUP_IN_PROGRESS", "CANCELLED"],
  PICKUP_IN_PROGRESS: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["RECEIVED_BY_DRY_CLEANER"],
  RECEIVED_BY_DRY_CLEANER: ["INSPECTION"],
  INSPECTION: ["PROCESSING"],
  PROCESSING: ["QUALITY_CHECK"],
  QUALITY_CHECK: ["COMPLETED"],
  COMPLETED: ["PAYMENT_PENDING"],
  PAYMENT_PENDING: ["PAYMENT_COMPLETED"],
  PAYMENT_COMPLETED: ["DELIVERY_ASSIGNED"],
  DELIVERY_ASSIGNED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export interface TransitionContext {
  hasPickupConditionReport?: boolean; // wired up in Stage 2
  hasDeliveryOtpVerification?: boolean; // wired up in Stage 3
}

export class IllegalOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal order status transition: ${from} -> ${to}`);
    this.name = "IllegalOrderTransitionError";
  }
}

export function getAllowedNextStatuses(current: OrderStatus): OrderStatus[] {
  const allowed = TRANSITIONS[current] ?? [];
  if (CANCELLABLE_FROM.includes(current) && !allowed.includes("CANCELLED")) {
    return [...allowed, "CANCELLED"];
  }
  return allowed;
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  context: TransitionContext = {}
): boolean {
  if (!getAllowedNextStatuses(from).includes(to)) return false;

  // Guard reserved for Stage 2: no skipping the mandatory pickup photo /
  // defect report (spec sections 12-14, rule 7 & 8).
  if (to === "PICKED_UP" && context.hasPickupConditionReport === false) {
    return false;
  }

  // Guard reserved for Stage 3: no marking DELIVERED without the
  // customer's delivery OTP (spec section 19).
  if (to === "DELIVERED" && context.hasDeliveryOtpVerification === false) {
    return false;
  }

  return true;
}

/**
 * Throws IllegalOrderTransitionError if the move isn't allowed; otherwise
 * returns the new status so callers can assign it in one line.
 */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  context: TransitionContext = {}
): OrderStatus {
  if (!canTransition(from, to, context)) {
    throw new IllegalOrderTransitionError(from, to);
  }
  return to;
}
