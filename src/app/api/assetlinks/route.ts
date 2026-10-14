import { NextResponse } from "next/server";

/**
 * Serves /.well-known/assetlinks.json (see next.config.js). It proves to Android that the
 * Play Store app owns this website, so the app opens full-screen with no browser bar.
 * ANDROID_SHA256_FINGERPRINTS = comma-separated SHA-256 fingerprints (Play app signing + upload key).
 */
export async function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const body = fingerprints.length
    ? ["com.freshfolds.app", "com.freshfolds.admin"].map((pkg) => ({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
      }))
    : [];
  return new NextResponse(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
}
