/** The front screen of the Play Store app: pick Customer or Dry-cleaner. */
export default function AppChooser() {
  const btn = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "18px 18px",
    borderRadius: 16,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 17,
    boxSizing: "border-box",
  } as const;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "32px 20px",
        maxWidth: 440,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 22,
            background: "linear-gradient(135deg,#2563eb,#0a6f7a)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 34,
            margin: "0 auto 16px",
            boxShadow: "0 10px 24px rgba(37,99,235,.3)",
          }}
        >
          FF
        </div>
        <h1 style={{ margin: 0, fontSize: 30 }}>Fresh Folds</h1>
        <p style={{ color: "#475569", margin: "8px 0 0", fontSize: 15 }}>Dry cleaning picked up from your door</p>
      </div>

      <a href="/customer" style={{ ...btn, background: "#2563eb", color: "#fff", marginBottom: 14 }}>
        <span style={{ fontSize: 28 }}>👕</span>
        <span style={{ flex: 1 }}>
          Customer login
          <span style={{ display: "block", fontWeight: 400, fontSize: 13, opacity: 0.9 }}>Order dry cleaning</span>
        </span>
        <span aria-hidden>›</span>
      </a>
      <a href="/dryclean" style={{ ...btn, background: "#fff", color: "#0f172a", border: "2px solid #2563eb" }}>
        <span style={{ fontSize: 28 }}>🧺</span>
        <span style={{ flex: 1 }}>
          Dry-cleaner login
          <span style={{ display: "block", fontWeight: 400, fontSize: 13, color: "#475569" }}>Manage your shop and orders</span>
        </span>
        <span aria-hidden>›</span>
      </a>

      <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 32 }}>
        <a href="/privacy" style={{ color: "#64748b" }}>Privacy</a> · <a href="/terms" style={{ color: "#64748b" }}>Terms</a> ·{" "}
        <a href="/contact" style={{ color: "#64748b" }}>Contact</a>
      </p>
    </main>
  );
}
