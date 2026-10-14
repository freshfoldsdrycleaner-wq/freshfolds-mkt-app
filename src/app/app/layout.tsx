import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Fresh Folds",
  description: "Dry cleaning and laundry picked up from your door.",
  manifest: "/manifests/app",
};
export const viewport: Viewport = { themeColor: "#2563eb" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
