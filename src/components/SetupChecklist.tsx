"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Props {
  dc: { status: string; operatingHours: string | null; payoutUpiId?: string | null; razorpayLinked?: boolean; termsVersion?: string | null };
  liveServices: number;
  pendingServices: number;
  onGoServices: () => void;
  onChanged: () => void;
}

/** Shows a new shop exactly what is left before it can take orders. */
export default function SetupChecklist({ dc, liveServices, pendingServices, onGoServices, onChanged }: Props) {
  const [upi, setUpi] = useState(dc.payoutUpiId || "");
  const [hours, setHours] = useState(dc.operatingHours || "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const hasPayout = !!dc.payoutUpiId || !!dc.razorpayLinked;
  const steps = [
    { done: true, label: "Shop details added" },
    { done: !!dc.operatingHours, label: "Opening hours" },
    { done: liveServices > 0 || pendingServices > 0, label: pendingServices > 0 && liveServices === 0 ? "Price list sent. Waiting for approval" : "Price list added" },
    { done: hasPayout, label: "Where to send your money (UPI ID)" },
    { done: dc.status === "ACTIVE", label: "Approved by Fresh Folds. You are live!" },
  ];
  if (steps.every((s) => s.done)) return null;

  async function save() {
    setMsg("");
    setBusy(true);
    try {
      await apiFetch("/api/drycleaners/me", "dryclean", {
        method: "PATCH",
        body: JSON.stringify({ ...(upi.trim() ? { payoutUpiId: upi.trim() } : {}), ...(hours.trim() ? { operatingHours: hours.trim() } : {}) }),
      });
      onChanged();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ff-card" style={{ padding: 16, marginBottom: 16, borderColor: "#bfdbfe", background: "#eff6ff" }}>
      <p style={{ fontWeight: 700, marginBottom: 8 }}>Get ready to take orders</p>
      {steps.map((s, i) => (
        <p key={i} style={{ fontSize: 13, margin: "4px 0", color: s.done ? "#059669" : "#334155" }}>
          {s.done ? "✓" : "○"} {s.label}
        </p>
      ))}
      {!(liveServices > 0 || pendingServices > 0) && (
        <button className="ff-btn ff-btn-primary" style={{ marginTop: 10 }} onClick={onGoServices}>Add your prices</button>
      )}
      {(!dc.operatingHours || !dc.payoutUpiId) && (
        <div style={{ marginTop: 12 }}>
          {!dc.operatingHours && (
            <>
              <label className="ff-label">Opening hours</label>
              <input className="ff-input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 9 AM to 8 PM, Mon-Sat" style={{ marginBottom: 8 }} />
            </>
          )}
          {!dc.payoutUpiId && (
            <>
              <label className="ff-label">Your UPI ID (we send your share here)</label>
              <input className="ff-input" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="e.g. 98xxxxxxxx@upi" style={{ marginBottom: 8 }} />
            </>
          )}
          {msg && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 6 }}>{msg}</p>}
          <button className="ff-btn ff-btn-outline" disabled={busy || (!upi.trim() && !hours.trim())} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}
