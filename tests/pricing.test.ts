import {
  calculateEstimatedOrder,
  calculateCommissionBreakdown,
  recalculateAfterFinalPrice,
} from "../src/lib/pricing";

describe("calculateEstimatedOrder", () => {
  it("computes subtotal and 20% booking payment (spec section 7)", () => {
    const result = calculateEstimatedOrder(
      [
        { itemName: "Shirt", serviceName: "Dry Clean", quantity: 3, unitPrice: 80 },
        { itemName: "Trousers", serviceName: "Dry Clean", quantity: 2, unitPrice: 100 },
        { itemName: "Suit", serviceName: "Dry Clean", quantity: 1, unitPrice: 300 },
      ],
      20
    );
    // 240 + 200 + 300 = 740
    expect(result.estimatedTotal).toBe(740);
    expect(result.bookingPayment).toBe(148); // 20% of 740
    expect(result.remainingAfterBooking).toBe(592);
  });

  it("defaults to 20% booking payment when not specified", () => {
    const result = calculateEstimatedOrder([
      { itemName: "Shirt", serviceName: "Dry Clean", quantity: 1, unitPrice: 100 },
    ]);
    expect(result.bookingPaymentPercent).toBe(20);
    expect(result.bookingPayment).toBe(20);
  });
});

describe("calculateCommissionBreakdown", () => {
  it("matches the worked example in spec section 56", () => {
    // Shirt x2 @100 + Trouser x2 @150 + Suit x1 @300 = 800
    const result = calculateCommissionBreakdown(800, 10, 0);
    expect(result.commissionAmount).toBe(80);
    expect(result.dryCleanerNetAmount).toBe(720);
  });

  it("matches the worked example in spec section 58 (commission + 20% advance)", () => {
    const result = calculateCommissionBreakdown(1000, 10, 200);
    expect(result.commissionAmount).toBe(100);
    expect(result.dryCleanerNetAmount).toBe(900);
    expect(result.customerBalanceDue).toBe(800);
  });

  it("never adds the commission on top of the customer's price (section 57)", () => {
    // Customer sees ₹100 for a shirt; commission is deducted from the
    // dry-cleaner's side, not added to what the customer owes.
    const result = calculateCommissionBreakdown(100, 10, 0);
    expect(result.orderValue).toBe(100); // customer still owes exactly 100
    expect(result.commissionAmount).toBe(10);
    expect(result.dryCleanerNetAmount).toBe(90);
  });
});

describe("recalculateAfterFinalPrice", () => {
  it("matches the worked example in spec section 60", () => {
    // Estimated 1000, customer paid 200 at booking, final becomes 1200.
    const result = recalculateAfterFinalPrice(1200, 10, 200);
    expect(result.commissionAmount).toBe(120);
    expect(result.customerBalanceDue).toBe(1000);
    expect(result.dryCleanerNetAmount).toBe(1080);
  });
});
