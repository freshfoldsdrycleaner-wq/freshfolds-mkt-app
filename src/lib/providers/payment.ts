/**
 * Section 36: payment abstraction. The rest of the app calls PaymentProvider
 * and never touches raw card/UPI details — Fresh Fold's database never
 * stores card numbers, CVVs, or UPI PINs. Swap MockPaymentProvider for a
 * real Razorpay/Stripe integration later.
 */

export interface ChargeRequest {
  orderId: string;
  amount: number;
  purpose: "BOOKING" | "FINAL";
}

export interface ChargeResult {
  transactionId: string;
  status: "SUCCESS" | "FAILED";
}

export interface PaymentProvider {
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(transactionId: string, amount: number): Promise<ChargeResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    // Dev mode: always succeeds and mints a fake transaction id.
    return {
      transactionId: `MOCK-${req.purpose}-${req.orderId}-${Date.now()}`,
      status: "SUCCESS",
    };
  }

  async refund(transactionId: string): Promise<ChargeResult> {
    return {
      transactionId: `${transactionId}-REFUND-${Date.now()}`,
      status: "SUCCESS",
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const kind = process.env.PAYMENT_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      return new MockPaymentProvider();
    // case "razorpay": return new RazorpayPaymentProvider(...)
  }
}
