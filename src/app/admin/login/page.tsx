"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, saveToken, ApiError } from "@/lib/apiClient";

export default function AdminLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/request-otp", "admin", { method: "POST", body: JSON.stringify({ email }) });
      setStage("code");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: { role: string } }>("/api/auth/verify-otp", "admin", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      if (data.user.role !== "FRESHFOLD_ADMIN") {
        setError("This account isn't a Fresh Fold admin account.");
        return;
      }
      saveToken(data.token, "admin");
      router.push("/admin");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="ff-card" style={{ width: 380, padding: 32 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 16 }}>
          FF
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Fresh Fold Admin</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>Sign in with your admin email.</p>

        {stage === "email" ? (
          <>
            <label className="ff-label">Email address</label>
            <input
              className="ff-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@freshfold.com"
              style={{ marginBottom: 12 }}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={loading || !email} onClick={requestOtp}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Enter the 6-digit code sent to <strong>{email}</strong>.
            </p>
            <input
              className="ff-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              style={{ marginBottom: 12, letterSpacing: 4, textAlign: "center", fontSize: 18 }}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="ff-btn ff-btn-primary" style={{ width: "100%", marginBottom: 8 }} disabled={loading || code.length !== 6} onClick={verifyOtp}>
              {loading ? "Verifying…" : "Verify & sign in"}
            </button>
            <button className="ff-btn ff-btn-outline" style={{ width: "100%" }} onClick={() => { setStage("email"); setCode(""); setError(""); }}>
              Use a different email
            </button>
          </>
        )}
      </div>
    </main>
  );
}
