"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";

/** Customer taps "I have paid". Fresh Folds then checks its UPI app and confirms. */
export default function ClaimPaid({
  orderId,
  paid,
  claimed,
}: {
  orderId: string;
  paid?: boolean;
  claimed?: boolean;
}) {
  const [ref, setRef] = useState("");
  const [sent, setSent] = useState(!!claimed);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (paid) {
    return <p style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>✓ Advance received. Thank you!</p>;
  }
  if (sent) {
    return (
      <p style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", padding: 8, borderRadius: 8 }}>
        Thanks! We will confirm your payment shortly. You will see &quot;Advance received&quot; here once it is confirmed.
      </p>
    );
  }

  async function claim() {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/advance-claim", "customer", {
        method: "POST",
        body: JSON.stringify({ ref: ref.trim() || undefined }),
      });
      setSent(true);
    } catch (e) {
      setMsg((e as Error).message || "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        className="ff-input"
        style={{ marginBottom: 6 }}
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="UPI reference number (optional)"
      />
      <button className="ff-btn ff-btn-outline" style={{ width: "100%" }} disabled={busy} onClick={claim}>
        I have paid
      </button>
      {msg && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{msg}</p>}
    </div>
  );
}
