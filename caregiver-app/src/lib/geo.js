/** Get the device position once. Resolves to {lat,lng} or null if denied/unavailable. */
export function getPosition(timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    )
  })
}

/** Haversine distance in meters (mirrors the database function). */
export function distanceM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return null
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)))
}
