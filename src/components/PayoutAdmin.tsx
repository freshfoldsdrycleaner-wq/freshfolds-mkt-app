"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface Row {
  dryCleanerId: string;
  businessName: string;
  advancesCollected: number;
  commission: number;
  alreadyPaid: number;
  owed: number;
  history: { id: string; amount: number; note: string | null; createdAt: string }[];
}

interface Claim {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  dryCleaner: string;
  ref: string | null;
  claimedAt: string;
  suggestedAmount: number;
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function PayoutAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimAmt, setClaimAmt] = useState<Record<string, string>>({});

  const loadClaims = useCallback(async () => {
    try {
      const d = await apiFetch<{ claims: Claim[] }>("/api/admin/advance", "admin");
      setClaims(d.claims);
    } catch {}
  }, []);

  async function decide(c: Claim, reject: boolean) {
    const amount = Number(claimAmt[c.orderId] ?? c.suggestedAmount);
    if (!reject && (!Number.isFinite(amount) || amount <= 0)) {
      setMsg("Enter the amount you received.");
      return;
    }
    if (reject && !window.confirm("Tell the customer you did not receive this payment?")) return;
    setMsg("");
    try {
      await apiFetch("/api/admin/advance", "admin", {
        method: "POST",
        body: JSON.stringify({ orderId: c.orderId, amount: reject ? 1 : amount, reject }),
      });
      loadClaims();
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not update.");
    }
  }

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ rows: Row[] }>("/api/admin/payouts", "admin");
      setRows(d.rows);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not load payouts.");
    }
  }, []);

  useEffect(() => {
    load();
    loadClaims();
  }, [load, loadClaims]);

  async function pay(r: Row) {
    const amount = Number(amounts[r.dryCleanerId] ?? r.owed);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("Enter an amount above 0.");
      return;
    }
    setMsg("");
    try {
      await apiFetch("/api/admin/payouts", "admin", {
        method: "POST",
        body: JSON.stringify({ dryCleanerId: r.dryCleanerId, amount, note: "Paid by UPI" }),
      });
      setAmounts((a) => ({ ...a, [r.dryCleanerId]: "" }));
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not record the payout.");
    }
  }

  return (
    <section>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>Advance payments to confirm</p>
      {claims.length === 0 ? (
        <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>None waiting.</p>
      ) : (
        claims.map((c) => (
          <div key={c.orderId} className="ff-card" style={{ padding: 12, marginBottom: 10, background: "#fffbeb" }}>
            <p style={{ fontWeight: 600 }}>{c.orderNumber} · {c.dryCleaner}</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
              {c.customerName || "Customer"} · {c.customerPhone}
              {c.ref ? " · UPI ref: " + c.ref : ""}
            </p>
            <p style={{ fontSize: 11, color: "#92400e", marginBottom: 6 }}>
              Check your UPI app first. Confirm only if the money has arrived.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="ff-input"
                type="number"
                inputMode="decimal"
                value={claimAmt[c.orderId] ?? String(c.suggestedAmount)}
                onChange={(e) => setClaimAmt((a) => ({ ...a, [c.orderId]: e.target.value }))}
              />
              <button className="ff-btn ff-btn-primary" onClick={() => decide(c, false)}>Received</button>
              <button className="ff-btn ff-btn-outline" onClick={() => decide(c, true)}>Not received</button>
            </div>
          </div>
        ))
      )}
      <p style={{ fontWeight: 700, margin: "16px 0 6px" }}>Money owed to dry-cleaners</p>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Advances customers paid to your UPI, minus your commission. After you send the dry-cleaner their share, tap
        &quot;Mark paid&quot; so the balance goes down.
      </p>
      {msg && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>{msg}</p>}
      {!rows ? (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>No dry-cleaners yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.dryCleanerId} className="ff-card" style={{ padding: 14, marginBottom: 12 }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>{r.businessName}</p>
            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Advances paid to Fresh Folds</span><span>{inr(r.advancesCollected)}</span>
            </div>
            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#dc2626" }}>
              <span>Your commission on those orders</span><span>− {inr(r.commission)}</span>
            </div>
            <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>Already paid to dry-cleaner</span><span>− {inr(r.alreadyPaid)}</span>
            </div>
            <div style={{ fontSize: 15, display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 10, color: r.owed >= 0 ? "#059669" : "#dc2626" }}>
              <span>{r.owed >= 0 ? "You owe the dry-cleaner" : "Dry-cleaner owes you"}</span>
              <span>{inr(Math.abs(r.owed))}</span>
            </div>
            {r.owed > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="ff-input"
                  type="number"
                  inputMode="decimal"
                  placeholder={String(r.owed)}
                  value={amounts[r.dryCleanerId] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.dryCleanerId]: e.target.value }))}
                />
                <button className="ff-btn ff-btn-primary" onClick={() => pay(r)}>Mark paid</button>
              </div>
            )}
            {r.history.length > 0 && (
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                Recent payouts:{" "}
                {r.history.map((h) => inr(h.amount) + " on " + new Date(h.createdAt).toLocaleDateString("en-IN")).join(", ")}
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );
}
