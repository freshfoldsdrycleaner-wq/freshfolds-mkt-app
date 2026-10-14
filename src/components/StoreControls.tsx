"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";

interface State {
  acceptingOrders: boolean;
  dailyOrderLimit: number | null;
  ordersToday: number;
  availability: { open: boolean; message: string | null };
}

/** Store on/off switch and the daily order limit for a dry-cleaner. */
export default function StoreControls({
  initial,
}: {
  initial: { acceptingOrders?: boolean; dailyOrderLimit?: number | null; ordersToday?: number; availability?: { open: boolean; message: string | null } };
}) {
  const [st, setSt] = useState<State>({
    acceptingOrders: initial.acceptingOrders ?? true,
    dailyOrderLimit: initial.dailyOrderLimit ?? null,
    ordersToday: initial.ordersToday ?? 0,
    availability: initial.availability ?? { open: true, message: null },
  });
  const [limitText, setLimitText] = useState(initial.dailyOrderLimit != null ? String(initial.dailyOrderLimit) : "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setMsg("");
    try {
      const d = await apiFetch<State>("/api/drycleaners/me", "dryclean", { method: "PATCH", body: JSON.stringify(body) });
      setSt(d);
      setMsg(okMsg);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const open = st.acceptingOrders;
  return (
    <div className="ff-card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <p className="ff-label" style={{ margin: 0 }}>Your store</p>
          <p style={{ margin: "2px 0 0", fontWeight: 700, color: open ? "#059669" : "#b91c1c" }}>{open ? "ONLINE · taking orders" : "OFFLINE · not taking orders"}</p>
        </div>
        <button
          className={open ? "ff-btn ff-btn-outline" : "ff-btn ff-btn-primary"}
          disabled={busy}
          onClick={() => save({ acceptingOrders: !open }, open ? "Store is now offline. Customers cannot place new orders." : "Store is online. Customers can order again.")}
        >
          {open ? "Go offline" : "Go online"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 12px" }}>
        Orders already placed are not affected. Only new orders are stopped.
      </p>
      <label className="ff-label">Most new orders per day (leave empty for no limit)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="ff-input" type="number" inputMode="numeric" min={1} value={limitText} onChange={(e) => setLimitText(e.target.value)} placeholder="e.g. 20" />
        <button
          className="ff-btn ff-btn-primary"
          disabled={busy}
          onClick={() => {
            const t = limitText.trim();
            const n = t === "" ? null : Number(t);
            if (n !== null && (!Number.isInteger(n) || n < 1)) {
              setMsg("Enter a whole number like 20, or leave it empty.");
              return;
            }
            save({ dailyOrderLimit: n }, n === null ? "No daily limit now." : `Limit saved: ${n} new orders per day.`);
          }}
        >
          Save
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0" }}>
        Today: {st.ordersToday} new order{st.ordersToday === 1 ? "" : "s"}
        {st.dailyOrderLimit != null ? ` of ${st.dailyOrderLimit}` : ""}. The count restarts every midnight.
        {!st.availability.open && st.acceptingOrders ? " You have reached today's limit, so customers see you as fully booked." : ""}
      </p>
      {msg && <p style={{ fontSize: 12, marginTop: 8, color: /^(Could|Enter)/.test(msg) ? "#dc2626" : "#059669" }}>{msg}</p>}
    </div>
  );
}
