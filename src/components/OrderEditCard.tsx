"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";

type Props = {
  orderId: string;
  app: "customer" | "dryclean";
  allowEdit?: boolean;
  onDone: () => void;
};

export default function OrderEditCard({ orderId, app, allowEdit, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function cancelOrder() {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/cancel", app, { method: "POST" });
      onDone();
    } catch (e) {
      setMsg((e as Error).message || "Could not cancel the order.");
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    const body: Record<string, string> = {};
    if (pickup.trim()) body.pickupAddress = pickup.trim();
    if (delivery.trim()) body.deliveryAddress = delivery.trim();
    if (when) body.preferredPickupAt = new Date(when).toISOString();
    if (Object.keys(body).length === 0) {
      setMsg("Fill in at least one field to change.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/modify", app, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setOpen(false);
      setPickup("");
      setDelivery("");
      setWhen("");
      onDone();
    } catch (e) {
      setMsg((e as Error).message || "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#f8fafc" }}>
      <p className="ff-label">Manage order</p>
      {allowEdit && (
        <button
          className="ff-btn ff-btn-outline"
          style={{ width: "100%", marginBottom: 8 }}
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "Change pickup details"}
        </button>
      )}
      {allowEdit && open && (
        <div style={{ marginBottom: 8 }}>
          <label className="ff-label">New pickup address (leave blank to keep)</label>
          <input className="ff-input" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          <label className="ff-label">New delivery address (leave blank to keep)</label>
          <input className="ff-input" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          <label className="ff-label">New preferred pickup time (optional)</label>
          <input
            className="ff-input"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <button
            className="ff-btn ff-btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            disabled={busy}
            onClick={saveChanges}
          >
            Save changes
          </button>
        </div>
      )}
      <button
        className="ff-btn ff-btn-outline"
        style={{ width: "100%", color: "#dc2626" }}
        disabled={busy}
        onClick={cancelOrder}
      >
        Cancel order
      </button>
      {msg && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{msg}</p>}
      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        Orders can be changed or cancelled until the dry-cleaner assigns pickup.
      </p>
    </div>
  );
}