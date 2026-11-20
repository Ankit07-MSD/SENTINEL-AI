/**
 * Haversine formula: calculates straight-line (great-circle) distance in km
 * between two lat/lng points on Earth. Used as the base distance metric
 * before applying traffic/route factors (Phase 8 will refine this further
 * with actual road-network routing).
 */
const DEFAULT_EMERGENCY_SPEED_KMH = 35;

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.min(1,
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  );
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** ETA for off-network connector/fallback legs using the documented demo speed. */
function estimateEtaMinutes(distanceKm, avgSpeedKmh = DEFAULT_EMERGENCY_SPEED_KMH) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(avgSpeedKmh) || avgSpeedKmh <= 0) {
    return Infinity;
  }
  return (distanceKm / avgSpeedKmh) * 60;
}

function isValidCoordinate(latitude, longitude) {
  if (latitude === null || latitude === undefined || latitude === "" || typeof latitude === "boolean" ||
      longitude === null || longitude === undefined || longitude === "" || typeof longitude === "boolean") {
    return false;
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

module.exports = { haversineKm, estimateEtaMinutes, isValidCoordinate, DEFAULT_EMERGENCY_SPEED_KMH };
