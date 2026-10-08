const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return deg * Math.PI / 180;
}

// Great-circle (haversine) distance between two WGS84 coordinates, in meters.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export = distanceMeters;
