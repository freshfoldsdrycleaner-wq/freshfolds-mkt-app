import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/dryCleanerTerms";

const bodySchema = z.object({
  version: z.string(),
  fullName: z.string().trim().min(3).max(80),
  agree: z.literal(true),
});

/** POST /api/drycleaners/me/terms: the dry-cleaner owner accepts the current partner terms. */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "DRYCLEANER_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tick the box and type your full name." }, { status: 400 });
  }
  if (parsed.data.version !== TERMS_VERSION) {
    return NextResponse.json({ error: "These terms were updated. Reload the app and read them again." }, { status: 409 });
  }
  const dc = await prisma.dryCleaner.findUnique({ where: { ownerId: session.userId }, select: { id: true } });
  if (!dc) return NextResponse.json({ error: "No dry-cleaner on this account" }, { status: 404 });
  await prisma.dryCleaner.update({
    where: { id: dc.id },
    data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(), termsAcceptedBy: parsed.data.fullName },
  });
  return NextResponse.json({ ok: true });
}
