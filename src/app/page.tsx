import { SiteFooter, PHONE_DISPLAY, PHONE_TEL } from "@/components/SitePage";

export const metadata = {
  title: "Fresh Folds: dry cleaning and laundry picked up from your door",
  description:
    "Fresh Folds connects you with trusted local dry-cleaners in Delhi. Order online, pickup from your door, pay a small advance, and get your clothes back clean.",
};

export default function Home() {
  const card = { padding: 16, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" } as const;
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 48px", lineHeight: 1.65, fontSize: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>FF</span>
        <b style={{ fontSize: 18 }}>Fresh Folds</b>
      </div>

      <h1 style={{ fontSize: 32, lineHeight: 1.2, margin: "0 0 12px" }}>Dry cleaning picked up from your door</h1>
      <p style={{ color: "#475569", marginBottom: 20 }}>
        Fresh Folds is an online marketplace that connects you with trusted local dry-cleaners in Delhi. Choose a
        dry-cleaner, pick your clothes and services, and the dry-cleaner collects them from you and brings them back clean.
      </p>
      <a
        href="/customer/login"
        style={{ display: "inline-block", background: "#2563eb", color: "#fff", padding: "12px 22px", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}
      >
        Order now
      </a>

      <h2 style={{ fontSize: 20, margin: "36px 0 12px" }}>How it works</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={card}><b>1. Choose a dry-cleaner.</b> See dry-cleaners near you, their services and prices.</div>
        <div style={card}><b>2. Place your order.</b> Add your items, enter your pickup address, and pay a 20% advance by UPI.</div>
        <div style={card}><b>3. We pick up and clean.</b> The dry-cleaner collects your clothes, notes their condition with photos, and cleans them.</div>
        <div style={card}><b>4. Delivered back.</b> Pay the balance when your clothes are ready and delivered.</div>
      </div>

      <h2 style={{ fontSize: 20, margin: "36px 0 12px" }}>Services and pricing</h2>
      <p style={{ color: "#475569" }}>
        We offer dry cleaning, laundry, ironing and home linen cleaning (blankets, curtains and more). Each dry-cleaner sets
        its own price per item, for example blanket cleaning from ₹249. You see the full price in the app before you place
        your order. Only a 20% advance is paid when you order; the balance is paid after your clothes are ready.
      </p>

      <h2 style={{ fontSize: 20, margin: "36px 0 12px" }}>Contact</h2>
      <p style={{ color: "#475569" }}>
        Questions about an order? Call or WhatsApp us on <a style={{ color: "#2563eb" }} href={"tel:" + PHONE_TEL}>{PHONE_DISPLAY}</a>.
        More details on our <a style={{ color: "#2563eb" }} href="/contact">contact page</a>.
      </p>

      <SiteFooter />
    </main>
  );
}
