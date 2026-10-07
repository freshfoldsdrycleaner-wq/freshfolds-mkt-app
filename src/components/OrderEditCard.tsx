"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { FF_UPI_ID, upiLink } from "@/lib/upi";
import ClaimPaid from "@/components/ClaimPaid";

type Props = {
  orderId: string;
  app: "customer" | "dryclean";
  allowEdit?: boolean;
  onDone: () => void;
};

type OrderInfo = {
  estimatedTotal: number;
  balanceDue: number | null;
  amountPaid?: number;
  advanceClaimedAt?: string | null;
  acceptedAt?: string | null;
  pickupAddress?: string;
  customer?: { name: string | null; phone: string };
  contactName?: string | null;
  contactPhone?: string | null;
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
  const [shots, setShots] = useState<string[]>([]);
  const [advanceTo, setAdvanceTo] = useState<"FRESHFOLD" | "VENDOR">("FRESHFOLD");
  const [locStatus, setLocStatus] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [ver, setVer] = useState(0);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    let alive = true;
    apiFetch<{ order: OrderInfo }>("/api/orders/" + orderId, app)
      .then((d) => {
        if (!alive) return;
        setInfo(d.order);
        if (app === "dryclean") {
          setAdvance(String(Math.max(0, Math.round(Number(d.order.estimatedTotal) * 0.2) - Number(d.order.amountPaid || 0))));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [orderId, app, ver]);

  function shareMyLocation() {
    setMsg("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMsg("Your phone or browser does not support sharing location. Please type your address instead.");
      return;
    }
    setLocStatus("Getting your location…");
    const onPos = (pos: GeolocationPosition) => {
      const link =
        "https://maps.google.com/?q=" + pos.coords.latitude.toFixed(6) + "," + pos.coords.longitude.toFixed(6);
      setPickup((prev) => (prev.trim() ? prev.trim() + " | Location: " + link : "Location: " + link));
      setLocStatus("✓ Location added.");
    };
    const onFail = (err: GeolocationPositionError) => {
      setLocStatus(
        err.code === 1
          ? "Location is blocked. In Chrome tap the lock icon next to the address bar, open Permissions, set Location to Allow, then reload."
          : "Could not find your location. Switch on GPS / Location on your phone and try again."
      );
    };
    navigator.geolocation.getCurrentPosition(
      onPos,
      (err) => {
        if (err.code === 1) return onFail(err);
        navigator.geolocation.getCurrentPosition(onPos, onFail, { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function cancelOrder() {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/cancel", app, { method: "POST" });
      onDone();
    } catch (e) {
      setConfirmCancel(false);
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

  function compress(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("no canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("bad image"));
      };
      img.src = url;
    });
  }

  async function addShots(files: FileList | null) {
    if (!files) return;
    setMsg("");
    try {
      const out: string[] = [];
      for (const f of Array.from(files)) out.push(await compress(f));
      setShots((prev) => [...prev, ...out].slice(0, 10));
    } catch {
      setMsg("Could not read that photo. Try again.");
    }
  }

  async function respond(action: "ACCEPT" | "DECLINE") {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/orders/" + orderId + "/respond", "dryclean", {
        method: "POST",
        body: JSON.stringify({ action, reason: declineReason.trim() || undefined }),
      });
      setVer((v) => v + 1);
      onDone();
    } catch (e) {
      setMsg((e as Error).message || "Could not save your answer.");
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
    setBusy(true);
    setMsg("");
    try {
      for (let i = 0; i < shots.length; i++) {
        await apiFetch("/api/orders/" + orderId + "/photos", "dryclean", {
          method: "POST",
          body: JSON.stringify({ photoUrl: shots[i], itemRef: "pickup-" + (i + 1) }),
        });
      }
      await apiFetch("/api/orders/" + orderId + "/self-pickup", "dryclean", {
        method: "POST",
        body: JSON.stringify({ advanceAmount: amount, advanceTo }),
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

  const mapsMatch = info?.pickupAddress ? info.pickupAddress.match(/https?:\/\/\S+/) : null;
  const mapsLink = mapsMatch ? mapsMatch[0] : "";

  const dcDigits = info?.dryCleaner?.phone ? info.dryCleaner.phone.replace(/\D/g, "") : "";
  const dcWa = dcDigits.length === 10 ? "91" + dcDigits : dcDigits;

  return (
    <div className="ff-card" style={{ padding: 12, marginBottom: 16, background: "#f8fafc" }}>
      {app === "customer" && info && (
        <div style={{ marginBottom: 12, padding: 10, background: "#eff6ff", borderRadius: 8 }}>
          <p className="ff-label">Pay your 20% advance</p>
          <p style={{ fontSize: 13, marginBottom: 6 }}>
            Pay <b>Rs {Math.round(Number(info.estimatedTotal) * 0.2)}</b> to Fresh Folds before pickup, or at pickup.
            Show the success screen to the dry-cleaner.
          </p>
          <a
            className="ff-btn ff-btn-primary"
            style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 6 }}
            href={upiLink(Math.round(Number(info.estimatedTotal) * 0.2), "Fresh Folds advance")}
          >
            Pay with UPI app
          </a>
          <p style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>UPI ID: {FF_UPI_ID}</p>
          <ClaimPaid orderId={orderId} paid={Number(info.amountPaid || 0) > 0} claimed={!!info.advanceClaimedAt} />
        </div>
      )}

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

      {app === "dryclean" && mapsLink && (
        <div style={{ marginBottom: 12 }}>
          <p className="ff-label">Pickup location</p>
          <a
            className="ff-btn ff-btn-primary"
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 Open customer location in Maps
          </a>
        </div>
      )}

      {app === "dryclean" && info?.contactName && info?.contactPhone && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fffbeb", borderRadius: 8 }}>
          <p className="ff-label">Ordered for someone else: call this person for pickup</p>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{info.contactName}</p>
          <p style={{ fontSize: 13, marginBottom: 6 }}>{info.contactPhone}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="ff-btn ff-btn-outline" style={{ flex: 1, textAlign: "center", textDecoration: "none" }} href={"tel:" + info.contactPhone}>
              Call
            </a>
            <a
              className="ff-btn ff-btn-outline"
              style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
              href={"https://wa.me/" + (info.contactPhone.replace(/\D/g, "").length === 10 ? "91" : "") + info.contactPhone.replace(/\D/g, "")}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {app === "dryclean" && info && !info.acceptedAt && (
        <div className="ff-card" style={{ padding: 12, marginBottom: 12, background: "#fffbeb" }}>
          <p className="ff-label">New order: do you want to take it?</p>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>The customer is told as soon as you answer.</p>
          {!declining ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ff-btn ff-btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => respond("ACCEPT")}>Accept order</button>
              <button className="ff-btn ff-btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
            </div>
          ) : (
            <>
              <input className="ff-input" style={{ marginBottom: 8 }} placeholder="Reason (optional), e.g. too far, closed today" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="ff-btn ff-btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => respond("DECLINE")}>Yes, decline</button>
                <button className="ff-btn ff-btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => setDeclining(false)}>Back</button>
              </div>
            </>
          )}
          {msg && <p style={{ fontSize: 12, marginTop: 8, color: "#dc2626" }}>{msg}</p>}
        </div>
      )}

      {app === "dryclean" && info?.acceptedAt && (
        <div style={{ marginBottom: 12 }}>
          <p className="ff-label">Pickup</p>
          <label className="ff-label">Inspection photos of the clothes</label>
          <label
            className="ff-btn ff-btn-outline"
            style={{ display: "block", textAlign: "center", cursor: "pointer", marginBottom: 6 }}
          >
            📷 Take / add photos
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                addShots(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {shots.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {shots.map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                  <button
                    type="button"
                    onClick={() => setShots(shots.filter((_, j) => j !== i))}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 12,
                      lineHeight: "20px",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="ff-label">Advance was paid to</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className={"ff-btn " + (advanceTo === "FRESHFOLD" ? "ff-btn-primary" : "ff-btn-outline")}
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => setAdvanceTo("FRESHFOLD")}
            >
              Fresh Folds UPI
            </button>
            <button
              type="button"
              className={"ff-btn " + (advanceTo === "VENDOR" ? "ff-btn-primary" : "ff-btn-outline")}
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => setAdvanceTo("VENDOR")}
            >
              Cash / my UPI
            </button>
          </div>
          {advanceTo === "FRESHFOLD" && (
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                Ask the customer to scan and pay, and check their payment-success screen. UPI ID: {FF_UPI_ID}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/freshfolds-upi-qr.png" alt="Fresh Folds UPI QR" style={{ width: 160, height: 160 }} />
            </div>
          )}
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
            Pre-filled with 20% of the estimate, minus anything already paid to Fresh Folds. Change it if you collected a different amount.
          </p>
          <button
            className="ff-btn ff-btn-primary"
            style={{ width: "100%", marginTop: 8 }}
            disabled={busy}
            onClick={selfPickup}
          >
            Picked up · advance received · start cleaning
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
          <button
            className="ff-btn ff-btn-outline"
            style={{ width: "100%", margin: "6px 0 10px" }}
            onClick={shareMyLocation}
          >
            📍 Share my current location
          </button>
          {locStatus && (
            <p style={{ fontSize: 12, marginBottom: 8, color: locStatus.startsWith("✓") ? "#059669" : locStatus.startsWith("Getting") ? "#64748b" : "#b91c1c" }}>
              {locStatus}
            </p>
          )}
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
      {!confirmCancel ? (
        <button
          className="ff-btn ff-btn-outline"
          style={{ width: "100%", color: "#dc2626" }}
          disabled={busy}
          onClick={() => setConfirmCancel(true)}
        >
          Cancel order
        </button>
      ) : (
        <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Cancel this whole order?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="ff-btn ff-btn-primary"
              style={{ flex: 1, background: "#dc2626", borderColor: "#dc2626" }}
              disabled={busy}
              onClick={cancelOrder}
            >
              {busy ? "Cancelling…" : "Yes, cancel order"}
            </button>
            <button
              className="ff-btn ff-btn-outline"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => setConfirmCancel(false)}
            >
              No, keep it
            </button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{msg}</p>}
      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        Orders can be changed or cancelled until pickup is recorded.
      </p>
    </div>
  );
}