import SitePage, { PHONE_DISPLAY } from "@/components/SitePage";

export const metadata = { title: "Delete your account | Fresh Folds" };

export default function Page() {
  const h = { fontSize: 18, margin: "24px 0 8px" } as const;
  return (
    <SitePage title="Delete your account">
      <h2 style={h}>In the app</h2>
      <p>Open the Fresh Folds customer app, go to the Profile tab and tap "Delete my account". You will be asked to confirm.</p>

      <h2 style={h}>What is deleted</h2>
      <p>Your name, phone number and email are erased and you can no longer log in. Your saved notification settings are removed.</p>

      <h2 style={h}>What we keep</h2>
      <p>Past orders are kept without your personal details, because dry-cleaners and Fresh Folds need them for accounting and tax records. This is not linked back to you.</p>

      <h2 style={h}>If you cannot use the app</h2>
      <p>Call or WhatsApp us on {PHONE_DISPLAY} from your registered number and we will delete your account within 7 days.</p>
      <p>If you have an order in progress, please delete your account after it is delivered or cancelled.</p>
    </SitePage>
  );
}
