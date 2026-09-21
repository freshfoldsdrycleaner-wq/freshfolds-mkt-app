"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getToken, clearToken, ApiError } from "@/lib/apiClient";

const inr = (n: number | null | undefined) =>
  n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type Tab = "overview" | "drycleaners" | "services" | "ledger";

interface Stats {
  totalCustomers: number;
  totalDryCleaners: number;
  dryCleanersByStatus: Record<string, number>;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingServiceChanges: number;
  grossOrderValue: number;
  totalCommission: number;
  dryCleanerEarnings: number;
  customerPaymentsCollected: number;
  pendingCustomerPayments: number;
}
interface DryCleaner {
  id: string;
  businessName: string;
  address: string;
  status: string;
  ownerName: string | null;
  ownerPhone: string;
  createdAt: string;
}
interface PendingService {
  id: string;
  dryCleanerId: string;
  dryCleanerName: string;
  itemName: string;
  category: string;
  price: number;
  discountPercent: number;
  hasPhoto: boolean;
  status: string;
  pendingData: { price?: number; discountPercent?: number; hasPhoto?: boolean } | null;
}
interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  dryCleanerName: string;
  estimatedTotal: number;
  finalTotal: number | null;
  amountPaid: number;
  balanceDue: number | null;
  commissionRate: number;
  commissionAmount: number | null;
  dryCleanerNetAmount: number | null;
  settlementStatus: string;
  createdAt: string;
}

function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate" | "blue"; children: React.ReactNode }) {
  return <span className={`ff-badge ff-badge-${tone}`}>{children}</span>;
}

function statusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "ACTIVE" || status === "SETTLED") return "green";
  if (status === "PENDING" || status === "PARTIALLY_SETTLED" || status.startsWith("PENDING_")) return "amber";
  if (status === "SUSPENDED" || status === "DEACTIVATED" || status === "CANCELLED") return "red";
  return "slate";
}

export default function AdminDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);
  const [dryCleaners, setDryCleaners] = useState<DryCleaner[] | null>(null);
  const [pendingServices, setPendingServices] = useState<PendingService[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        clearToken("admin");
        router.push("/admin/login");
        return true;
      }
      return false;
    },
    [router]
  );

  useEffect(() => {
    if (!getToken("admin")) {
      router.push("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await apiFetch<Stats>("/api/admin/stats", "admin"));
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load stats.");
    }
  }, [handleAuthError]);

  const loadDryCleaners = useCallback(async () => {
    try {
      const data = await apiFetch<{ dryCleaners: DryCleaner[] }>("/api/admin/drycleaners", "admin");
      setDryCleaners(data.dryCleaners);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load dry-cleaners.");
    }
  }, [handleAuthError]);

  const loadPendingServices = useCallback(async () => {
    try {
      const data = await apiFetch<{ services: PendingService[] }>("/api/admin/services", "admin");
      setPendingServices(data.services);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load pending services.");
    }
  }, [handleAuthError]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: OrderRow[] }>("/api/orders", "admin");
      setOrders(data.orders);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to load orders.");
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadStats();
    loadDryCleaners();
    loadPendingServices();
    loadOrders();
  }, [ready, loadStats, loadDryCleaners, loadPendingServices, loadOrders]);

  async function setDryCleanerStatus(id: string, status: string) {
    setError("");
    try {
      await apiFetch(`/api/admin/drycleaners/${id}/status`, "admin", { method: "POST", body: JSON.stringify({ status }) });
      loadDryCleaners();
      loadStats();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to update status.");
    }
  }

  async function resolveService(id: string, action: "approve" | "reject") {
    setError("");
    try {
      await apiFetch(`/api/admin/services/${id}`, "admin", { method: "POST", body: JSON.stringify({ action }) });
      loadPendingServices();
      loadStats();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to resolve service change.");
    }
  }

  async function setSettlement(orderId: string, settlementStatus: string) {
    setError("");
    try {
      await apiFetch(`/api/orders/${orderId}/settlement`, "admin", { method: "POST", body: JSON.stringify({ settlementStatus }) });
      loadOrders();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof ApiError ? e.message : "Failed to update settlement.");
    }
  }

  function logout() {
    clearToken("admin");
    router.push("/admin/login");
  }

  if (!ready) return null;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
            FF
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Fresh Fold Admin</h1>
        </div>
        <button className="ff-btn ff-btn-outline" onClick={logout}>Log out</button>
      </div>

      {error && (
        <div className="ff-card" style={{ padding: 12, marginBottom: 16, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="ff-tabs">
        {([
          ["overview", "Overview"],
          ["drycleaners", "Dry-Cleaners" + (stats ? ` (${stats.dryCleanersByStatus.PENDING || 0} pending)` : "")],
          ["services", "Service Changes" + (stats ? ` (${stats.pendingServiceChanges})` : "")],
          ["ledger", "Ledger"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={`ff-tab ${tab === id ? "ff-tab-active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section>
          {!stats ? (
            <p style={{ color: "#94a3b8" }}>Loading…</p>
          ) : (
            <>
              <div className="ff-stat-grid" style={{ marginBottom: 24 }}>
                {[
                  ["Gross Order Value", inr(stats.grossOrderValue)],
                  ["Fresh Fold Commission", inr(stats.totalCommission)],
                  ["Dry-Cleaner Earnings", inr(stats.dryCleanerEarnings)],
                  ["Customer Payments Collected", inr(stats.customerPaymentsCollected)],
                  ["Pending Customer Payments", inr(stats.pendingCustomerPayments)],
                ].map(([label, value]) => (
                  <div key={label} className="ff-card" style={{ padding: 16 }}>
                    <div className="ff-stat-label">{label}</div>
                    <div className="ff-stat-value">{value}</div>
                  </div>
                ))}
              </div>
              <div className="ff-stat-grid">
                {[
                  ["Total Customers", stats.totalCustomers],
                  ["Total Dry-Cleaners", stats.totalDryCleaners],
                  ["Active Orders", stats.activeOrders],
                  ["Completed Orders", stats.completedOrders],
                  ["Cancelled Orders", stats.cancelledOrders],
                ].map(([label, value]) => (
                  <div key={label} className="ff-card" style={{ padding: 16 }}>
                    <div className="ff-stat-label">{label}</div>
                    <div className="ff-stat-value">{value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {tab === "drycleaners" && (
        <section className="ff-card">
          {!dryCleaners ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>Loading…</p>
          ) : dryCleaners.length === 0 ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>No dry-cleaners registered yet.</p>
          ) : (
            <table className="ff-table">
              <thead>
                <tr><th>Business</th><th>Owner</th><th>Status</th><th>Registered</th><th></th></tr>
              </thead>
              <tbody>
                {dryCleaners.map((dc) => (
                  <tr key={dc.id}>
                    <td><div style={{ fontWeight: 600 }}>{dc.businessName}</div><div style={{ color: "#94a3b8" }}>{dc.address}</div></td>
                    <td>{dc.ownerName || "—"}<div style={{ color: "#94a3b8" }}>{dc.ownerPhone}</div></td>
                    <td><Badge tone={statusTone(dc.status)}>{dc.status}</Badge></td>
                    <td style={{ color: "#94a3b8" }}>{new Date(dc.createdAt).toLocaleDateString("en-IN")}</td>
                    <td style={{ textAlign: "right" }}>
                      {dc.status === "PENDING" && (
                        <button className="ff-btn ff-btn-primary" onClick={() => setDryCleanerStatus(dc.id, "ACTIVE")}>Approve</button>
                      )}
                      {dc.status === "ACTIVE" && (
                        <button className="ff-btn ff-btn-danger" onClick={() => setDryCleanerStatus(dc.id, "SUSPENDED")}>Suspend</button>
                      )}
                      {(dc.status === "SUSPENDED" || dc.status === "DEACTIVATED") && (
                        <button className="ff-btn ff-btn-outline" onClick={() => setDryCleanerStatus(dc.id, "ACTIVE")}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "services" && (
        <section className="ff-card">
          {!pendingServices ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>Loading…</p>
          ) : pendingServices.length === 0 ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>No pending price, discount, or catalog changes.</p>
          ) : (
            <table className="ff-table">
              <thead>
                <tr><th>Item</th><th>Dry-Cleaner</th><th>Change</th><th></th></tr>
              </thead>
              <tbody>
                {pendingServices.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.itemName}<div style={{ fontWeight: 400, color: "#94a3b8" }}>{s.category}</div></td>
                    <td>{s.dryCleanerName}</td>
                    <td>
                      {s.status === "PENDING_NEW" && <>New service · {inr(s.price)}{s.discountPercent > 0 && ` (${s.discountPercent}% off)`}{s.hasPhoto && " · photo attached"}</>}
                      {s.status === "PENDING_EDIT" && (
                        <>Price/discount change · {inr(s.price)}{s.discountPercent > 0 && ` (${s.discountPercent}% off)`} → {inr(s.pendingData?.price ?? s.price)}{(s.pendingData?.discountPercent ?? 0) > 0 && ` (${s.pendingData?.discountPercent}% off)`}</>
                      )}
                      {s.status === "PENDING_DELETE" && <>Requesting removal</>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="ff-btn ff-btn-primary" style={{ marginRight: 6 }} onClick={() => resolveService(s.id, "approve")}>Approve</button>
                      <button className="ff-btn ff-btn-outline" onClick={() => resolveService(s.id, "reject")}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "ledger" && (
        <section className="ff-card">
          {!orders ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>Loading…</p>
          ) : orders.length === 0 ? (
            <p style={{ padding: 16, color: "#94a3b8" }}>No orders yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="ff-table">
                <thead>
                  <tr>
                    <th>Order</th><th>Dry-Cleaner</th><th>Status</th><th>Rate</th>
                    <th>Commission</th><th>Net to Vendor</th><th>Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.orderNumber}<div style={{ fontWeight: 400, color: "#94a3b8" }}>{new Date(o.createdAt).toLocaleDateString("en-IN")}</div></td>
                      <td>{o.dryCleanerName}</td>
                      <td><Badge tone={statusTone(o.status)}>{o.status.replaceAll("_", " ")}</Badge></td>
                      <td>{o.commissionRate}%</td>
                      <td>{inr(o.commissionAmount)}</td>
                      <td>{inr(o.dryCleanerNetAmount)}</td>
                      <td>
                        <select
                          className="ff-input"
                          style={{ padding: "4px 8px", width: "auto" }}
                          value={o.settlementStatus}
                          onChange={(e) => setSettlement(o.id, e.target.value)}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="PARTIALLY_SETTLED">Partially Settled</option>
                          <option value="SETTLED">Settled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
