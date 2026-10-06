import SitePage from "@/components/SitePage";

export const metadata = { title: "Terms and conditions | Fresh Folds" };

export default function Page() {
  const h = { fontSize: 18, margin: "24px 0 8px" } as const;
  return (
    <SitePage title="Terms and conditions">
      <p>By using the Fresh Folds app or website you agree to these terms.</p>

      <h2 style={h}>1. What Fresh Folds is</h2>
      <p>Fresh Folds is a marketplace that connects customers with independent local dry-cleaners. The cleaning service itself is provided by the dry-cleaner you choose.</p>

      <h2 style={h}>2. Orders and prices</h2>
      <p>Prices are set by each dry-cleaner and shown in the app before you order. The final price may change after the dry-cleaner inspects your clothes (for example, for heavy stains or extra work). Any change is shown in the app.</p>

      <h2 style={h}>3. Payments</h2>
      <p>A 20% advance is paid by UPI when you place an order. The balance is paid when your clothes are ready. Offer codes, where valid, reduce the order total.</p>

      <h2 style={h}>4. Pickup and condition of clothes</h2>
      <p>The dry-cleaner may photograph your clothes at pickup to record their condition. Please remove valuables from pockets. Pre-existing damage, colour bleeding or shrinkage that cannot be avoided in normal cleaning is not covered.</p>

      <h2 style={h}>5. Loss or damage</h2>
      <p>If an item is lost or damaged while in the dry-cleaner's care, contact us within 48 hours of delivery. We will work with the dry-cleaner to resolve it fairly. Compensation, where agreed, is based on the item's age and condition.</p>

      <h2 style={h}>6. Your responsibilities</h2>
      <p>Provide a correct pickup address and a phone number where you can be reached. Be available at pickup and delivery.</p>

      <h2 style={h}>7. Changes</h2>
      <p>We may update these terms from time to time. The latest version is always on this page.</p>

      <h2 style={h}>8. Contact</h2>
      <p>Questions about these terms: see our <a style={{ color: "#2563eb" }} href="/contact">contact page</a>.</p>
    </SitePage>
  );
}
