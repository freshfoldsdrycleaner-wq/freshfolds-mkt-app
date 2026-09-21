import { canTransition, assertTransition, IllegalOrderTransitionError, getAllowedNextStatuses } from "../src/lib/orderStateMachine";

describe("order state machine", () => {
  it("allows the documented happy path step by step", () => {
    const path: [string, string][] = [
      ["ORDER_PLACED", "PICKUP_ASSIGNED"],
      ["PICKUP_ASSIGNED", "PICKUP_IN_PROGRESS"],
      ["PICKUP_IN_PROGRESS", "PICKED_UP"],
      ["PICKED_UP", "RECEIVED_BY_DRY_CLEANER"],
      ["RECEIVED_BY_DRY_CLEANER", "INSPECTION"],
      ["INSPECTION", "PROCESSING"],
      ["PROCESSING", "QUALITY_CHECK"],
      ["QUALITY_CHECK", "COMPLETED"],
      ["COMPLETED", "PAYMENT_PENDING"],
      ["PAYMENT_PENDING", "PAYMENT_COMPLETED"],
      ["PAYMENT_COMPLETED", "DELIVERY_ASSIGNED"],
      ["DELIVERY_ASSIGNED", "OUT_FOR_DELIVERY"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
      ["DELIVERED", "CLOSED"],
    ];
    for (const [from, to] of path) {
      expect(canTransition(from as any, to as any)).toBe(true);
    }
  });

  it("blocks illegal jumps (section 39)", () => {
    expect(canTransition("ORDER_PLACED" as any, "DELIVERED" as any)).toBe(false);
    expect(() => assertTransition("ORDER_PLACED" as any, "DELIVERED" as any)).toThrow(
      IllegalOrderTransitionError
    );
  });

  it("blocks moving backwards", () => {
    expect(canTransition("PROCESSING" as any, "PICKED_UP" as any)).toBe(false);
  });

  it("allows cancellation only from early, pre-pickup-committed states", () => {
    expect(getAllowedNextStatuses("ORDER_PLACED" as any)).toContain("CANCELLED");
    expect(getAllowedNextStatuses("PROCESSING" as any)).not.toContain("CANCELLED");
  });

  it("reserves the Stage 2 guard: PICKED_UP requires a condition report", () => {
    expect(
      canTransition("PICKUP_IN_PROGRESS" as any, "PICKED_UP" as any, {
        hasPickupConditionReport: false,
      })
    ).toBe(false);
  });

  it("reserves the Stage 3 guard: DELIVERED requires OTP verification", () => {
    expect(
      canTransition("OUT_FOR_DELIVERY" as any, "DELIVERED" as any, {
        hasDeliveryOtpVerification: false,
      })
    ).toBe(false);
  });
});
