import { NextResponse } from "next/server";

// Each app gets its own scope so the three installed apps never capture
// each other's links (a shared "/" scope made the wrong app open).
const APPS: Record<string, { name: string; start: string; scope: string }> = {
  customer: { name: "Fresh Fold", start: "/customer/login", scope: "/customer/" },
  dryclean: { name: "Fresh Fold Partner", start: "/dryclean/login", scope: "/dryclean/" },
  admin: { name: "Fresh Fold Admin", start: "/admin/login", scope: "/admin/" },
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
    scope: app.scope,
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