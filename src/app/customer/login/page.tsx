"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, saveToken, ApiError } from "@/lib/apiClient";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/request-otp", "customer", {
        method: "POST",
        body: JSON.stringify({ phone, role: "CUSTOMER" }),
      });
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
      const data = await apiFetch<{ token: string; user: { role: string; name: string | null } }>(
        "/api/auth/verify-otp",
        "customer",
        { method: "POST", body: JSON.stringify({ phone, code }) }
      );
      if (data.user.role !== "CUSTOMER") {
        setError("This number is registered under a different account type.");
        return;
      }
      saveToken(data.token, "customer");
      if (!data.user.name) {
        setStage("name");
      } else {
        router.push("/customer");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function submitName() {
    setError("");
    if (!name.trim()) return;
    setLoading(true);
    try {
      await apiFetch("/api/users/me", "customer", { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      router.push("/customer");
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
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Fresh Fold</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>Your local dry-cleaning service, simplified.</p>

        {stage === "phone" && (
          <>
            <label className="ff-label">Mobile number</label>
            <input
              className="ff-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98xxxxxxxx"
              style={{ marginBottom: 12 }}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={loading || phone.length < 6} onClick={requestOtp}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </>
        )}

        {stage === "code" && (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Enter the 6-digit code sent to <strong>{phone}</strong>.
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
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button className="ff-btn ff-btn-outline" style={{ width: "100%" }} onClick={() => { setStage("phone"); setCode(""); setError(""); }}>
              Use a different number
            </button>
          </>
        )}

        {stage === "name" && (
          <>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>One more step — what should we call you?</p>
            <label className="ff-label">Full name</label>
            <input
              className="ff-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              style={{ marginBottom: 12 }}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="ff-btn ff-btn-primary" style={{ width: "100%" }} disabled={loading || !name.trim()} onClick={submitName}>
              {loading ? "Saving…" : "Continue"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
