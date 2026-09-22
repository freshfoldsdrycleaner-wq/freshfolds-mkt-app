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
const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209 }; // New Delhi, used if geolocation is unavailable/denied

interface DryCleanerSummary {
  id: string; businessName: string; address: string; distanceKm: number;
  estimatedPickupMinutes: number; rating: number | null; reviewCount: number;
  startingPrice: number | null; operatingHours: string | null;
}
interface Service {
  id: string; category: string; itemName: string; serviceName: string;
  price: number; discountPercent: number; effectivePrice: number; hasPhoto: boolean;
}
interface DryCleanerDetail { id: string; businessName: string; address: string; operatingHours: string | null; rating: number | null; services: Service[]; }
interface OrderRow {
  id: string; orderNumber: string; status: string; dryCleanerName: string;
  estimatedTotal: number; finalTotal: number | null; amountPaid: number; balanceDue: number | null; createdAt: string;
}
interface Defect { defectType: string; description: string | null; photoUrl: string | null; }
interface OrderDetail extends OrderRow {
  pickupAddress: string; deliveryAddress: string; preferredPickupAt: string | null;
  items: { itemName: string; serviceName: string; quantity: number; estimatedPrice: number }[];
  defects: Defect[];
  pickupConditionConfirmedAt?: string | null;
}

function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate"; children: React.ReactNode }) {
  return <span className={`ff-badge ff-badge-${tone}`}>{children}</span>;
}
function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "DELIVERED" || status === "CLOSED") return "green";
  if (status === "PAYMENT_PENDING") return "amber";
  if (status === "CANCELLED") return "red";
  return "slate";
}

type Tab = "home" | "orders" | "profile";
type Screen = "list" | "vendor" | "checkout" | "confirmation";

export default function CustomerApp() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<Screen>("list");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<{ name: string | null; phone: string; email: string | null } | null>(null);

  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [vendors, setVendors] = useState<DryCleanerSummary[] | null>(null);
  const [vendor, setVendor] = useState<DryCleanerDetail | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [preferredPickupAt, setPreferredPickupAt] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ orderNumber: string; amountPaid: number; balanceDue: number } | null>(null);

  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [openOrder, setOpenOrder] = useState<OrderDetail | null>(null);

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearToken("customer");
        router.push("/customer/login");
        return true;
      }
      return false;
    },
    [router]
  );

  useEffect(() => {
    if (!getToken("customer")) {
      router.push("/customer/login");
      return;
    }
    setReady(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // keep default on denial/error
      );
    }
  }, [router]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: { name: string | null; phone: string; email: string | null } }>("/api/users/me", "customer");
      setProfile(data.user);
    } catch (e) {
      handleAuthError(e);
    }
  }, [handleAuthError]);

  const loadVendors = useCallback(async () => {
    try {
      const data = await apiFetch<{ dryCleaners: DryCleanerSummary[] }>(
        `/api/drycleaners?lat=${location.lat}&lng=${location.lng}`,
        "customer"
      );
      setVendors(data.dryCleaners);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load nearby dry-cleaners.");
    }
  }, [location, handleAuthError]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: OrderRow[] }>("/api/orders", "customer");
      setOrders(data.orders);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load orders.");
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadProfile();
    loadVendors();
    loadOrders();
  }, [ready, loadProfile, loadVendors, loadOrders]);

  async function openVendor(id: string) {
    setError("");
    try {
      const data = await apiFetch<DryCleanerDetail>(`/api/drycleaners/${id}`, "customer");
      setVendor(data);
      setCart({});
      setPreferredPickupAt("");
      setScreen("vendor");
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load this dry-cleaner.");
    }
  }

  function changeQty(serviceId: string, delta: number) {
    setCart((c) => {
      const next = { ...c, [serviceId]: Math.max(0, (c[serviceId] || 0) + delta) };
      if (!next[serviceId]) delete next[serviceId];
      return next;
    });
  }

  const cartItems = vendor ? Object.entries(cart).map(([id, qty]) => ({ ...vendor.services.find((s) => s.id === id)!, qty })) : [];
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = cartItems.reduce((s, i) => s + i.effectivePrice * i.qty, 0);

  async function placeOrder() {
    if (!vendor || !pickupAddress.trim() || !deliveryAddress.trim()) return;
    setError("");
    setPlacingOrder(true);
    try {
      const data = await apiFetch<{ order: { orderNumber: string; amountPaid: number; balanceDue: number } }>(
        "/api/orders",
        "customer",
        {
          method: "POST",
          body: JSON.stringify({
            dryCleanerId: vendor.id,
            pickupAddress: pickupAddress.trim(),
            deliveryAddress: deliveryAddress.trim(),
            preferredPickupAt: preferredPickupAt ? new Date(preferredPickupAt).toISOString() : undefined,
            items: cartItems.map((i) => ({ serviceId: i.id, quantity: i.qty })),
          }),
        }
      );
      setLastOrder(data.order);
      setScreen("confirmation");
      loadOrders();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to place order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  async function openOrderDetail(id: string) {
    setError("");
    try {
      const data = await apiFetch<{ order: OrderDetail }>(`/api/orders/${id}`, "customer");
      setOpenOrder(data.order);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load order.");
    }
  }
  async function refreshOpenOrder() {
    if (openOrder) openOrderDetail(openOrder.id);
    loadOrders();
  }
  async function confirmCondition() {
    if (!openOrder) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/pickup-confirmation`, "customer", { method: "POST" });
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to confirm.");
    }
  }
  async function payRemaining() {
    if (!openOrder) return;
    try {
      await apiFetch(`/api/orders/${openOrder.id}/payment/final`, "customer", { method: "POST" });
      refreshOpenOrder();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Payment failed.");
    }
  }

  function logout() {
    clearToken("customer");
    router.push("/customer/login");
  }

  if (!ready) return null;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>FF</div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Fresh Fold</span>
          </div>
          {profile?.name && <span style={{ fontSize: 12, color: "#64748b" }}>Hi, {profile.name.split(" ")[0]}</span>}
        </div>
        {error && (
          <div className="ff-card" style={{ padding: 10, marginBottom: 12, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "0 16px 90px" }}>
        {tab === "home" && screen === "list" && (
          <>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>Dry-cleaners near you</p>
            {!vendors ? (
              <p style={{ color: "#94a3b8" }}>Loading…</p>
            ) : vendors.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No approved dry-cleaners within range yet.</p>
            ) : (
              vendors.map((v) => (
                <button key={v.id} onClick={() => openVendor(v.id)} className="ff-card" style={{ width: "100%", textAlign: "left", padding: 14, marginBottom: 10, display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{v.businessName}</span>
                    {v.rating != null && <span style={{ fontSize: 12, color: "#f59e0b" }}>★ {v.rating}</span>}
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0" }}>{v.distanceKm} km • Pickup in {v.estimatedPickupMinutes} mins</p>
                  {v.startingPrice != null && <p style={{ fontSize: 13, color: "#2563eb", fontWeight: 600, margin: 0 }}>From {inr(v.startingPrice)}</p>}
                </button>
              ))
            )}
          </>
        )}

        {tab === "home" && screen === "vendor" && vendor && (
          <>
            <button className="ff-btn ff-btn-outline" style={{ marginBottom: 12 }} onClick={() => setScreen("list")}>← Back</button>
            <h2 style={{ margin: "0 0 2px" }}>{vendor.businessName}</h2>
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>{vendor.address}</p>
            {vendor.services.map((s) => {
              const qty = cart[s.id] || 0;
              return (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{s.itemName}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                      {s.discountPercent > 0 ? (
                        <>
                          <span style={{ textDecoration: "line-through" }}>{inr(s.price)}</span>{" "}
                          <span style={{ color: "#059669" }}>{inr(s.effectivePrice)} ({s.discountPercent}% off)</span>
                        </>
                      ) : inr(s.price)}
                    </p>
                  </div>
                  {qty > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="ff-btn ff-btn-outline" style={{ padding: "4px 10px" }} onClick={() => changeQty(s.id, -1)}>−</button>
                      <span style={{ width: 16, textAlign: "center" }}>{qty}</span>
                      <button className="ff-btn ff-btn-outline" style={{ padding: "4px 10px" }} onClick={() => changeQty(s.id, 1)}>+</button>
                    </div>
                  ) : (
                    <button className="ff-btn ff-btn-outline" onClick={() => changeQty(s.id, 1)}>Add</button>
                  )}
                </div>
              );
            })}
            {cartCount > 0 && (
              <button className="ff-btn ff-btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => setScreen("checkout")}>
                View Cart • {inr(cartSubtotal)}
              </button>
            )}
          </>
        )}

        {tab === "home" && screen === "checkout" && vendor && (
          <>
            <button className="ff-btn ff-btn-outline" style={{ marginBottom: 12 }} onClick={() => setScreen("vendor")}>← Back</button>
            <h2 style={{ margin: "0 0 12px" }}>Order Summary</h2>
            <div className="ff-card" style={{ padding: 14, marginBottom: 12 }}>
              {cartItems.map((i) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{i.itemName} × {i.qty}</span><span>{inr(i.effectivePrice * i.qty)}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Estimated total</span><span>{inr(cartSubtotal)}</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", padding: 8, borderRadius: 8, marginBottom: 12 }}>
              20% is due now as a booking deposit; the rest is charged after pickup inspection confirms the final total.
            </p>
            <label className="ff-label">Pickup address</label>
            <input className="ff-input" style={{ marginBottom: 10 }} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Flat, street, area" />
            <label className="ff-label">Delivery address</label>
            <input className="ff-input" style={{ marginBottom: 10 }} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Same or different address" />
            <label className="ff-label">Preferred pickup time (optional)</label>
            <input
              className="ff-input"
              style={{ marginBottom: 16 }}
              type="datetime-local"
              value={preferredPickupAt}
              min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
              onChange={(e) => setPreferredPickupAt(e.target.value)}
            />
            <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={placingOrder || !pickupAddress.trim() || !deliveryAddress.trim()} onClick={placeOrder}>
              {placingOrder ? "Placing order…" : "Confirm & Pay 20%"}
            </button>
          </>
        )}

        {tab === "home" && screen === "confirmation" && lastOrder && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
            <h2 style={{ margin: "0 0 4px" }}>Order confirmed</h2>
            <p style={{ color: "#94a3b8", marginBottom: 20 }}>{lastOrder.orderNumber}</p>
            <div className="ff-card" style={{ padding: 14, textAlign: "left", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>Paid now (20%)</span><span>{inr(lastOrder.amountPaid)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Balance due</span><span>{inr(lastOrder.balanceDue)}</span></div>
            </div>
            <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} onClick={() => { setTab("orders"); setScreen("list"); setVendor(null); }}>
              Track my order
            </button>
          </div>
        )}

        {tab === "orders" && !openOrder && (
          <>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "12px 0" }}>Your orders</p>
            {!orders ? (
              <p style={{ color: "#94a3b8" }}>Loading…</p>
            ) : orders.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No orders yet — place one from Home.</p>
            ) : (
              orders.map((o) => (
                <button key={o.id} onClick={() => openOrderDetail(o.id)} className="ff-card" style={{ width: "100%", textAlign: "left", padding: 14, marginBottom: 10, display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600 }}>{o.orderNumber}</span>
                    <Badge tone={statusTone(o.status)}>{STAGE_LABELS[o.status] || o.status}</Badge>
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>{o.dryCleanerName} • {inr(o.finalTotal ?? o.estimatedTotal)}</p>
                </button>
              ))
            )}
          </>
        )}

        {tab === "orders" && openOrder && (
          <>
            <button className="ff-btn ff-btn-outline" style={{ margin: "12px 0" }} onClick={() => setOpenOrder(null)}>← Back to orders</button>
            <h2 style={{ margin: "0 0 4px" }}>{openOrder.orderNumber}</h2>
            <p style={{ marginBottom: 8 }}><Badge tone={statusTone(openOrder.status)}>{STAGE_LABELS[openOrder.status] || openOrder.status}</Badge></p>
            {openOrder.preferredPickupAt && (
              <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                Requested pickup: {new Date(openOrder.preferredPickupAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}

            {openOrder.defects.length > 0 && !openOrder.pickupConditionConfirmedAt && (
              <div className="ff-card" style={{ padding: 14, marginBottom: 16, background: "#fffbeb" }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Please review the condition of your clothes</p>
                {openOrder.defects.map((d, i) => (
                  <p key={i} style={{ fontSize: 12, color: "#92400e", margin: "0 0 4px" }}>
                    {d.defectType === "NONE" ? "No defects found" : `${d.defectType}: ${d.description || ""}`}
                  </p>
                ))}
                <button className="ff-btn ff-btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={confirmCondition}>
                  I agree with this condition report
                </button>
              </div>
            )}

            {openOrder.status === "PAYMENT_PENDING" && (
              <div className="ff-card" style={{ padding: 14, marginBottom: 16, background: "#fffbeb" }}>
                <p style={{ fontSize: 13, marginBottom: 8 }}>Your order is ready! Balance due: <strong>{inr(openOrder.balanceDue)}</strong></p>
                <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} onClick={payRemaining}>Pay Remaining {inr(openOrder.balanceDue)}</button>
              </div>
            )}

            <div className="ff-card" style={{ padding: 14, marginBottom: 16 }}>
              {openOrder.items.map((it, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>{it.itemName} ({it.serviceName}) × {it.quantity}</div>
              ))}
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Estimated total</span><span>{inr(openOrder.estimatedTotal)}</span></div>
              {openOrder.finalTotal != null && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#92400e" }}><span>Final total</span><span>{inr(openOrder.finalTotal)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669" }}><span>Paid</span><span>{inr(openOrder.amountPaid)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#dc2626" }}><span>Balance due</span><span>{inr(openOrder.balanceDue)}</span></div>
            </div>

            <p className="ff-label">Order progress</p>
            {STAGES.map((s, i) => {
              const idx = STAGES.indexOf(openOrder.status);
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: i <= idx ? "#2563eb" : "#e2e8f0" }} />
                  <span style={{ fontSize: 12, color: i <= idx ? "#0f172a" : "#94a3b8" }}>{STAGE_LABELS[s]}</span>
                </div>
              );
            })}
          </>
        )}

        {tab === "profile" && profile && (
          <div style={{ paddingTop: 16 }}>
            <h2 style={{ margin: "0 0 4px" }}>{profile.name}</h2>
            <p style={{ color: "#64748b", margin: 0 }}>{profile.phone}</p>
            {profile.email && <p style={{ color: "#64748b", margin: 0 }}>{profile.email}</p>}
            <button className="ff-btn ff-btn-outline" style={{ marginTop: 20 }} onClick={logout}>Log out</button>
          </div>
        )}
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-around", padding: "10px 0" }}>
        {(["home", "orders", "profile"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "home") setScreen("list"); if (t === "orders") setOpenOrder(null); }}
            style={{ background: "none", border: "none", fontWeight: 600, fontSize: 13, textTransform: "capitalize", color: tab === t ? "#2563eb" : "#94a3b8", cursor: "pointer" }}
          >
            {t}
          </button>
        ))}
      </div>
    </main>
  );
}
