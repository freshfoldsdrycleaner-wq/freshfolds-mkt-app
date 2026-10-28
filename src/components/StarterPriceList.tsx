"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { STARTER_ITEMS } from "@/lib/starterServices";

/** Lets a new shop tick common items, type only the price, and send them all at once. */
export default function StarterPriceList({ dryCleanerId, existing, onDone }: { dryCleanerId: string; existing: string[]; onDone: () => void }) {
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const have = new Set(existing.map((e) => e.toLowerCase()));
  const rows = STARTER_ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => !have.has(`${it.category}|${it.itemName}|${it.serviceName}`.toLowerCase()));
  const filled = rows.filter(({ i }) => Number(prices[i]) > 0);
  let lastCat = "";

  async function send() {
    setBusy(true);
    setMsg("");
    let ok = 0;
    try {
      for (const { it, i } of filled) {
        await apiFetch(`/api/drycleaners/${dryCleanerId}/services`, "dryclean", {
          method: "POST",
          body: JSON.stringify({ ...it, price: Number(prices[i]), discountPercent: 0, hasPhoto: false }),
        });
        ok++;
      }
      setPrices({});
      onDone();
    } catch (e) {
      setMsg((e instanceof ApiError ? e.message : "Could not send all items.") + ` ${ok} sent.`);
      if (ok) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ff-card" style={{ padding: 16, marginBottom: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 2 }}>Quick start: your price list</p>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Type your price (₹) only for the items you do. Leave the rest empty. Fresh Folds checks the list and then it goes live.
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "#059669" }}>All the common items are already added.</p>
      ) : (
        rows.map(({ it, i }) => {
          const head = it.category !== lastCat;
          lastCat = it.category;
          return (
            <div key={i}>
              {head && <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 4px" }}>{it.category}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: 13 }}>{it.itemName} <span style={{ color: "#94a3b8" }}>· {it.serviceName}</span></div>
                <input
                  className="ff-input"
                  style={{ width: 90 }}
                  type="number"
                  inputMode="decimal"
                  placeholder="₹"
                  value={prices[i] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [i]: e.target.value }))}
                />
              </div>
            </div>
          );
        })
      )}
      {msg && <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 8 }}>{msg}</p>}
      <button className="ff-btn ff-btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy || filled.length === 0} onClick={send}>
        {busy ? "Sending…" : filled.length ? `Send ${filled.length} item${filled.length > 1 ? "s" : ""} for approval` : "Enter at least one price"}
      </button>
    </div>
  );
}
