/**
 * Section 34/35: distance for "nearby dry-cleaners near me" using the
 * haversine formula — no paid Maps/Geocoding API required for the MVP.
 * "Navigate" buttons in the UI should deep-link to the user's own map app
 * instead of building in-app turn-by-turn navigation.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 10) / 10; // one decimal place
}

export function estimateMinutesFromKm(km: number): number {
  // Rough same-city delivery estimate: ~20 min base + ~4 min/km.
  return Math.round(20 + km * 4);
}
