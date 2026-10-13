"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Offer {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  minOrderValue: number;
  expiresAt: string | null;
  active: boolean;
  used: number;
}

/** A dry-cleaner's own offers: customers of this shop see them in their cart. */
export default function ShopOffers() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ offers: Offer[] }>("/api/dryclean/offers", "dryclean");
      setOffers(d.offers);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not load offers.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setMsg("");
    const v = Number(value);
    if (!code.trim() || !Number.isFinite(v) || v <= 0) {
      setMsg("Enter a code and a discount.");
      return;
    }
    const body: Record<string, unknown> = { code: code.trim(), discountType: type, discountValue: v, minOrderValue: minOrder ? Number(minOrder) : 0 };
    if (expiresOn) body.expiresOn = expiresOn;
    setBusy(true);
    try {
      await apiFetch("/api/dryclean/offers", "dryclean", { method: "POST", body: JSON.stringify(body) });
      setCode("");
      setValue("");
      setMinOrder("");
      setExpiresOn("");
      setMsg("Offer created. Your customers can now see it in their cart.");
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not create the offer.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(o: Offer) {
    try {
      await apiFetch("/api/dryclean/offers", "dryclean", { method: "PATCH", body: JSON.stringify({ id: o.id, active: !o.active }) });
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not update the offer.");
    }
  }

  return (
    <section>
      <div className="ff-card" style={{ padding: 16, marginBottom: 16 }}>
        <p className="ff-label">Create an offer for your customers</p>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
          Customers placing an order with you see this offer in their cart and can tap it. It works only for your shop, and the discount is taken from your amount.
        </p>
        <label className="ff-label">Code (letters/numbers, e.g. DIWALI10)</label>
        <input className="ff-input" style={{ marginBottom: 8 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <label className="ff-label">Discount type</label>
        <select className="ff-input" style={{ marginBottom: 8 }} value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "FLAT")}>
          <option value="PERCENT">Percent off the whole order</option>
          <option value="FLAT">Flat rupees off</option>
        </select>
        <label className="ff-label">{type === "PERCENT" ? "Percent (e.g. 10)" : "Rupees off (e.g. 50)"}</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        <label className="ff-label">Minimum order in rupees (optional)</label>
        <input className="ff-input" style={{ marginBottom: 8 }} type="number" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        <label className="ff-label">Last valid date (optional)</label>
        <input className="ff-input" style={{ marginBottom: 12 }} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={create}>Create offer</button>
        {msg && <p style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("Offer created") ? "#059669" : "#dc2626" }}>{msg}</p>}
      </div>
      <div className="ff-card" style={{ padding: 16 }}>
        <p className="ff-label">Your offers</p>
        {offers === null && <p style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</p>}
        {offers && offers.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>No offers yet.</p>}
        {offers?.map((o) => (
          <div key={o.id} style={{ padding: "10px 0", borderTop: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong>{o.code}</strong>
              <button className="ff-btn ff-btn-outline" onClick={() => toggle(o)}>{o.active ? "Turn off" : "Turn on"}</button>
            </div>
            <p style={{ fontSize: 12, margin: "4px 0 0" }}>
              {o.discountType === "PERCENT" ? o.discountValue + "% off" : "Rs " + o.discountValue + " off"}
              {o.minOrderValue > 0 ? ", min order Rs " + o.minOrderValue : ""}
            </p>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>
              Used {o.used} times · {o.expiresAt ? "valid till " + new Date(o.expiresAt).toLocaleDateString("en-IN") : "no expiry"} · {o.active ? "ON" : "OFF"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
