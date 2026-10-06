import SitePage from "@/components/SitePage";

export const metadata = { title: "Cancellation and refund policy | Fresh Folds" };

export default function Page() {
  const h = { fontSize: 18, margin: "24px 0 8px" } as const;
  return (
    <SitePage title="Cancellation and refund policy">
      <h2 style={h}>Cancelling an order</h2>
      <p>You can cancel an order in the app at any time before your clothes are picked up. Open the order and tap "Cancel order".</p>

      <h2 style={h}>Refund of your advance</h2>
      <p>If you cancel before pickup, or if the dry-cleaner cancels the order, your 20% advance is refunded in full to the same UPI account or bank account it was paid from, within 5 to 7 working days.</p>

      <h2 style={h}>After pickup</h2>
      <p>Once your clothes have been picked up and cleaning has started, the advance is not refundable, because the work has begun. If you are unhappy with the result, contact us within 48 hours of delivery and we will arrange a re-clean or a fair resolution with the dry-cleaner.</p>

      <h2 style={h}>Price changes</h2>
      <p>If the price changes after inspection and you do not agree, you can decline before cleaning begins. Your clothes will be returned and your advance refunded, less any agreed inspection or pickup charge shown in the app.</p>

      <h2 style={h}>How to ask for a refund</h2>
      <p>Call or WhatsApp us (see our <a style={{ color: "#2563eb" }} href="/contact">contact page</a>) with your order number.</p>
    </SitePage>
  );
}
