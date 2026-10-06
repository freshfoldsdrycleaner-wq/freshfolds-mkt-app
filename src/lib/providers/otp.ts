import crypto from "crypto";
import nodemailer from "nodemailer";

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

// Lazily created and reused across calls — nodemailer's transporter holds
// a connection pool, so we don't want a fresh one per request.
let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return gmailTransporter;
}

function otpEmailHtml(code: string): string {
  return `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;">
        <h2 style="color:#2563eb;margin-bottom:4px;">Fresh Fold</h2>
        <p style="color:#334155;">Your verification code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a;">${code}</p>
        <p style="color:#94a3b8;font-size:13px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>`;
}

/**
 * Gmail SMTP provider. Note: Railway blocks outbound SMTP, so this does
 * not work in production there. Kept for local use.
 */
export class GmailOtpProvider implements OtpProvider {
  async sendCode(destination: string, code: string): Promise<void> {
    const transporter = getGmailTransporter();
    await transporter.sendMail({
      from: `"Fresh Fold" <${process.env.GMAIL_USER}>`,
      to: destination,
      subject: "Your Fresh Fold verification code",
      html: otpEmailHtml(code),
    });
  }
}

/**
 * SendGrid HTTP API provider. Uses HTTPS (port 443), so it works on Railway.
 * Requires env vars SENDGRID_API_KEY and EMAIL_FROM (a verified single sender).
 */
export class SendGridOtpProvider implements OtpProvider {
  async sendCode(destination: string, code: string): Promise<void> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: destination }] }],
        from: { email: process.env.EMAIL_FROM, name: "Fresh Fold" },
        subject: "Your Fresh Fold verification code",
        content: [{ type: "text/html", value: otpEmailHtml(code) }],
      }),
    });
    if (!res.ok) {
      throw new Error(`SendGrid failed: ${res.status} ${await res.text()}`);
    }
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
    case "sendgrid":
      return new SendGridOtpProvider();
    case "gmail":
      return new GmailOtpProvider();
    case "mock":
    default:
      return new MockEmailOtpProvider();
  }
}

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}