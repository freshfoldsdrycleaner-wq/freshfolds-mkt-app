"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }} aria-label={`${value} of 5 stars`}>
      {"★".repeat(Math.round(value))}
      <span style={{ color: "#e2e8f0" }}>{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

type Item = { id: string; rating: number; review: string | null; createdAt: string; name: string };

/** Public list of ratings for a dry-cleaner — visible to everyone. */
export function ReviewsList({ dryCleanerId, app, refreshKey }: { dryCleanerId: string; app: "customer" | "dryclean" | "admin"; refreshKey?: number }) {
  const [data, setData] = useState<{ average: number | null; count: number; reviews: Item[] } | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch<{ average: number | null; count: number; reviews: Item[] }>(`/api/drycleaners/${dryCleanerId}/reviews`, app)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ average: null, count: 0, reviews: [] }));
    return () => {
      alive = false;
    };
  }, [dryCleanerId, app, refreshKey]);

  if (!data) return <p style={{ fontSize: 12, color: "#94a3b8" }}>Loading ratings…</p>;
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
        Ratings {data.average != null && <span style={{ color: "#f59e0b" }}>★ {data.average}</span>}
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}> ({data.count} {data.count === 1 ? "review" : "reviews"})</span>
      </h3>
      {data.count === 0 && <p style={{ fontSize: 12, color: "#94a3b8" }}>No ratings yet.</p>}
      {data.reviews.map((r) => (
        <div key={r.id} className="ff-card" style={{ padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
            <Stars value={r.rating} />
          </div>
          {r.review && <p style={{ fontSize: 13, margin: "6px 0 0", color: "#334155" }}>{r.review}</p>}
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0" }}>{new Date(r.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
        </div>
      ))}
    </div>
  );
}

/** Shown on a delivered order: customer picks stars + optional comment. */
export function RateOrder({ orderId, onDone }: { orderId: string; onDone?: () => void }) {
  const [existing, setExisting] = useState<{ rating: number; review: string | null } | null | undefined>(undefined);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch<{ review: { rating: number; review: string | null } | null }>(`/api/orders/${orderId}/review`, "customer")
      .then((d) => alive && setExisting(d.review))
      .catch(() => alive && setExisting(null));
    return () => {
      alive = false;
    };
  }, [orderId]);

  async function submit() {
    if (!stars) return setErr("Please choose 1 to 5 stars.");
    setBusy(true);
    setErr("");
    try {
      await apiFetch(`/api/orders/${orderId}/review`, "customer", { method: "POST", body: JSON.stringify({ rating: stars, review: text.trim() || undefined }) });
      setExisting({ rating: stars, review: text.trim() || null });
      onDone?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (existing === undefined) return null;
  if (existing) {
    return (
      <div className="ff-card" style={{ padding: 14, marginBottom: 16, background: "#f0fdf4" }}>
        <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 4px" }}>Thanks for your rating!</p>
        <Stars value={existing.rating} size={20} />
        {existing.review && <p style={{ fontSize: 13, margin: "6px 0 0" }}>{existing.review}</p>}
      </div>
    );
  }
  return (
    <div className="ff-card" style={{ padding: 14, marginBottom: 16 }}>
      <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 8px" }}>How was the dry-cleaner?</p>
      <div style={{ marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)} style={{ fontSize: 32, background: "none", border: "none", padding: "0 4px", color: n <= stars ? "#f59e0b" : "#cbd5e1" }} aria-label={`${n} star`}>★</button>
        ))}
      </div>
      <textarea className="ff-input" rows={3} maxLength={500} placeholder="Write a short review (optional). It will be visible to everyone." value={text} onChange={(e) => setText(e.target.value)} />
      {err && <p style={{ color: "#dc2626", fontSize: 12 }}>{err}</p>}
      <button className="ff-btn ff-btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit rating"}</button>
    </div>
  );
}
