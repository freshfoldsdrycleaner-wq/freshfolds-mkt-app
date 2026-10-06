"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken, ApiError } from "@/lib/apiClient";
import OrderEditCard from "@/components/OrderEditCard";
import { RateOrder, ReviewsList } from "@/components/Reviews";
import OrderPhotos from "@/components/OrderPhotos";
import PushSetup from "@/components/PushSetup";
import ClaimPaid from "@/components/ClaimPaid";
import { FF_UPI_ID, upiLink } from "@/lib/upi";

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
  pickupAddress: string; deliveryAddress: string; contactName?: string | null; contactPhone?: string | null; preferredPickupAt: string | null;
  couponCode?: string | null; discountAmount?: number;
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
  const [maxKm, setMaxKm] = useState(15);
  const [areaLabel, setAreaLabel] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaMsg, setAreaMsg] = useState("");
  const [vendors, setVendors] = useState<DryCleanerSummary[] | null>(null);
  const [vendor, setVendor] = useState<DryCleanerDetail | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [preferredPickupAt, setPreferredPickupAt] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [offers, setOffers] = useState<{ code: string; title: string; detail: string }[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountAmount: number; label: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [forOther, setForOther] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [lastOrder, setLastOrder] = useState<{ id: string; orderNumber: string; amountPaid: number; balanceDue: number } | null>(null);

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
        `/api/drycleaners?lat=${location.lat}&lng=${location.lng}&maxKm=${maxKm}`,
        "customer"
      );
      setVendors(data.dryCleaners);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load nearby dry-cleaners.");
    }
  }, [location, maxKm, handleAuthError]);

  useEffect(() => {
    apiFetch<{ offers: { code: string; title: string; detail: string }[] }>("/api/coupons/available", "customer")
      .then((d) => setOffers(d.offers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (screen === "checkout" && couponInput.trim() && !coupon) applyCoupon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  async function searchArea() {
    const q = areaQuery.trim();
    if (q.length < 3) {
      setAreaMsg("Type an area and city, e.g. Saket, Delhi");
      return;
    }
    setAreaMsg("Searching…");
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=" + encodeURIComponent(q)
      );
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        setAreaMsg("Could not find that place. Try adding the city name, or use Show all.");
        return;
      }
      setLocation({ lat: Number(arr[0].lat), lng: Number(arr[0].lon) });
      setMaxKm(15);
      setAreaLabel(q);
      setVendors(null);
      setAreaMsg("");
    } catch {
      setAreaMsg("Search failed. Check your internet or use Show all.");
    }
  }

  function showAllAreas() {
    setMaxKm(5000);
    setAreaLabel("all areas");
    setAreaMsg("");
    setVendors(null);
  }

  function useMyLocationForList() {
    if (!navigator.geolocation) {
      setAreaMsg("Location is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMaxKm(15);
        setAreaLabel("");
        setAreaMsg("");
        setVendors(null);
      },
      () => setAreaMsg("Could not get your location. Allow location in Chrome settings.")
    );
  }

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

  async function applyCoupon(codeOverride?: string) {
    const codeToUse = (codeOverride ?? couponInput).trim();
    if (!codeToUse) return;
    if (codeOverride) setCouponInput(codeOverride);
    setCouponMsg("");
    try {
      const data = await apiFetch<{ code: string; discountAmount: number; label: string }>(
        "/api/coupons/validate",
        "customer",
        { method: "POST", body: JSON.stringify({ code: codeToUse, subtotal: cartSubtotal }) }
      );
      setCoupon(data);
    } catch (e) {
      setCoupon(null);
      if (!handleAuthError(e)) setCouponMsg(e instanceof ApiError ? e.message : "Could not check the code.");
    }
  }

  function shareMyLocation() {
    setLocMsg("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocMsg("Your phone or browser does not support sharing location. Please type your address instead.");
      return;
    }
    setLocMsg("Getting your location…");
    const onPos = (pos: GeolocationPosition) => {
      const link = "https://maps.google.com/?q=" + pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
      setPickupAddress((prev) => {
        const base = prev.replace(/\s*\|?\s*(My )?[Ll]ocation: ?https?:\/\/\S+/g, "").trim();
        return base ? base + " | Location: " + link : "Location: " + link;
      });
      setLocMsg("✓ Location added to your pickup address.");
    };
    const onFail = (err: GeolocationPositionError) => {
      if (err.code === 1) {
        setLocMsg(
          "Location is blocked. In Chrome tap the lock icon next to the address bar, choose Permissions or Site settings, set Location to Allow, then reload. Or switch on Location in your phone settings. You can also just type your address."
        );
      } else {
        setLocMsg("Could not find your location. Switch on GPS / Location on your phone and try again, or type your address.");
      }
    };
    navigator.geolocation.getCurrentPosition(
      onPos,
      (err) => {
        if (err.code === 1) return onFail(err);
        // second try with a quicker, less precise fix (works better indoors)
        navigator.geolocation.getCurrentPosition(onPos, onFail, { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function placeOrder() {
    if (!vendor || !pickupAddress.trim() || !deliveryAddress.trim()) return;
    if (forOther && (!contactName.trim() || contactPhone.replace(/\D/g, "").length < 10)) {
      setError("Enter the name and a 10-digit phone number of the person at the pickup address.");
      return;
    }
    setError("");
    setPlacingOrder(true);
    try {
      const data = await apiFetch<{ order: { id: string; orderNumber: string; amountPaid: number; balanceDue: number } }>(
        "/api/orders",
        "customer",
        {
          method: "POST",
          body: JSON.stringify({
            dryCleanerId: vendor.id,
            pickupAddress: pickupAddress.trim(),
            deliveryAddress: deliveryAddress.trim(),
            contactName: forOther ? contactName.trim() : undefined,
            contactPhone: forOther ? contactPhone.trim() : undefined,
            couponCode: coupon ? coupon.code : undefined,
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

  function logout() {
    clearToken("customer");
    router.push("/customer/login");
  }

  if (!ready) return null;

  return (
    <main className="cx" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0 16px" }}>
        <div className="cx-hero">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="cx-logo">FF</div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Fresh Folds</span>
            </div>
            {profile?.name && <span style={{ fontSize: 12, color: "#c9ecee" }}>Hi, {profile.name.split(" ")[0]}</span>}
          </div>
          <h1>Clothes picked up. Cleaned. Back at your door.</h1>
          <p>Book a trusted dry-cleaner near you in a minute.</p>
          <div className="cx-perks">
            <span className="cx-perk">Free pickup &amp; delivery</span>
            <span className="cx-perk">Photos at pickup</span>
            <span className="cx-perk">Rated by customers</span>
          </div>
        </div>
        <PushSetup app="customer" />
        {error && (
          <div className="ff-card" style={{ padding: 10, marginBottom: 12, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "0 16px 90px" }}>
        {tab === "home" && screen === "list" && (
          <>
            {offers.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 8px" }}>Offers for you</p>
                <div className="cx-perks" style={{ marginTop: 0 }}>
                  {offers.map((o) => (
                    <button key={o.code} className="cx-offer" onClick={() => setCouponInput(o.code)}>
                      <strong>{o.title}</strong>
                      <span>{o.detail || "No minimum order"}</span>
                      <em>{couponInput === o.code ? "Saved. Applies at checkout" : "Code " + o.code + " · tap to use"}</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px" }}>
              {areaLabel === "all areas" ? "Dry-cleaners in all areas" : areaLabel ? "Dry-cleaners near " + areaLabel : "Dry-cleaners near you"}
            </p>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                className="ff-input"
                style={{ flex: 1 }}
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                placeholder="Another area, e.g. Saket, Delhi"
              />
              <button className="ff-btn ff-btn-primary" onClick={searchArea}>Search</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button className="ff-btn ff-btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={useMyLocationForList}>📍 My location</button>
              <button className="ff-btn ff-btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={showAllAreas}>Show all</button>
            </div>
            {areaMsg && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{areaMsg}</p>}
            <div style={{ height: 4 }} />
            {!vendors ? (
              <>{[0, 1, 2].map((k) => <div key={k} className="cx-skel" style={{ height: 86, marginBottom: 10 }} />)}</>
            ) : vendors.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No approved dry-cleaners within range yet.</p>
            ) : (
              vendors.map((v) => (
                <button key={v.id} onClick={() => openVendor(v.id)} className="ff-card" style={{ width: "100%", textAlign: "left", padding: 14, marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="cx-avatar">{(v.businessName || "?").trim().charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{v.businessName}</span>
                      {v.rating != null && <span className="cx-rate">★ {v.rating}{v.reviewCount ? ` (${v.reviewCount})` : ""}</span>}
                    </div>
                    <p style={{ fontSize: 12, color: "#4b6b7a", margin: "4px 0" }}>{v.distanceKm} km away · Pickup in {v.estimatedPickupMinutes} mins</p>
                    {v.startingPrice != null && <p style={{ fontSize: 13, color: "#0a6f7a", fontWeight: 700, margin: 0 }}>From {inr(v.startingPrice)}</p>}
                  </div>
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
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{s.itemName} <span style={{ fontWeight: 400, color: "#64748b" }}>({s.serviceName})</span></p>
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
            <ReviewsList dryCleanerId={vendor.id} app="customer" />
          </>
        )}

        {tab === "home" && screen === "checkout" && vendor && (
          <>
            <button className="ff-btn ff-btn-outline" style={{ marginBottom: 12 }} onClick={() => { setCoupon(null); setCouponMsg(""); setScreen("vendor"); }}>← Back</button>
            <h2 style={{ margin: "0 0 12px" }}>Order Summary</h2>
            <div className="ff-card" style={{ padding: 14, marginBottom: 12 }}>
              {cartItems.map((i) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{i.itemName} ({i.serviceName}) × {i.qty}</span><span>{inr(i.effectivePrice * i.qty)}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              {coupon && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669", marginBottom: 4 }}>
                  <span>Offer {coupon.code} ({coupon.label})</span><span>− {inr(coupon.discountAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Estimated total</span><span>{inr(coupon ? cartSubtotal - coupon.discountAmount : cartSubtotal)}</span>
              </div>
            </div>
            {offers.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <label className="ff-label">Available offers</label>
                {offers.map((o) => (
                  <button key={o.code} onClick={() => applyCoupon(o.code)} className="ff-card" style={{ width: "100%", textAlign: "left", padding: 10, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderStyle: "dashed", borderColor: coupon?.code === o.code ? "#0e8f9c" : undefined }}>
                    <span>
                      <strong style={{ fontSize: 13 }}>{o.title}</strong>
                      <span style={{ display: "block", fontSize: 11, color: "#4b6b7a" }}>{o.detail || "No minimum order"} · {o.code}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0a6f7a" }}>{coupon?.code === o.code ? "Applied" : "Apply"}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="ff-label">Offer code (optional)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              <input className="ff-input" value={couponInput} onChange={(e) => { setCouponInput(e.target.value); setCoupon(null); }} placeholder="Enter code" />
              <button className="ff-btn ff-btn-outline" onClick={() => applyCoupon()}>Apply</button>
            </div>
            {couponMsg && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{couponMsg}</p>}
            {coupon && <p style={{ fontSize: 12, color: "#059669", marginBottom: 8 }}>Offer applied. You save {inr(coupon.discountAmount)}.</p>}
            <div style={{ height: 8 }} />
            <p style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", padding: 8, borderRadius: 8, marginBottom: 12 }}>
              After you place the order you will pay a 20% advance to Fresh Folds by UPI. The balance is paid once your clothes are ready.
            </p>
            <label className="ff-label">Pickup address</label>
            <input className="ff-input" style={{ marginBottom: 6 }} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Flat, street, area" />
            <button className="ff-btn ff-btn-outline" style={{ width: "100%", marginBottom: 6 }} onClick={shareMyLocation}>📍 Share my current location</button>
            {locMsg && <p style={{ fontSize: 12, color: locMsg.startsWith("✓") ? "#059669" : locMsg.startsWith("Getting") ? "#64748b" : "#b91c1c", marginBottom: 10 }}>{locMsg}</p>}
            {!locMsg && <div style={{ height: 4 }} />}
            <label className="ff-label">Delivery address</label>
            <input className="ff-input" style={{ marginBottom: 10 }} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Same or different address" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
              <input type="checkbox" checked={forOther} onChange={(e) => setForOther(e.target.checked)} />
              This order is for someone else (e.g. a relative in another city)
            </label>
            {forOther && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  Type their pickup and delivery address above. The dry-cleaner will call this person for pickup and delivery.
                </p>
                <input className="ff-input" style={{ marginBottom: 6 }} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact person's name" />
                <input className="ff-input" type="tel" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Contact person's phone" />
              </div>
            )}
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
              {placingOrder ? "Placing order…" : "Confirm order"}
            </button>
          </>
        )}

        {tab === "home" && screen === "confirmation" && lastOrder && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
            <h2 style={{ margin: "0 0 4px" }}>Order confirmed</h2>
            <p style={{ color: "#94a3b8", marginBottom: 20 }}>{lastOrder.orderNumber}</p>
            {lastOrder.amountPaid <= 0 && lastOrder.balanceDue > 0 && (
              <div className="ff-card" style={{ padding: 14, textAlign: "left", marginBottom: 16, background: "#eff6ff" }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>Pay your 20% advance: {inr(Math.round(lastOrder.balanceDue * 0.2))}</p>
                <p style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
                  Pay to Fresh Folds now, or at pickup. Show the payment-success screen to the dry-cleaner. The rest is paid after your clothes are ready.
                </p>
                <a
                  className="ff-btn ff-btn-primary"
                  style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 8 }}
                  href={upiLink(Math.round(lastOrder.balanceDue * 0.2), "Advance " + lastOrder.orderNumber)}
                >
                  Pay {inr(Math.round(lastOrder.balanceDue * 0.2))} with UPI app
                </a>
                <p style={{ fontSize: 12, color: "#475569", textAlign: "center", marginBottom: 6 }}>
                  or scan with any UPI app · UPI ID: <b>{FF_UPI_ID}</b>
                </p>
                <div style={{ textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/freshfolds-upi-qr.png" alt="Fresh Folds UPI QR" style={{ width: 150, height: 150 }} />
                </div>
                <p style={{ fontSize: 11, color: "#64748b", marginTop: 6, marginBottom: 10 }}>
                  Add the order number {lastOrder.orderNumber} in the payment note if your app allows.
                </p>
                <ClaimPaid orderId={lastOrder.id} />
              </div>
            )}
            <div className="ff-card" style={{ padding: 14, textAlign: "left", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span>Paid so far</span><span>{inr(lastOrder.amountPaid)}</span></div>
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
              <>{[0, 1].map((k) => <div key={k} className="cx-skel" style={{ height: 64, marginBottom: 10 }} />)}</>
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

            {openOrder.status === "ORDER_PLACED" && (
              <OrderEditCard orderId={openOrder.id} app="customer" allowEdit onDone={refreshOpenOrder} />
            )}

            {openOrder.contactName && (
              <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                Pickup contact: {openOrder.contactName}{openOrder.contactPhone ? " · " + openOrder.contactPhone : ""}
              </p>
            )}

            {(openOrder.status === "DELIVERED" || openOrder.status === "CLOSED") && <RateOrder orderId={openOrder.id} />}

            <OrderPhotos orderId={openOrder.id} app="customer" />

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
                <p style={{ fontSize: 12, color: "#92400e" }}>Please pay the dry-cleaner directly (cash or UPI). They will confirm your payment in the app.</p>
              </div>
            )}

            <div className="ff-card" style={{ padding: 14, marginBottom: 16 }}>
              {openOrder.items.map((it, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>{it.itemName} ({it.serviceName}) × {it.quantity}</div>
              ))}
              <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
              {openOrder.couponCode && Number(openOrder.discountAmount || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669" }}><span>Offer {openOrder.couponCode} applied</span><span>− {inr(openOrder.discountAmount)}</span></div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Estimated total</span><span>{inr(openOrder.estimatedTotal)}</span></div>
              {openOrder.finalTotal != null && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#92400e" }}><span>Final total</span><span>{inr(openOrder.finalTotal)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669" }}><span>Paid</span><span>{inr(openOrder.amountPaid)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#dc2626" }}><span>Balance due</span><span>{inr(openOrder.balanceDue)}</span></div>
            </div>

            <p className="ff-label">Order progress</p>
            {(() => {
              const idx = STAGES.indexOf(openOrder.status);
              const phases = [["Pickup", 3], ["Cleaning", 8], ["Payment", 10], ["Delivery", 14]] as [string, number][];
              return (
                <>
                  <div className="cx-phases">
                    {phases.map(([label, last], k) => {
                      const start = k === 0 ? 0 : phases[k - 1][1] + 1;
                      return <div key={label} className={`cx-phase ${idx >= start ? "on" : ""}`}><i />{label}</div>;
                    })}
                  </div>
                  <div className="ff-card" style={{ padding: 14 }}>
                    {STAGES.map((st, i) => (
                      <div key={st} className={`cx-step ${i < idx ? "done" : i === idx ? "now" : ""}`}>
                        <div className="cx-dot" />
                        <span style={{ fontSize: 13, fontWeight: i === idx ? 700 : 500, color: i <= idx ? "#0b2a3c" : "#7b97a3" }}>{STAGE_LABELS[st]}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
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

      <div className="cx-nav">
        {([["home", "Home", "🏠"], ["orders", "Orders", "🧺"], ["profile", "Profile", "👤"]] as [Tab, string, string][]).map(([t, label, icon]) => (
          <button
            key={t}
            className={tab === t ? "on" : ""}
            onClick={() => { setTab(t); if (t === "home") setScreen("list"); if (t === "orders") setOpenOrder(null); }}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </main>
  );
}