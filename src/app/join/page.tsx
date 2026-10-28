export const metadata = { title: "Join Fresh Folds as a dry-cleaner" };

const points = [
  ["Naye customers", "Aas-paas ke log app se order karte hain. Aapko advertisement nahi karna."],
  ["Advance payment safe", "Customer advance app se deta hai. Aapka hissa seedha aapko milta hai."],
  ["Sab kuch aapke control mein", "Apni dukaan ON/OFF karein, daily order limit aur apne offers khud set karein."],
  ["Free register", "Order aane par hi chhota commission. Koi monthly fee nahi."],
];

export default function JoinPage() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px 60px" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 16 }}>FF</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Apni dry-cleaning dukaan Fresh Folds par laayein</h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>Register karna free hai. 5 minute lagte hain.</p>
      {points.map(([t, d]) => (
        <div key={t} className="ff-card" style={{ padding: 14, marginBottom: 10 }}>
          <p style={{ fontWeight: 700, marginBottom: 2 }}>{t}</p>
          <p style={{ fontSize: 13, color: "#475569" }}>{d}</p>
        </div>
      ))}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px" }}>Kaise shuru karein</h2>
      <ol style={{ fontSize: 14, color: "#334155", paddingLeft: 20, lineHeight: 1.8, marginBottom: 24 }}>
        <li>Neeche button dabayein aur mobile number + email dalein.</li>
        <li>Email par aaya 6-digit code dalein.</li>
        <li>Dukaan ka naam, address aur location dalein (dukaan par khade hokar).</li>
        <li>Apne prices bharein. Hum check karke aapko live kar denge.</li>
      </ol>
      <a href="/dryclean/login" className="ff-btn ff-btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none", padding: 14 }}>Register / Login</a>
    </main>
  );
}
