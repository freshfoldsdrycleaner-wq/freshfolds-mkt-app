"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscount: number | null;
  minOrderValue: number;
  expiresAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  active: boolean;
  isPublic: boolean;
  used: number;
}

export default function CouponAdmin() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomer, setPerCustomer] = useState("1");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ coupons: Coupon[] }>("/api/admin/coupons", "admin");
      setCoupons(data.coupons);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not load offer codes.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setMsg("");
    const v = Number(value);
    if (!code.trim() || !Number.isFinite(v) || v <= 0) {
      setMsg("Enter a code and a discount value.");
      return;
    }
    const body: Record<string, unknown> = {
      code: code.trim(),
      discountType: type,
      discountValue: v,
      minOrderValue: minOrder ? Number(minOrder) : 0,
      perCustomerLimit: perCustomer ? Number(perCustomer) : 1,
      isPublic,
    };
    if (description.trim()) body.description = description.trim();
    if (type === "PERCENT" && maxDiscount) body.maxDiscount = Number(maxDiscount);
    if (expiresOn) body.expiresOn = expiresOn;
    if (usageLimit) body.usageLimit = Number(usageLimit);
    setBusy(true);
    try {
      await apiFetch("/api/admin/coupons", "admin", { method: "POST", body: JSON.stringify(body) });
      setCode("");
      setValue("");
      setMaxDiscount("");
      setMinOrder("");
      setExpiresOn("");
      setUsageLimit("");
      setPerCustomer("1");
      setDescription("");
      setMsg("Offer code created.");
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not create the offer code.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Coupon) {
    try {
      await apiFetch("/api/admin/coupons", "admin", {
        method: "PATCH",
        body: JSON.stringify({ id: c.id, active: !c.active }),
      });
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not update the offer code.");
    }
  }

  async function togglePublic(c: Coupon) {
    try {
      await apiFetch("/api/admin/coupons", "admin", {
        method: "PATCH",
        body: JSON.stringify({ id: c.id, isPublic: !c.isPublic }),
      });
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not update the offer code.");
    }
  }

  const describe = (c: Coupon) =>
    (c.discountType === "PERCENT" ? c.discountValue + "% off" : "Rs " + c.discountValue + " off") +
    (c.maxDiscount ? " (max Rs " + c.maxDiscount + ")" : "") +
    (c.minOrderValue > 0 ? ", min order Rs " + c.minOrderValue : "");

  return (
    <section>
      <div className="ff-card" style={{ padding: 16, marginBottom: 16 }}>
        <p className="ff-label">Create offer code</p>
        <label className="ff-label">Code (letters/numbers, e.g. WELCOME50)</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input className="ff-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button
            type="button"
            className="ff-btn ff-btn-outline"
            onClick={() => {
              const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
              let r = "FF";
              for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
              setCode(r);
            }}
          >
            Generate
          </button>
        </div>
        <label className="ff-label">Discount type</label>
        <select className="ff-input" style={{ marginBottom: 8 }} value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FLAT")}>
          <option value="PERCENT">Percent off</option>
          <option value="FLAT">Flat rupees off</option>
        </select>
        <label className="ff-label">{type === "PERCENT" ? "Percent (e.g. 10)" : "Rupees off (e.g. 50)"}</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        {type === "PERCENT" && (
          <>
            <label className="ff-label">Maximum discount in rupees (optional)</label>
            <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="decimal" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          </>
        )}
        <label className="ff-label">Minimum order value in rupees (optional)</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        <label className="ff-label">Last valid date (optional)</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        <label className="ff-label">Total times it can be used (optional)</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="numeric" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
        <label className="ff-label">Times each customer can use it</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="numeric" value={perCustomer} onChange={(e) => setPerCustomer(e.target.value)} />
        <label className="ff-label">Note for yourself (optional)</label>
        <input className="ff-input" style={{ marginBottom: 12 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show this offer to all customers in the app
        </label>
        <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={create}>
          Create offer code
        </button>
        {msg && <p style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("Offer code created") ? "#059669" : "#dc2626" }}>{msg}</p>}
      </div>

      <div className="ff-card" style={{ padding: 16 }}>
        <p className="ff-label">All offer codes</p>
        {coupons === null && <p style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</p>}
        {coupons && coupons.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No offer codes yet.</p>}
        {coupons &&
          coupons.map((c) => (
            <div key={c.id} style={{ padding: "10px 0", borderTop: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>{c.code}</strong>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ff-btn ff-btn-outline" onClick={() => togglePublic(c)}>
                    {c.isPublic ? "Hide from customers" : "Show to customers"}
                  </button>
                  <button className="ff-btn ff-btn-outline" onClick={() => toggle(c)}>
                    {c.active ? "Turn off" : "Turn on"}
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 12, margin: "4px 0 0" }}>{describe(c)}</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>
                Used {c.used}
                {c.usageLimit ? " of " + c.usageLimit : ""} · {c.perCustomerLimit} per customer ·{" "}
                {c.expiresAt ? "valid till " + new Date(c.expiresAt).toLocaleDateString("en-IN") : "no expiry"} ·{" "}
                {c.active ? "ON" : "OFF"} · {c.isPublic ? "visible to customers" : "private code"}
              </p>
              {c.description && <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>{c.description}</p>}
            </div>
          ))}
      </div>
    </section>
  );
}
