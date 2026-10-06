import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Minimal Web Push sender (no payload). The push only wakes the phone; the
 * service worker (public/sw.js) then asks /api/push/latest what to show.
 * Needs VAPID_PUBLIC_KEY (base64url, 65 bytes) and VAPID_PRIVATE_KEY (base64url d).
 */
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function vapidHeader(endpoint: string): string | null {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  const pubBuf = Buffer.from(pub, "base64url");
  const key = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64u(pubBuf.subarray(1, 33)),
      y: b64u(pubBuf.subarray(33, 65)),
      d: priv,
    },
    format: "jwk",
  });
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64u(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: process.env.VAPID_SUBJECT || "https://freshfold-api-production-8165.up.railway.app",
    })
  );
  const sig = crypto.sign("sha256", Buffer.from(header + "." + payload), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${pub}`;
}

export async function sendPushToUser(userId: string): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        const auth = vapidHeader(s.endpoint);
        if (!auth) return;
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: { Authorization: auth, TTL: "86400", Urgency: "high" },
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 404 || res.status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        } else if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error("[push] failed", res.status);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[push] error", (e as Error).message);
      }
    })
  );
}
