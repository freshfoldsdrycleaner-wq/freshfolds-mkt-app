import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { proposeEdit, proposeRemoval } from "@/lib/serviceApproval";

/**
 * PATCH /api/drycleaners/:id/services/:serviceId
 * A dry-cleaner proposes a price/discount/photo change or a removal —
 * never applies it directly. { action: "edit", changes: {...} } or
 * { action: "delete" }. An admin's PATCH still goes through here but
 * takes effect immediately (see below), matching POST's admin shortcut.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    changes: z.object({
      price: z.number().positive().optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      hasPhoto: z.boolean().optional(),
    }),
  }),
  z.object({ action: z.literal("delete") }),
]);

async function assertOwnerOrAdmin(req: Request, dryCleanerId: string) {
  const session = requireSession(req);
  if (session.role === "FRESHFOLD_ADMIN") return session;
  requireRole(session, "DRYCLEANER_ADMIN");
  const dc = await prisma.dryCleaner.findUnique({ where: { id: dryCleanerId } });
  if (!dc || dc.ownerId !== session.userId) {
    throw new ForbiddenError("Not the owner of this dry-cleaner");
  }
  return session;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; serviceId: string } }
) {
  let session;
  try {
    session = await assertOwnerOrAdmin(req, params.id);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const service = await prisma.service.findFirst({ where: { id: params.serviceId, dryCleanerId: params.id } });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  if (service.status !== "ACTIVE") {
    return NextResponse.json({ error: "This service already has a pending change awaiting approval" }, { status: 409 });
  }

  const isAdmin = session.role === "FRESHFOLD_ADMIN";

  if (parsed.data.action === "delete") {
    if (isAdmin) {
      await prisma.service.delete({ where: { id: service.id } });
      return NextResponse.json({ deleted: true });
    }
    const patch = proposeRemoval();
    const updated = await prisma.service.update({ where: { id: service.id }, data: patch as any });
    return NextResponse.json({ service: { ...updated, price: Number(updated.price), discountPercent: Number(updated.discountPercent) } });
  }

  // action === "edit"
  if (isAdmin) {
    const updated = await prisma.service.update({ where: { id: service.id }, data: parsed.data.changes });
    return NextResponse.json({ service: { ...updated, price: Number(updated.price), discountPercent: Number(updated.discountPercent) } });
  }
  const patch = proposeEdit(parsed.data.changes);
  const updated = await prisma.service.update({ where: { id: service.id }, data: patch as any });
  return NextResponse.json({ service: { ...updated, price: Number(updated.price), discountPercent: Number(updated.discountPercent) } });
}
