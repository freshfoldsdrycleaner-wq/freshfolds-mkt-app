import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { newServicePayload } from "@/lib/serviceApproval";

/**
 * Section 24: dry-cleaner price/service management. Only the owning
 * dry-cleaner (or a FRESHFOLD_ADMIN, per section 29) may add/edit prices.
 * A dry-cleaner's own submissions land as PENDING_NEW and wait for admin
 * approval (see serviceApproval.ts); an admin's own additions go live
 * immediately, since there's no one above them to approve it.
 */

const createSchema = z.object({
  category: z.string().min(1),
  itemName: z.string().min(1),
  serviceName: z.string().min(1),
  price: z.number().positive(),
  discountPercent: z.number().min(0).max(100).optional(),
  hasPhoto: z.boolean().optional(),
});

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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Owner/admin see every status (including PENDING_*) for their own
  // dashboard; anyone else only ever sees the live, approved catalog.
  let isOwnerOrAdmin = false;
  try {
    await assertOwnerOrAdmin(req, params.id);
    isOwnerOrAdmin = true;
  } catch {
    isOwnerOrAdmin = false;
  }

  const services = await prisma.service.findMany({
    where: { dryCleanerId: params.id, ...(isOwnerOrAdmin ? {} : { status: "ACTIVE" }) },
    orderBy: [{ category: "asc" }, { itemName: "asc" }],
  });
  return NextResponse.json({
    services: services.map((s) => ({ ...s, price: Number(s.price), discountPercent: Number(s.discountPercent) })),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let session;
  try {
    session = await assertOwnerOrAdmin(req, params.id);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = newServicePayload(parsed.data);
  // An admin adding a price directly has no one above them to approve it.
  if (session.role === "FRESHFOLD_ADMIN") payload.status = "ACTIVE";

  const service = await prisma.service.create({
    data: { dryCleanerId: params.id, ...payload } as any,
  });

  return NextResponse.json(
    { service: { ...service, price: Number(service.price), discountPercent: Number(service.discountPercent) } },
    { status: 201 }
  );
}

