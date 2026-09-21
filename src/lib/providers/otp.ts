import crypto from "crypto";

/**
 * Section 44/47-style abstraction: the rest of the app calls OtpProvider,
 * never a specific SMS/email vendor directly. Swap the mock providers for
 * a real MSG91/Twilio (SMS) or SES/Postmark (email) implementation later
 * without touching callers. `destination` is a phone number for the SMS
 * channel and an email address for the email channel.
 */
export interface OtpProvider {
  /** Sends (or, for mock, logs) a one-time code to the given destination. */
  sendCode(destination: string, code: string): Promise<void>;
}

export class MockOtpProvider implements OtpProvider {
  async sendCode(destination: string, code: string): Promise<void> {
    // Free-tier dev mode: no real SMS is sent. The code is logged so the
    // developer/tester can complete the login flow.
    // eslint-disable-next-line no-console
    console.log(`[MockOtpProvider:SMS] OTP for ${destination}: ${code}`);
  }
}

export class MockEmailOtpProvider implements OtpProvider {
  async sendCode(destination: string, code: string): Promise<void> {
    // Free-tier dev mode: no real email is sent. Logged for the
    // developer/tester to complete the login flow.
    // eslint-disable-next-line no-console
    console.log(`[MockOtpProvider:Email] OTP for ${destination}: ${code}`);
  }
}

export function getOtpProvider(): OtpProvider {
  const kind = process.env.OTP_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      return new MockOtpProvider();
    // case "msg91": return new Msg91OtpProvider(...)
    // case "twilio": return new TwilioOtpProvider(...)
  }
}

export function getEmailOtpProvider(): OtpProvider {
  const kind = process.env.EMAIL_OTP_PROVIDER ?? "mock";
  switch (kind) {
    case "mock":
    default:
      return new MockEmailOtpProvider();
    // case "ses": return new SesEmailOtpProvider(...)
    // case "postmark": return new PostmarkEmailOtpProvider(...)
  }
}

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}
