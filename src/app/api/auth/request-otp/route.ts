import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateOtpCode, hashOtpCode, getOtpProvider, getEmailOtpProvider } from "@/lib/providers/otp";

const bodySchema = z
  .object({
    phone: z.string().min(6).max(20).optional(),
    email: z.string().email().optional(),
    role: z.enum(["CUSTOMER", "DRYCLEANER_ADMIN", "DELIVERY_PERSON", "FRESHFOLD_ADMIN"]).optional(),
  })
  .refine((data) => data.phone || data.email, { message: "phone or email is required" });

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 300);

/**
 * POST /api/auth/request-otp
 * Section 3: mobile + OTP login, extended to also support logging in with
 * an email address (e.g. an admin account provisioned by email rather
 * than phone). Exactly one channel is used per request — email if given,
 * otherwise phone — and the code goes to whichever one was provided.
 *
 * A brand-new account can only be created via phone: `phone` is still a
 * required, unique column (every account needs one), so an email-only
 * request for an email that doesn't exist yet is rejected rather than
 * silently creating a phone-less user. To add an email to an account
 * that already exists by phone, log in by phone first, then use a
 * profile-update endpoint (not yet built) to attach the email.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { phone, email, role } = parsed.data;

  let user;
  if (email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (!phone) {
        // Same non-leaking shape either way — don't reveal whether the
        // email exists, but a brand-new email truly can't create an
        // account without a phone number under the current schema.
        return NextResponse.json(
          { error: "No account found for this email. New accounts must register with a phone number." },
          { status: 404 }
        );
      }
      user = await prisma.user.upsert({
        where: { phone },
        update: { email },
        create: { phone, email, role: role ?? "CUSTOMER" },
      });
    }
  } else {
    user = await prisma.user.upsert({
      where: { phone: phone! },
      update: {},
      create: { phone: phone!, role: role ?? "CUSTOMER" },
    });
  }

  const code = generateOtpCode();
  await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    },
  });

  const destination = email ?? phone!;
  const provider = email ? getEmailOtpProvider() : getOtpProvider();
  await provider.sendCode(destination, code);

  return NextResponse.json({ message: "OTP sent", channel: email ? "email" : "sms", expiresInSeconds: OTP_TTL_SECONDS });
}
