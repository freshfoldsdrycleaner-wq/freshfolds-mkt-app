"use client";

/**
 * Thin browser-side fetch helper for the admin console (and, later, the
 * customer/dry-cleaner UIs). The backend is stateless JWT-bearer auth, so
 * the token just lives in localStorage on this device — same "stay signed
 * in" pattern used everywhere else in this project.
 */

export type AppArea = "admin" | "dryclean" | "customer";

function tokenKey(app: AppArea) {
  return `freshfold_${app}_token`;
}

export function saveToken(token: string, app: AppArea) {
  try {
    localStorage.setItem(tokenKey(app), token);
  } catch {}
}

export function getToken(app: AppArea): string | null {
  try {
    return localStorage.getItem(tokenKey(app));
  } catch {
    return null;
  }
}

export function clearToken(app: AppArea) {
  try {
    localStorage.removeItem(tokenKey(app));
  } catch {}
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(path: string, app: AppArea, options: RequestInit = {}): Promise<T> {
  const token = getToken(app);
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = body?.error && typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}
