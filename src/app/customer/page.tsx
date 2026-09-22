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
      if (!handleAuthError(e))
