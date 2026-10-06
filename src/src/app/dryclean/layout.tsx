import type { Metadata } from "next";
import type { ReactNode } from "react";
import WhatsAppButton from "@/components/WhatsAppButton";

export const metadata: Metadata = { manifest: "/manifests/dryclean" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <WhatsAppButton />
    </>
  );
}