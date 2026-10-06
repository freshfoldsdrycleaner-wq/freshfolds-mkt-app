import type { ReactNode } from "react";

export const PHONE_DISPLAY = "+91 88474 98061";
export const PHONE_TEL = "+918847498061";

export default function SitePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 48px", lineHeight: 1.65, fontSize: 15 }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#0f172a", marginBottom: 24 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>FF</span>
        <b>Fresh Folds</b>
      </a>
      <h1 style={{ fontSize: 26, margin: "0 0 16px" }}>{title}</h1>
      {children}
      <SiteFooter />
    </main>
  );
}

export function SiteFooter() {
  const link = { color: "#2563eb", textDecoration: "none" } as const;
  return (
    <footer style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #e2e8f0", fontSize: 13, color: "#64748b" }}>
      <p style={{ marginBottom: 8 }}>
        <a style={link} href="/contact">Contact us</a> · <a style={link} href="/terms">Terms and conditions</a> ·{" "}
        <a style={link} href="/privacy">Privacy policy</a> · <a style={link} href="/refund-policy">Cancellation and refund policy</a>
      </p>
      <p>© Fresh Folds. Delhi, India.</p>
    </footer>
  );
}
