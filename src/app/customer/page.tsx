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
  pickupAddress: string; deliveryAddress: string;
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
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastOrder,
