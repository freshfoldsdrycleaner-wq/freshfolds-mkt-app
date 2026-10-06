import SitePage, { PHONE_DISPLAY, PHONE_TEL } from "@/components/SitePage";

export const metadata = { title: "Contact us | Fresh Folds" };

export default function Page() {
  return (
    <SitePage title="Contact us">
      <p>We are happy to help with your orders, payments or any questions.</p>
      <p style={{ marginTop: 12 }}>
        <b>Phone and WhatsApp:</b> <a style={{ color: "#2563eb" }} href={"tel:" + PHONE_TEL}>{PHONE_DISPLAY}</a>
        <br />
        <b>Hours:</b> Every day, 9 AM to 8 PM (IST)
        <br />
        <b>Location:</b> Delhi, India
      </p>
      <p style={{ marginTop: 12 }}>
        You can also tap the green WhatsApp button inside the Fresh Folds app to chat with us about an order.
      </p>
    </SitePage>
  );
}
