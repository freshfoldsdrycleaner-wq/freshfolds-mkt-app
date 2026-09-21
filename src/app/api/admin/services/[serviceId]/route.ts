import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { approve, reject } from "@/lib/serviceApproval";

const bodySchema = z.object({ action: z.enum(["approve", "reject"]) });

/**
 * POST /api/admin/services/:serviceId  { action: "approve" | "reject" }
 * The only way a dry-cleaner's PENDING_* service change ever takes
 * effect — section 29. Every resolution is written to the audit log.
 */
export async function POST(req: Request, { params }: { params: { serviceId: string } }) {
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

  const service = await prisma.service.findUnique({ where: { id: params.serviceId } });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const result =
    parsed.data.action === "approve"
      ? approve({
          status: service.status as any,
          price: Number(service.price),
          discountPercent: Number(service.discountPercent),
          hasPhoto: service.hasPhoto,
          pendingData: service.pendingData as any,
        })
      : reject({
          status: service.status as any,
          price: Number(service.price),
          discountPercent: Number(service.discountPercent),
          hasPhoto: service.hasPhoto,
          pendingData: service.pendingData as any,
        });

  if (result.delete) {
    await prisma.service.delete({ where: { id: service.id } });
  } else if (result.patch) {
    await prisma.service.update({ where: { id: service.id }, data: result.patch as any });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: `SERVICE_${parsed.data.action.toUpperCase()}`,
      entityType: "Service",
      entityId: service.id,
      oldValue: { status: service.status, price: Number(service.price) },
      newValue: result.patch ?? { deleted: true },
    },
  });

  return NextResponse.json({ resolved: parsed.data.action, deleted: !!result.delete });
}
