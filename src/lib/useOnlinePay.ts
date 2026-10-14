"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

let cached: boolean | null = null;

/** true once online (Razorpay) payment is switched on; null while loading. */
export function useOnlinePay(): boolean | null {
  const [on, setOn] = useState<boolean | null>(cached);
  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    apiFetch<{ enabled: boolean }>("/api/payments/razorpay/config", "customer")
      .then((d) => {
        cached = !!d.enabled;
        if (alive) setOn(cached);
      })
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}
