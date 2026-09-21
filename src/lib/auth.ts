import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

/**
 * Section 40: role-based access control. Every API route decodes the
 * bearer token to get { userId, role } and checks it against what the
 * route is allowed to do — a customer can never fetch another customer's
 * order, a delivery person only their assigned orders, etc.
 */

export interface SessionPayload {
  userId: string;
  role: Role;
  phone: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: Request): SessionPayload | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySession(header.slice("Bearer ".length));
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requireSession(req: Request): SessionPayload {
  const session = getSessionFromRequest(req);
  if (!session) throw new UnauthorizedError();
  return session;
}

export function requireRole(session: SessionPayload, ...roles: Role[]): void {
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
  }
}
