/**
 * Sections 24/29: a dry-cleaner's price/catalog edits never take effect on
 * their own — every add, price/discount change, or removal sits as a
 * PENDING_* row until a FRESHFOLD_ADMIN approves or rejects it. This file
 * is the single source of truth for what each transition does to a
 * service row; the API routes call these pure functions and persist the
 * result, so the rules are unit-testable without touching Prisma.
 */

export type ServiceStatus = "ACTIVE" | "PENDING_NEW" | "PENDING_EDIT" | "PENDING_DELETE";

export interface ServiceLike {
  status: ServiceStatus;
  price: number;
  discountPercent: number;
  hasPhoto: boolean;
  pendingData?: { price?: number; discountPercent?: number; hasPhoto?: boolean } | null;
}

export interface ServiceEditProposal {
  price?: number;
  discountPercent?: number;
  hasPhoto?: boolean;
}

/** A brand-new service always starts PENDING_NEW — never visible to
 * customers, and never billable, until approved. */
export function newServicePayload(input: {
  category: string;
  itemName: string;
  serviceName: string;
  price: number;
  discountPercent?: number;
  hasPhoto?: boolean;
}) {
  return {
    category: input.category,
    itemName: input.itemName,
    serviceName: input.serviceName,
    price: input.price,
    discountPercent: input.discountPercent ?? 0,
    hasPhoto: input.hasPhoto ?? false,
    status: "PENDING_NEW" as ServiceStatus,
    pendingData: null,
  };
}

/** Proposing an edit on a currently-ACTIVE service stashes the proposed
 * values in pendingData and flips status — the live price/discount/photo
 * customers see are untouched until approval. Editing a service that is
 * itself still PENDING_* is rejected by the caller (nothing to edit yet). */
export function proposeEdit(changes: ServiceEditProposal) {
  return { status: "PENDING_EDIT" as ServiceStatus, pendingData: changes };
}

/** Proposing removal never deletes the row outright — it flags it so the
 * item keeps working for customers (and any in-flight order) until an
 * admin confirms the removal. */
export function proposeRemoval() {
  return { status: "PENDING_DELETE" as ServiceStatus, pendingData: null };
}

export interface ApprovalResult {
  /** true = delete the row; false = the caller should update() with `patch`. */
  delete: boolean;
  patch?: Partial<ServiceLike>;
}

/** What approving a pending service change does. Mirrors the prototype's
 * reducer exactly so the same rules apply everywhere. */
export function approve(service: ServiceLike): ApprovalResult {
  switch (service.status) {
    case "PENDING_DELETE":
      return { delete: true };
    case "PENDING_EDIT":
      return {
        delete: false,
        patch: {
          price: service.pendingData?.price ?? service.price,
          discountPercent: service.pendingData?.discountPercent ?? service.discountPercent,
          hasPhoto: service.pendingData?.hasPhoto ?? service.hasPhoto,
          status: "ACTIVE",
          pendingData: null,
        },
      };
    case "PENDING_NEW":
      return { delete: false, patch: { status: "ACTIVE" } };
    case "ACTIVE":
    default:
      return { delete: false }; // nothing pending; no-op
  }
}

/** What rejecting a pending service change does — always reverts to
 * whatever was live before, discarding the proposal. A rejected brand-new
 * item is discarded entirely rather than left behind in any status. */
export function reject(service: ServiceLike): ApprovalResult {
  switch (service.status) {
    case "PENDING_NEW":
      return { delete: true };
    case "PENDING_EDIT":
    case "PENDING_DELETE":
      return { delete: false, patch: { status: "ACTIVE", pendingData: null } };
    case "ACTIVE":
    default:
      return { delete: false };
  }
}
