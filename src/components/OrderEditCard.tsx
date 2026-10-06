"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

type Props = {
  orderId: string;
  app: "customer" | "dryclean";
  allowEdit?: boolean;
  onDone: () => void;
};

type OrderInfo = {
  estimatedTotal: number;
  balanceDue: number | null;
  customer?: { name: string | null; phone: string };
  dryCleaner?: { name: string; phone?: string | null };
};

export default function OrderEditCard({ orderId, app, allowEdit, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [advance, setAdvance] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch<{ order: OrderInfo }>("/api/orders/" + orderId, app)
      .then((d) => {
        if (!alive) return;
        setInfo(d.order);
        if (app === "dryclean") {
          setAdvance(String(Math.round(Number(d.order.estimatedTotal) * 0.2)));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [orderId, app]);

  async function cancelOrder() {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/cancel", app, { method: "POST" });
      onDone();
    } catch (e) {
      const m = (e as Error).message || "Could not cancel the order.";
      setMsg(m);
      window.alert("Could not cancel: " + m);
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

  async function selfPickup() {
    const amount = Number(advance);
    if (!Number.isFinite(amount) || amount < 0) {
      setMsg("Enter the amount collected (0 if nothing).");
      return;
    }
    if (
      !window.confirm(
        "Confirm: you picked up the clothes and collected Rs " + amount + " from the customer?"
      )
    )
      return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/self-pickup", "dryclean", {
        method: "POST",
        body: JSON.stringify({ advanceAmount: amount }),
      });
      onDone();
    } catch (e) {
      setMsg((e as Error).message || "Could not record the pickup.");
    } finally {
      setBusy(false);
    }
  }

  const digits = info?.customer?.phone ? info.customer.phone.replace(/\D/g, "") : "";
  const waNumber = digits.length === 10 ? "91" + digits : digits;

  const dcDigits = info?.dryCleaner?.phone ? info.dryCleaner.phone.replace(/\D/g, "") : "";
  const dcWa = dcDigits.length === 10 ? "91" + dcDigits : dcDigits;

  return (
    <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#f8fafc" }}>
      {app === "customer" && (
        <div style={{ marginBottom: 12 }}>
          <p className="ff-label">Need help?</p>
          {info?.dryCleaner?.phone && (
            <>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                {info.dryCleaner.name}: {info.dryCleaner.phone}
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <a
                  className="ff-btn ff-btn-outline"
                  style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                  href={"tel:" + info.dryCleaner.phone}
                >
                  Call dry-cleaner
                </a>
                <a
                  className="ff-btn ff-btn-outline"
                  style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
                  href={"https://wa.me/" + dcWa}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </>
          )}
          <a
            className="ff-btn ff-btn-outline"
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            href="https://wa.me/918847498061?text=Hi%20Fresh%20Folds%2C%20I%20need%20help%20with%20my%20order."
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact Fresh Folds on WhatsApp
          </a>
        </div>
      )}

      {app === "dryclean" && info?.customer && (
        <div style={{ marginBottom: 12 }}>
          <p className="ff-label">Customer</p>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{info.customer.name || "Customer"}</p>
          <p style={{ fontSize: 13, marginBottom: 6 }}>{info.customer.phone}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              className="ff-btn ff-btn-outline"
              style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
              href={"tel:" + info.customer.phone}
            >
              Call
            </a>
            <a
              className="ff-btn ff-btn-outline"
              style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
              href={"https://wa.me/" + waNumber}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {app === "dryclean" && (
        <div style={{ marginBottom: 12 }}>
          <p className="ff-label">I will pick up myself</p>
          <label className="ff-label">Advance collected from customer (Rs)</label>
          <input
            className="ff-input"
            type="number"
            inputMode="decimal"
            min="0"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
          />
          <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            Pre-filled with 20% of the estimate. Change it if you collected a different amount.
          </p>
          <button
            className="ff-btn ff-btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            disabled={busy}
            onClick={selfPickup}
          >
            Picked up and payment received
          </button>
        </div>
      )}

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
        Orders can be changed or cancelled until pickup is recorded.
      </p>
    </div>
  );
}