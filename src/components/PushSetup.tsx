"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

function keyToBytes(b64url: string) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Banner that turns on phone notifications for order updates. */
export default function PushSetup({ app }: { app: "customer" | "dryclean" | "admin" }) {
  const [state, setState] = useState<"hidden" | "ask" | "denied" | "busy">("hidden");
  const [msg, setMsg] = useState("");

  async function subscribe(reg: ServiceWorkerRegistration) {
    const k = await apiFetch<{ key: string }>("/api/push/key", app);
    const opts = { userVisibleOnly: true, applicationServerKey: keyToBytes(k.key) };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe(opts);
    }
    await apiFetch("/api/push/subscribe", app, {
      method: "POST",
      body: JSON.stringify({ endpoint: sub.endpoint, app }),
    });
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission === "granted") {
          await navigator.serviceWorker.ready;
          await subscribe(reg);
        } else if (Notification.permission === "denied") {
          setState("denied");
        } else {
          setState("ask");
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function turnOn() {
    setState("busy");
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "ask");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      await subscribe(reg);
      setState("hidden");
      setMsg("Notifications are on.");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      setState("ask");
      setMsg("Could not turn on notifications. Try again.");
    }
  }

  if (state === "hidden" && !msg) return null;
  return (
    <div
      className="ff-card"
      style={{ padding: 10, margin: "0 0 12px", background: "#eff6ff", fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {state === "ask" || state === "busy" ? (
        <>
          <span style={{ flex: 1 }}>🔔 Get order updates as phone notifications.</span>
          <button className="ff-btn ff-btn-primary" style={{ padding: "6px 12px" }} disabled={state === "busy"} onClick={turnOn}>
            Turn on
          </button>
        </>
      ) : state === "denied" ? (
        <span>
          🔕 Notifications are blocked. Turn them on in Chrome: ⋮ → Settings → Site settings → Notifications → this site → Allow.
        </span>
      ) : null}
      {msg && <span style={{ color: msg.startsWith("Notifications are on") ? "#059669" : "#b91c1c" }}>{msg}</span>}
    </div>
  );
}
