import { newServicePayload, proposeEdit, proposeRemoval, approve, reject, ServiceLike } from "../src/lib/serviceApproval";

describe("newServicePayload", () => {
  it("always starts PENDING_NEW with no pendingData", () => {
    const payload = newServicePayload({ category: "Men", itemName: "Shirt", serviceName: "Dry Clean", price: 100 });
    expect(payload.status).toBe("PENDING_NEW");
    expect(payload.pendingData).toBeNull();
    expect(payload.discountPercent).toBe(0);
    expect(payload.hasPhoto).toBe(false);
  });
});

describe("proposeEdit / proposeRemoval", () => {
  it("proposeEdit stashes changes without touching live values", () => {
    const patch = proposeEdit({ price: 120, discountPercent: 10 });
    expect(patch.status).toBe("PENDING_EDIT");
    expect(patch.pendingData).toEqual({ price: 120, discountPercent: 10 });
  });
  it("proposeRemoval flags for deletion without deleting", () => {
    const patch = proposeRemoval();
    expect(patch.status).toBe("PENDING_DELETE");
  });
});

const base: ServiceLike = { status: "ACTIVE", price: 100, discountPercent: 0, hasPhoto: false, pendingData: null };

describe("approve", () => {
  it("PENDING_NEW -> ACTIVE, values untouched", () => {
    const result = approve({ ...base, status: "PENDING_NEW" });
    expect(result.delete).toBe(false);
    expect(result.patch).toEqual({ status: "ACTIVE" });
  });
  it("PENDING_EDIT merges pendingData into the live fields and clears it", () => {
    const result = approve({ ...base, status: "PENDING_EDIT", pendingData: { price: 150, discountPercent: 20 } });
    expect(result.patch).toEqual({ price: 150, discountPercent: 20, hasPhoto: false, status: "ACTIVE", pendingData: null });
  });
  it("PENDING_EDIT partial pendingData falls back to existing live values", () => {
    const result = approve({ ...base, price: 90, status: "PENDING_EDIT", pendingData: { discountPercent: 5 } });
    expect(result.patch).toEqual({ price: 90, discountPercent: 5, hasPhoto: false, status: "ACTIVE", pendingData: null });
  });
  it("PENDING_DELETE deletes the row", () => {
    const result = approve({ ...base, status: "PENDING_DELETE" });
    expect(result.delete).toBe(true);
  });
  it("ACTIVE is a no-op", () => {
    const result = approve({ ...base, status: "ACTIVE" });
    expect(result.delete).toBe(false);
    expect(result.patch).toBeUndefined();
  });
});

describe("reject", () => {
  it("PENDING_NEW is discarded entirely", () => {
    const result = reject({ ...base, status: "PENDING_NEW" });
    expect(result.delete).toBe(true);
  });
  it("PENDING_EDIT reverts to ACTIVE, discarding the proposal", () => {
    const result = reject({ ...base, status: "PENDING_EDIT", pendingData: { price: 999 } });
    expect(result.delete).toBe(false);
    expect(result.patch).toEqual({ status: "ACTIVE", pendingData: null });
  });
  it("PENDING_DELETE reverts to ACTIVE, cancelling the removal", () => {
    const result = reject({ ...base, status: "PENDING_DELETE" });
    expect(result.patch).toEqual({ status: "ACTIVE", pendingData: null });
  });
});
