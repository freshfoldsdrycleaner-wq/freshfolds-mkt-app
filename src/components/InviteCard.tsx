"use client";

import { useState } from "react";

/** Admin tool: a ready-made Hinglish invite you can forward to dry-cleaners on WhatsApp. */
export default function InviteCard() {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${base}/join`;
  const text =
    `Namaste! Main Fresh Folds se bol raha hoon. Hum ek app bana rahe hain jahan aas-paas ke customers apne kapde dry-clean karwane ke liye order karte hain.\n\n` +
    `Aapko milega:\n- Naye customers, bina kisi advertisement ke\n- Advance payment seedha app se, paisa safe\n- Apni dukaan ON/OFF aur daily order limit aapke haath mein\n\n` +
    `Register karna free hai, 5 minute lagte hain. Yahan click karein:\n${link}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <section className="ff-card" style={{ padding: 16, marginBottom: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>Invite dry-cleaners</p>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
        Send this to any dry-cleaner on WhatsApp. They register themselves. You only approve.
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, background: "#f8fafc", padding: 10, borderRadius: 8, marginBottom: 10 }}>{text}</pre>
      <div style={{ display: "flex", gap: 8 }}>
        <a className="ff-btn ff-btn-primary" style={{ textDecoration: "none", textAlign: "center", flex: 1 }} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        <button className="ff-btn ff-btn-outline" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </section>
  );
}
