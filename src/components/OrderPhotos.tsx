"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

type Photo = { id: string; photoUrl: string; createdAt: string };

export default function OrderPhotos({
  orderId,
  app,
  refreshKey,
}: {
  orderId: string;
  app: "customer" | "dryclean";
  refreshKey?: number;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [big, setBig] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<{ photos: Photo[] }>("/api/orders/" + orderId + "/photos", app)
      .then((d) => alive && setPhotos(d.photos || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [orderId, app, refreshKey]);

  if (photos.length === 0) return null;

  return (
    <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#f8fafc" }}>
      <p className="ff-label">Pickup inspection photos ({photos.length})</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={p.photoUrl}
            alt="Pickup photo"
            onClick={() => setBig(p.photoUrl)}
            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
          />
        ))}
      </div>
      {big && (
        <div
          onClick={() => setBig(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big} alt="Pickup photo large" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
