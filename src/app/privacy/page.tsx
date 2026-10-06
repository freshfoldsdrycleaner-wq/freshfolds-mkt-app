import SitePage from "@/components/SitePage";

export const metadata = { title: "Privacy policy | Fresh Folds" };

export default function Page() {
  const h = { fontSize: 18, margin: "24px 0 8px" } as const;
  return (
    <SitePage title="Privacy policy">
      <p>This policy explains what information Fresh Folds collects and how it is used.</p>

      <h2 style={h}>Information we collect</h2>
      <p>Your name, phone number and email address when you sign in; your pickup and delivery addresses and shared location when you place an order; photos of your clothes taken at pickup; and your order and payment history.</p>

      <h2 style={h}>How we use it</h2>
      <p>To run your orders, let the dry-cleaner contact you and reach your address, send sign-in codes and order updates, handle payments and support requests, and keep the service safe.</p>

      <h2 style={h}>Who we share it with</h2>
      <p>Your name, phone number, address and order details are shared with the dry-cleaner handling your order. Payments are processed by our payment partner. We do not sell your personal information.</p>

      <h2 style={h}>Payments</h2>
      <p>We do not store your card or bank details. Payments are handled securely by our payment partner or through your UPI app.</p>

      <h2 style={h}>Location</h2>
      <p>If you tap "Share my current location", we use your location only to fill in your pickup address. You can type an address instead.</p>

      <h2 style={h}>Your choices</h2>
      <p>You can ask us to correct or delete your information by contacting us. Some records, such as completed orders and payments, may need to be kept for legal and accounting reasons.</p>

      <h2 style={h}>Contact</h2>
      <p>For privacy questions, see our <a style={{ color: "#2563eb" }} href="/contact">contact page</a>.</p>
    </SitePage>
  );
}
