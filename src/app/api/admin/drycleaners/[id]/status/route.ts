import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

const bodySchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
});

/**
 * POST /api/admin/drycleaners/:id/status
 * Section 28: approve (PENDING -> ACTIVE), suspend, reactivate, or
 * deactivate a dry-cleaner. Every change is written to the audit log —
 * this is the only place a dry-cleaner's status can move.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = requireSession(req);
    requireRole(session, "FRESHFOLD_ADMIN");
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const dryCleaner = await prisma.dryCleaner.findUnique({ where: { id: params.id } });
  if (!dryCleaner) return NextResponse.json({ error: "Dry-cleaner not found" }, { status: 404 });

  const updated = await prisma.dryCleaner.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DRYCLEANER_STATUS_CHANGE",
      entityType: "DryCleaner",
      entityId: dryCleaner.id,
      oldValue: { status: dryCleaner.status },
      newValue: { status: updated.status },
    },
  });

  return NextResponse.json({ dryCleaner: { id: updated.id, status: updated.status } });
}
