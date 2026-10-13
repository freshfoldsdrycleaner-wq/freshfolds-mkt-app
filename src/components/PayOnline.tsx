"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: any) => void) => void };
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** "Pay online" button: UPI, cards and netbanking through Razorpay. Hidden until online payment is switched on. */
export default function PayOnline({ orderId, label, onPaid }: { orderId: string; label?: string; onPaid?: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<{ enabled: boolean }>("/api/payments/razorpay/config", "customer")
      .then((d) => alive && setEnabled(!!d.enabled))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled) return null;
  if (done) return <p style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>✓ Advance received. Thank you!</p>;

  async function pay() {
    setBusy(true);
    setMsg("");
    try {
      const ok = await loadScript();
      if (!ok || !window.Razorpay) throw new Error("Could not open the payment screen. Check your internet and try again.");
      const o = await apiFetch<{ keyId: string; razorpayOrderId: string; amount: number; currency: string; orderNumber: string }>(
        "/api/payments/razorpay/order",
        "customer",
        { method: "POST", body: JSON.stringify({ orderId }) }
      );
      const rz = new window.Razorpay({
        key: o.keyId,
        order_id: o.razorpayOrderId,
        amount: o.amount,
        currency: o.currency,
        name: "Fresh Folds",
        description: "Advance for " + o.orderNumber,
        theme: { color: "#0e8f9c" },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await apiFetch("/api/payments/razorpay/verify", "customer", { method: "POST", body: JSON.stringify({ orderId, ...r }) });
            setDone(true);
            onPaid?.();
          } catch (e) {
            setMsg("Payment done, but we could not confirm it yet. It will show up shortly. " + ((e as Error).message || ""));
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on("payment.failed", () => {
        setMsg("Payment failed. You have not been charged. Please try again.");
        setBusy(false);
      });
      rz.open();
    } catch (e) {
      setMsg((e as Error).message || "Could not start the payment.");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={pay}>
        {busy ? "Opening payment…" : label || "Pay advance online"}
      </button>
      {msg && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{msg}</p>}
    </div>
  );
}
