import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashOtpCode } from "@/lib/providers/otp";
import { signSession } from "@/lib/auth";

const bodySchema = z
  .object({
    phone: z.string().min(6).max(20).optional(),
    email: z.string().email().optional(),
    code: z.string().length(6),
  })
  .refine((data) => data.phone || data.email, { message: "phone or email is required" });

/**
 * POST /api/auth/verify-otp
 * Verifies the most recent unconsumed, unexpired OTP for whichever
 * identifier (phone or email) was used to request it, and issues a
 * session token carrying { userId, role }.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { phone, email, code } = parsed.data;

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findUnique({ where: { phone: phone! } });

  if (!user) {
    return NextResponse.json({ error: "Invalid phone/email or code" }, { status: 401 });
  }

  const candidate = await prisma.otpCode.findFirst({
    where: {
      userId: user.id,
      consumed: false,
      expiresAt: { gt: new Date() },
      codeHash: hashOtpCode(code),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Invalid phone/email or code" }, { status: 401 });
  }

  await prisma.otpCode.update({
    where: { id: candidate.id },
    data: { consumed: true },
  });

  const token = signSession({ userId: user.id, role: user.role, phone: user.phone });

  return NextResponse.json({
    token,
    user: { id: user.id, phone: user.phone, email: user.email, role: user.role, name: user.name },
  });
}
