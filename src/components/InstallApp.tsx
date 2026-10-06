"use client";

import { useEffect, useState } from "react";

type Props = { title: string; subtitle: string; loginPath: string };

export default function InstallApp({ title, subtitle, loginPath }: Props) {
  const [evt, setEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!evt) return;
    try {
      evt.prompt();
      const choice = await evt.userChoice;
      if (choice?.outcome === "accepted") setInstalled(true);
      else setMsg("Installation cancelled. Tap Install again when ready.");
    } catch {
      setMsg("Could not start the install. Use the manual steps below.");
    }
    setEvt(null);
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24, textAlign: "center" }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: "#2563eb",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 28,
          margin: "32px auto 16px",
        }}
      >
        FF
      </div>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{title}</h1>
      <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>{subtitle}</p>

      {installed ? (
        <p style={{ color: "#059669", fontWeight: 600, marginBottom: 16 }}>
          Installed. Open it from your home screen.
        </p>
      ) : evt ? (
        <button className="ff-btn ff-btn-primary" style={{ width: "100%", fontSize: 16, padding: 14 }} onClick={install}>
          ⬇ Install app
        </button>
      ) : (
        <div
          className="ff-card"
          style={{ padding: 14, textAlign: "left", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>To install on this phone:</p>
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            <li>Open this page in <b>Chrome</b> (not inside another app).</li>
            <li>Tap the <b>⋮</b> menu at the top right.</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
          </ol>
          <p style={{ color: "#94a3b8", marginTop: 8 }}>
            If you already installed it, it is on your home screen.
          </p>
        </div>
      )}
      {msg && <p style={{ fontSize: 12, color: "#b91c1c", marginBottom: 12 }}>{msg}</p>}

      <a
        className="ff-btn ff-btn-outline"
        style={{ display: "block", textDecoration: "none", marginTop: 8 }}
        href={loginPath}
      >
        Continue in browser instead
      </a>
    </main>
  );
}
