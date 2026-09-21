"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, saveToken, ApiError } from "@/lib/apiClient";

export default function DryCleanerLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/request-otp", "dryclean", {
        method: "POST",
        body: JSON.stringify({ phone, role: "DRYCLEANER_ADMIN" }),
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
      const data = await apiFetch<{ token: string; user: { role: string } }>("/api/auth/verify-otp", "dryclean", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      if (data.user.role !== "DRYCLEANER_ADMIN") {
        setError("This number is registered under a different account type.");
        return;
      }
      saveToken(data.token, "dryclean");
      router.push("/dryclean");
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
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Fresh Fold for Business</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
          Sign in — or a new number registers you as a new dry-cleaner account.
        </p>

        {stage === "phone" ? (
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
        ) : (
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
      </div>
    </main>
  );
}
