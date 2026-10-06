import { NextResponse } from "next/server";

const APPS: Record<string, { name: string; start: string }> = {
  customer: { name: "Fresh Fold", start: "/customer/login" },
  dryclean: { name: "Fresh Fold Partner", start: "/dryclean/login" },
  admin: { name: "Fresh Fold Admin", start: "/admin/login" },
};

export async function GET(
  _req: Request,
  { params }: { params: { app: string } }
) {
  const app = APPS[params.app] ?? APPS.customer;
  const body = {
    id: app.start,
    name: app.name,
    short_name: app.name,
    description: "Your local dry-cleaning service, simplified.",
    start_url: app.start,
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}