"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer: { name: string | null; phone: string; email: string | null };
  dryCleaner: { name: string; phone: string | null };
  pickupAddress: string;
  deliveryAddress: string;
  contactName: string | null;
  contactPhone: string | null;
  preferredPickupAt: string | null;
  estimatedTotal: number;
  finalTotal: number | null;
  couponCode: string | null;
  discountAmount: number;
  amountPaid: number;
  balanceDue: number | null;
  commissionAmount: number | null;
  advanceClaimedAt: string | null;
  photos: number;
  items: { itemName: string; serviceName: string; quantity: number; estimatedPrice: number }[];
  payments: { amount: number; type: string; status: string; via: string; at: string }[];
}

interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  joinedAt: string;
  orders: number;
  spent: number;
  lastOrderAt: string | null;
}

const inr = (n: number | null | undefined) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const when = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";
const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const wa = (p: string) => "https://wa.me/" + (p.replace(/\D/g, "").length === 10 ? "91" : "") + p.replace(/\D/g, "");

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 3 }}>
      <span style={{ color: "#64748b" }}>{k}</span>
      <span style={{ textAlign: "right", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

export default function AllOrdersAdmin() {
  const [view, setView] = useState<"orders" | "customers">("orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setMsg("");
    try {
      const [o, c] = await Promise.all([
        apiFetch<{ orders: Order[] }>("/api/admin/orders", "admin"),
        apiFetch<{ customers: Customer[] }>("/api/admin/customers", "admin"),
      ]);
      setOrders(o.orders);
      setCustomers(c.customers);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shownOrders = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (orders || []).filter((o) => {
      if (status !== "ALL" && o.status !== status) return false;
      if (!t) return true;
      return [o.orderNumber, o.customer.name, o.customer.phone, o.customer.email, o.dryCleaner.name, o.contactPhone, o.pickupAddress]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(t));
    });
  }, [orders, q, status]);

  const shownCustomers = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (customers || []).filter(
      (c) => !t || [c.name, c.phone, c.email].filter(Boolean).some((x) => String(x).toLowerCase().includes(t))
    );
  }, [customers, q]);

  const statuses = useMemo(() => Array.from(new Set((orders || []).map((o) => o.status))), [orders]);

  return (
    <section>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className={"ff-btn " + (view === "orders" ? "ff-btn-primary" : "ff-btn-outline")} style={{ flex: 1 }} onClick={() => setView("orders")}>
          Orders {orders ? "(" + orders.length + ")" : ""}
        </button>
        <button className={"ff-btn " + (view === "customers" ? "ff-btn-primary" : "ff-btn-outline")} style={{ flex: 1 }} onClick={() => setView("customers")}>
          Customers {customers ? "(" + customers.length + ")" : ""}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="ff-input"
          style={{ flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={view === "orders" ? "Search order, name, phone, email…" : "Search name, phone, email…"}
        />
        {view === "orders" && (
          <select className="ff-input" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        )}
        <button className="ff-btn ff-btn-outline" onClick={load}>↻</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{msg}</p>}

      {view === "orders" &&
        (!orders ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : shownOrders.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No orders found.</p>
        ) : (
          shownOrders.map((o) => {
            const isOpen = open === o.id;
            return (
              <div key={o.id} className="ff-card" style={{ padding: 12, marginBottom: 10 }}>
                <button
                  onClick={() => setOpen(isOpen ? null : o.id)}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b>{o.orderNumber}</b>
                    <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>{label(o.status)}</span>
                  </div>
                  <p style={{ fontSize: 13, margin: "4px 0 0" }}>
                    {o.customer.name || "Customer"} · {o.customer.phone}
                  </p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                    {o.dryCleaner.name} · {inr(o.finalTotal ?? o.estimatedTotal)} · paid {inr(o.amountPaid)} · {when(o.createdAt)}
                  </p>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
                    <p className="ff-label">Customer</p>
                    <Row k="Name" v={o.customer.name || "-"} />
                    <Row k="Phone" v={o.customer.phone} />
                    <Row k="Email" v={o.customer.email || "-"} />
                    <div style={{ display: "flex", gap: 8, margin: "6px 0 10px" }}>
                      <a className="ff-btn ff-btn-outline" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={"tel:" + o.customer.phone}>Call</a>
                      <a className="ff-btn ff-btn-outline" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={wa(o.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    </div>
                    {o.contactName && (
                      <Row k="Ordered for" v={o.contactName + (o.contactPhone ? " · " + o.contactPhone : "")} />
                    )}
                    <Row k="Pickup address" v={o.pickupAddress} />
                    <Row k="Delivery address" v={o.deliveryAddress} />
                    <Row k="Preferred pickup" v={when(o.preferredPickupAt)} />

                    <p className="ff-label" style={{ marginTop: 10 }}>Dry-cleaner</p>
                    <Row k="Name" v={o.dryCleaner.name} />
                    <Row k="Phone" v={o.dryCleaner.phone || "-"} />

                    <p className="ff-label" style={{ marginTop: 10 }}>Items</p>
                    {o.items.map((i, idx) => (
                      <Row key={idx} k={i.itemName + " (" + i.serviceName + ") × " + i.quantity} v={inr(i.estimatedPrice)} />
                    ))}

                    <p className="ff-label" style={{ marginTop: 10 }}>Money</p>
                    <Row k="Estimated total" v={inr(o.estimatedTotal)} />
                    {o.couponCode && <Row k={"Offer " + o.couponCode} v={"− " + inr(o.discountAmount)} />}
                    <Row k="Final total" v={o.finalTotal != null ? inr(o.finalTotal) : "not set yet"} />
                    <Row k="Paid so far" v={inr(o.amountPaid)} />
                    <Row k="Balance due" v={inr(o.balanceDue)} />
                    <Row k="Fresh Folds commission" v={o.commissionAmount != null ? inr(o.commissionAmount) : "-"} />
                    {o.advanceClaimedAt && o.amountPaid <= 0 && (
                      <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", padding: 6, borderRadius: 6, margin: "6px 0" }}>
                        Customer says the advance is paid. Confirm it in the Payouts tab.
                      </p>
                    )}
                    {o.payments.map((p, idx) => (
                      <Row key={idx} k={"Payment: " + p.via + " (" + p.status.toLowerCase() + ")"} v={inr(p.amount) + " · " + when(p.at)} />
                    ))}

                    <p className="ff-label" style={{ marginTop: 10 }}>Other</p>
                    <Row k="Pickup photos" v={o.photos} />
                    <Row k="Placed" v={when(o.createdAt)} />
                    <Row k="Last updated" v={when(o.updatedAt)} />
                  </div>
                )}
              </div>
            );
          })
        ))}

      {view === "customers" &&
        (!customers ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : shownCustomers.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No customers found.</p>
        ) : (
          shownCustomers.map((c) => (
            <div key={c.id} className="ff-card" style={{ padding: 12, marginBottom: 10 }}>
              <b>{c.name || "No name yet"}</b>
              <Row k="Phone" v={c.phone} />
              <Row k="Email" v={c.email || "-"} />
              <Row k="Orders" v={c.orders + " · " + inr(c.spent)} />
              <Row k="Last order" v={when(c.lastOrderAt)} />
              <Row k="Joined" v={when(c.joinedAt)} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <a className="ff-btn ff-btn-outline" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={"tel:" + c.phone}>Call</a>
                <a className="ff-btn ff-btn-outline" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={wa(c.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
            </div>
          ))
        ))}
    </section>
  );
}
