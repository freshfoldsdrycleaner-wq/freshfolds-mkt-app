"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken, ApiError } from "@/lib/apiClient";

const inr = (n: number | null | undefined) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STAGES = [
  "ORDER_PLACED", "PICKUP_ASSIGNED", "PICKUP_IN_PROGRESS", "PICKED_UP",
  "RECEIVED_BY_DRY_CLEANER", "INSPECTION", "PROCESSING", "QUALITY_CHECK",
  "COMPLETED", "PAYMENT_PENDING", "PAYMENT_COMPLETED", "DELIVERY_ASSIGNED",
  "OUT_FOR_DELIVERY", "DELIVERED", "CLOSED",
];
const STAGE_LABELS: Record<string, string> = {
  ORDER_PLACED: "Order Placed", PICKUP_ASSIGNED: "Pickup Assigned", PICKUP_IN_PROGRESS: "Pickup on the Way",
  PICKED_UP: "Clothes Picked Up", RECEIVED_BY_DRY_CLEANER: "Received at Store", INSPECTION: "Inspection",
  PROCESSING: "Dry Cleaning in Progress", QUALITY_CHECK: "Quality Check", COMPLETED: "Dry Cleaning Completed",
  PAYMENT_PENDING: "Payment Pending", PAYMENT_COMPLETED: "Payment Completed", DELIVERY_ASSIGNED: "Delivery Assigned",
  OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", CLOSED: "Closed", CANCELLED: "Cancelled",
};

interface DryCleaner {
  id: string; businessName: string; phone: string; address: string;
  latitude: number; longitude: number; operatingHours: string | null; status: string; createdAt: string;
}
interface Service {
  id: string; category: string; itemName: string; serviceName: string;
  price: number; discountPercent: number; hasPhoto: boolean; status: string;
  pendingData: { price?: number; discountPercent?: number; hasPhoto?: boolean } | null;
}
interface OrderRow {
  id: string; orderNumber: string; status: string; dryCleanerName: string;
  estimatedTotal: number; finalTotal: number | null; amountPaid: number; balanceDue: number | null;
  commissionRate: number; commissionAmount: number | null; dryCleanerNetAmount: number | null; createdAt: string;
}
interface OrderDetail extends OrderRow {
  pickupAddress: string; deliveryAddress: string; preferredPickupAt: string | null;
  items: { itemName: string; serviceName: string; quantity: number; estimatedPrice: number }[];
}

function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate"; children: React.ReactNode }) {
  return <span className={`ff-badge ff-badge-${tone}`}>{children}</span>;
}
function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "ACTIVE" || status === "DELIVERED" || status === "CLOSED") return "green";
  if (status === "PENDING" || status.startsWith("PENDING_")) return "amber";
  if (status === "SUSPENDED" || status === "DEACTIVATED" || status === "CANCELLED") return "red";
  return "slate";
}

type Tab = "overview" | "services" | "orders";

export default function DryCleanDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");

  const [dc, setDc] = useState<DryCleaner | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [services, setServices] = useState<Service[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [openOrder, setOpenOrder] = useState<OrderDetail | null>(null);

  // registration form
  const [regBusiness, setRegBusiness] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regLat, setRegLat] = useState("28.6139");
  const [regLng, setRegLng] = useState("77.2090");
  const [regSubmitting, setRegSubmitting] = useState(false);

  // service form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newServiceName, setNewServiceName] = useState("Dry Clean");
  const [newPrice, setNewPrice] = useState("");
  const [newDiscount, setNewDiscount] = useState("0");
  const [newHasPhoto, setNewHasPhoto] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDiscount, setEditDiscount] = useState("");

  // order detail state
  const [assignPhone, setAssignPhone] = useState("");
  const [finalTotalInput, setFinalTotalInput] = useState("");

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearToken("dryclean");
        router.push("/dryclean/login");
        return true;
      }
      return false;
    },
    [router]
  );

  useEffect(() => {
    if (!getToken("dryclean")) {
      router.push("/dryclean/login");
      return;
    }
    setReady(true);
  }, [router]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ dryCleaner: DryCleaner }>("/api/drycleaners/me", "dryclean");
      setDc(data.dryCleaner);
      setNotRegistered(false);
    } catch (e) {
      if (handleAuthError(e)) return;
      if (e instanceof ApiError && e.status === 404) {
        setNotRegistered(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Failed to load profile.");
      }
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (ready) loadProfile();
  }, [ready, loadProfile]);

  const loadServices = useCallback(async () => {
    if (!dc) return;
    try {
      const data = await apiFetch<{ services: Service[] }>(`/api/drycleaners/${dc.id}/services`, "dryclean");
      setServices(data.services);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load services.");
    }
  }, [dc, handleAuthError]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: OrderRow[] }>("/api/orders", "dryclean");
      setOrders(data.orders);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load orders.");
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!dc) return;
    loadServices();
    loadOrders();
  }, [dc, loadServices, loadOrders]);

  async function submitRegistration() {
    setError("");
    if (!regBusiness.trim() || !regAddress.trim() || !regPhone.trim()) return;
    setRegSubmitting(true);
    try {
      await apiFetch("/api/drycleaners", "dryclean", {
        method: "POST",
        body: JSON.stringify({
          businessName: regBusiness.trim(),
          address: regAddress.trim(),
          phone: regPhone.trim(),
          latitude: Number(regLat),
          longitude: Number(regLng),
        }),
      });
      loadProfile();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Registration failed.");
    } finally {
      setRegSubmitting(false);
    }
  }

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditPrice(String(s.price));
    setEditDiscount(String(s.discountPercent));
  }
  async function submitEdit(s: Service) {
    if (!dc) return;
    try {
      await apiFetch(`/api/drycleaners/${dc.id}/services/${s.id}`, "dryclean", {
        method: "PATCH",
        body: JSON.stringify({ action: "edit", changes: { price: Number(editPrice), discountPercent: Number(editDiscount) } }),
      });
      setEditingId(null);
      loadServices();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to submit edit.");
    }
  }
  async function proposeDelete(s: Service) {
    if (!dc) return;
    try {
      await apiFetch(`/api/drycleaners/${dc.id}/services/${s.id}`, "dryclean", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete" }),
      });
      loadServices();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to propose removal.");
    }
  }
  async function submitNewService() {
    if (!dc || !newCategory.trim() || !newItem.trim() || !newPrice) return;
    try {
      await apiFetch(`/api/drycleaners/${dc.id}/services`, "dryclean", {
        method: "POST",
        body: JSON.stringify({
          category: newCategory.trim(),
          itemName: newItem.trim(),
          serviceName: newServiceName.trim(),
          price: Number(newPrice),
          discountPercent: Number(newDiscount) || 0,
          hasPhoto: newHasPhoto,
        }),
      });
      setNewCategory(""); setNewItem(""); setNewPrice(""); setNewDiscount("0"); setNewHasPhoto(false); setShowAddForm(false);
      loadServices();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to add service.");
    }
  }

  async function openOrderDetail(id: string) {
    setError("");
    try {
      const data = await apiFetch<{ order: OrderDetail }>(`/api/orders/${id}`, "dryclean");
      setOpenOrder(data.order);
      setFinalTotalInput(String(data.order.finalTotal ?? data.order.estimatedTotal));
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load order.");
    }
  }
  async function refreshOpenOrder() {
    if (openOrder) openOrderDetail(openOrder.id);
    loadOrders();
  }
  async function advanceStatus(status: string) {
    if (!openOrder) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/status`, "dryclean", { method: "POST", body: JSON.stringify({ status }) });
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "That transition isn't allowed yet.");
    }
  }
  async function assignDelivery(assignmentType: "PICKUP" | "DELIVERY") {
    if (!openOrder || !assignPhone.trim()) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/assign`, "dryclean", {
        method: "POST",
        body: JSON.stringify({ deliveryPersonPhone: assignPhone.trim(), assignmentType }),
      });
      setAssignPhone("");
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to assign.");
    }
  }
  async function submitFinalPrice() {
    if (!openOrder || !finalTotalInput) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/final-price`, "dryclean", {
        method: "POST",
        body: JSON.stringify({ finalTotal: Number(finalTotalInput) }),
      });
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to update price.");
    }
  }
  async function confirmPayment() {
    if (!openOrder) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/payment/final`, "dryclean", { method: "POST" });
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to confirm payment.");
    }
  }

  function logout() {
    clearToken("dryclean");
    router.push("/dryclean/login");
  }

  if (!ready) return null;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>FF</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{dc ? dc.businessName : "Fresh Fold for Business"}</h1>
        </div>
        <button className="ff-btn ff-btn-outline" onClick={logout}>Log out</button>
      </div>

      {error && (
        <div className="ff-card" style={{ padding: 12, marginBottom: 16, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      {notRegistered ? (
        <div className="ff-card" style={{ padding: 24, maxWidth: 480 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Register your business</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
            Your listing stays hidden from customers until a Fresh Fold admin approves it.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label className="ff-label">Business name</label>
            <input className="ff-input" value={regBusiness} onChange={(e) => setRegBusiness(e.target.value)} placeholder="e.g. Sunshine Dry Cleaners" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="ff-label">Business phone</label>
            <input className="ff-input" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="98xxxxxxxx" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="ff-label">Address</label>
            <input className="ff-input" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} placeholder="Shop address" />
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label className="ff-label">Latitude</label>
              <input className="ff-input" value={regLat} onChange={(e) => setRegLat(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ff-label">Longitude</label>
              <input className="ff-input" value={regLng} onChange={(e) => setRegLng(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
            Tip: right-click your location on Google Maps to copy exact coordinates.
          </p>
          <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={regSubmitting} onClick={submitRegistration}>
            {regSubmitting ? "Submitting…" : "Register"}
          </button>
        </div>
      ) : !dc ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : (
        <>
          {dc.status !== "ACTIVE" && (
            <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#fffbeb", borderColor: "#fde68a" }}>
              <Badge tone={statusTone(dc.status)}>{dc.status}</Badge>{" "}
              <span style={{ fontSize: 13, color: "#92400e" }}>
                {dc.status === "PENDING" ? "Awaiting Fresh Fold admin approval — you won't appear in customer search yet." : "Your account isn't currently active."}
              </span>
            </div>
          )}

          {!openOrder && (
            <div className="ff-tabs">
              {([["overview", "Overview"], ["services", `Services${services ? ` (${services.length})` : ""}`], ["orders", `Orders${orders ? ` (${orders.length})` : ""}`]] as [Tab, string][]).map(([id, label]) => (
                <button key={id} className={`ff-tab ${tab === id ? "ff-tab-active" : ""}`} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
          )}

          {!openOrder && tab === "overview" && (
            <div className="ff-card" style={{ padding: 20 }}>
              <div className="ff-stat-grid">
                <div><div className="ff-stat-label">Status</div><div className="ff-stat-value"><Badge tone={statusTone(dc.status)}>{dc.status}</Badge></div></div>
                <div><div className="ff-stat-label">Phone</div><div className="ff-stat-value" style={{ fontSize: 15 }}>{dc.phone}</div></div>
                <div><div className="ff-stat-label">Address</div><div className="ff-stat-value" style={{ fontSize: 15 }}>{dc.address}</div></div>
                <div><div className="ff-stat-label">Registered</div><div className="ff-stat-value" style={{ fontSize: 15 }}>{new Date(dc.createdAt).toLocaleDateString("en-IN")}</div></div>
              </div>
            </div>
          )}

          {!openOrder && tab === "services" && (
            <div className="ff-card">
              {!services ? (
                <p style={{ padding: 16, color: "#94a3b8" }}>Loading…</p>
              ) : (
                <>
                  <table className="ff-table">
                    <thead><tr><th>Item</th><th>Price</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {services.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.itemName}<div style={{ fontWeight: 400, color: "#94a3b8" }}>{s.category} · {s.serviceName}</div></td>
                          <td>
                            {editingId === s.id ? (
                              <div style={{ display: "flex", gap: 6 }}>
                                <input className="ff-input" style={{ width: 80 }} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                                <input className="ff-input" style={{ width: 70 }} value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} placeholder="%" />
                              </div>
                            ) : (
                              <>{inr(s.price)}{s.discountPercent > 0 && <span style={{ color: "#059669" }}> ({s.discountPercent}% off)</span>}</>
                            )}
                          </td>
                          <td><Badge tone={statusTone(s.status)}>{s.status === "ACTIVE" ? "Live" : s.status.replace("PENDING_", "Pending ")}</Badge></td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {s.status === "ACTIVE" && editingId !== s.id && (
                              <>
                                <button className="ff-btn ff-btn-outline" style={{ marginRight: 6 }} onClick={() => startEdit(s)}>Edit</button>
                                <button className="ff-btn ff-btn-danger" onClick={() => proposeDelete(s)}>Remove</button>
                              </>
                            )}
                            {editingId === s.id && (
                              <>
                                <button className="ff-btn ff-btn-primary" style={{ marginRight: 6 }} onClick={() => submitEdit(s)}>Submit</button>
                                <button className="ff-btn ff-btn-outline" onClick={() => setEditingId(null)}>Cancel</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: 16 }}>
                    {!showAddForm ? (
                      <button className="ff-btn ff-btn-outline" onClick={() => setShowAddForm(true)}>+ Add a service</button>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 480 }}>
                        <input className="ff-input" placeholder="Category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                        <input className="ff-input" placeholder="Item name" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
                        <input className="ff-input" placeholder="Service (e.g. Dry Clean)" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
                        <input className="ff-input" placeholder="Price ₹" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                        <input className="ff-input" placeholder="Discount %" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                          <input type="checkbox" checked={newHasPhoto} onChange={(e) => setNewHasPhoto(e.target.checked)} /> Has photo
                        </label>
                        <button className="ff-btn ff-btn-primary" onClick={submitNewService}>Submit for approval</button>
                        <button className="ff-btn ff-btn-outline" onClick={() => setShowAddForm(false)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!openOrder && tab === "orders" && (
            <div className="ff-card">
              {!orders ? (
                <p style={{ padding: 16, color: "#94a3b8" }}>Loading…</p>
              ) : orders.length === 0 ? (
                <p style={{ padding: 16, color: "#94a3b8" }}>No orders yet.</p>
              ) : (
                <table className="ff-table">
                  <thead><tr><th>Order</th><th>Status</th><th>Value</th><th></th></tr></thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 600 }}>{o.orderNumber}<div style={{ fontWeight: 400, color: "#94a3b8" }}>{new Date(o.createdAt).toLocaleDateString("en-IN")}</div></td>
                        <td><Badge tone={statusTone(o.status)}>{STAGE_LABELS[o.status] || o.status}</Badge></td>
                        <td>{inr(o.finalTotal ?? o.estimatedTotal)}</td>
                        <td style={{ textAlign: "right" }}><button className="ff-btn ff-btn-outline" onClick={() => openOrderDetail(o.id)}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {openOrder && (
            <div className="ff-card" style={{ padding: 20 }}>
              <button className="ff-btn ff-btn-outline" style={{ marginBottom: 16 }} onClick={() => setOpenOrder(null)}>← Back to orders</button>
              <h2 style={{ margin: "0 0 4px" }}>{openOrder.orderNumber}</h2>
              <p style={{ color: "#94a3b8", marginBottom: 16 }}><Badge tone={statusTone(openOrder.status)}>{STAGE_LABELS[openOrder.status] || openOrder.status}</Badge></p>

              <div style={{ marginBottom: 16 }}>
                <p className="ff-label">Items</p>
                {openOrder.items.map((it, i) => (
                  <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>{it.itemName} ({it.serviceName}) × {it.quantity} — {inr(it.estimatedPrice)}</div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <p className="ff-label">Pickup address</p>
                <p style={{ fontSize: 13 }}>{openOrder.pickupAddress}</p>
                {openOrder.preferredPickupAt && (
                  <p style={{ fontSize: 13, color: "#92400e", marginTop: 4 }}>
                    Customer requested: {new Date(openOrder.preferredPickupAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </div>

              {(openOrder.status === "ORDER_PLACED" || openOrder.status === "PAYMENT_COMPLETED") && (
                <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#f8fafc" }}>
                  <p className="ff-label">{openOrder.status === "ORDER_PLACED" ? "Assign pickup" : "Assign delivery"}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="ff-input" placeholder="Delivery staff phone" value={assignPhone} onChange={(e) => setAssignPhone(e.target.value)} />
                    <button className="ff-btn ff-btn-primary" onClick={() => assignDelivery(openOrder.status === "ORDER_PLACED" ? "PICKUP" : "DELIVERY")}>Assign</button>
                  </div>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>The delivery staff must already have a Fresh Fold account (registered via phone OTP).</p>
                </div>
              )}

              {openOrder.status === "PICKUP_IN_PROGRESS" && (
                <p style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", padding: 10, borderRadius: 8, marginBottom: 16 }}>
                  Waiting on the delivery app: pickup photos, a condition report, and the customer's sign-off are required before this can move to &quot;Clothes Picked Up&quot;.
                </p>
              )}

              {openOrder.status === "PAYMENT_PENDING" && (
                <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#fffbeb" }}>
                  <p style={{ fontSize: 13, marginBottom: 8 }}>Balance due: <strong>{inr(openOrder.balanceDue)}</strong></p>
                  <button className="ff-btn ff-btn-primary" onClick={confirmPayment}>Confirm Payment Received</button>
                </div>
              )}

              {!["ORDER_PLACED", "PICKUP_IN_PROGRESS", "PAYMENT_PENDING", "CLOSED", "CANCELLED"].includes(openOrder.status) && (
                (() => {
                  const idx = STAGES.indexOf(openOrder.status);
                  const next = STAGES[idx + 1];
                  return next && next !== "DELIVERY_ASSIGNED" ? (
                    <button className="ff-btn ff-btn-primary" style={{ marginBottom: 16 }} onClick={() => advanceStatus(next)}>
                      Mark as: {STAGE_LABELS[next]}
                    </button>
                  ) : null;
                })()
              )}

              <div style={{ marginBottom: 16 }}>
                <p className="ff-label">Post-inspection price correction</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="ff-input" value={finalTotalInput} onChange={(e) => setFinalTotalInput(e.target.value)} type="number" />
                  <button className="ff-btn ff-btn-outline" onClick={submitFinalPrice}>Update</button>
                </div>
              </div>

              <div className="ff-card" style={{ padding: 12, background: "#f8fafc" }}>
                <p className="ff-label">Your economics</p>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Gross order value</span><span>{inr(openOrder.finalTotal ?? openOrder.estimatedTotal)}</span>
                </div>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#dc2626" }}>
                  <span>Fresh Fold commission ({openOrder.commissionRate}%)</span><span>− {inr(openOrder.commissionAmount)}</span>
                </div>
                <div style={{ fontSize: 14, display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#059669" }}>
                  <span>Your net payout</span><span>{inr(openOrder.dryCleanerNetAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
