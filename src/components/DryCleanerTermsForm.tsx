"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { TERMS_SECTIONS, TERMS_VERSION } from "@/lib/dryCleanerTerms";

export function TermsBody() {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
      {TERMS_SECTIONS.map((s) => (
        <div key={s.title} style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{s.title}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {s.points.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function DryCleanerTermsForm({
  businessName,
  onAccepted,
}: {
  businessName: string;
  onAccepted: () => void;
}) {
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function accept() {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/drycleaners/me/terms", "dryclean", {
        method: "POST",
        body: JSON.stringify({ version: TERMS_VERSION, fullName: name.trim(), agree: true }),
      });
      onAccepted();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Partner terms and conditions</h2>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
        {businessName}: please read and accept these terms to start receiving orders.
      </p>
      <div className="ff-card" style={{ padding: 14, maxHeight: "50vh", overflowY: "auto", marginBottom: 12 }}>
        <TermsBody />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          I have read and agree to these terms. I understand that I am fully responsible for customers&apos; clothes from
          pickup until delivery.
        </span>
      </label>
      <label className="ff-label">Type your full name as your signature</label>
      <input className="ff-input" style={{ marginBottom: 10 }} value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="ff-btn ff-btn-primary"
        style={{ width: "100%" }}
        disabled={busy || !agree || name.trim().length < 3}
        onClick={accept}
      >
        {busy ? "Saving…" : "Accept and continue"}
      </button>
      {msg && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
