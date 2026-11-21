import type { NearbyStations, Station } from "../../station-types";
import { json, providerResponse } from "../_lib/provider";
import { loadStations } from "../_lib/seoul-stations";

function nearby(stations: Station[], lat: number, lng: number): NearbyStations["stations"] {
  const radians = Math.PI / 180;
  return stations.map((station) => {
    const a = Math.sin((station.lat - lat) * radians / 2) ** 2 +
      Math.cos(lat * radians) * Math.cos(station.lat * radians) *
      Math.sin((station.lng - lng) * radians / 2) ** 2;
    return { ...station, distanceMeters: 12_742_000 * Math.asin(Math.sqrt(Math.min(1, a))) };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 10)
    .map((station) => ({ ...station, distanceMeters: Math.round(station.distanceMeters) }));
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const searchNearby = latParam !== null || lngParam !== null;
  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (searchNearby && (!latParam?.trim() || !lngParam?.trim() ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    return json({ error: "INVALID_COORDINATES" }, 400);
  }

  const page = Number(params.get("page") ?? 1);
  const limit = Number(params.get("limit") ?? 100);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    return json({ error: "INVALID_PAGINATION" }, 400);
  }

  const key = process.env.SEOUL_OPEN_API_KEY?.trim();
  if (!key && !searchNearby) return json({ error: "PROVIDER_NOT_CONFIGURED" }, 503);
  const scope = key ? "full" : "sample";

  return providerResponse(async () => {
    const { stations, fetchedAt, stale } = await loadStations(scope, key || "sample");
    const meta = { source: "seoul", scope, fetchedAt, stale, total: stations.length };
    if (searchNearby) return { ...meta, stations: nearby(stations, lat, lng) };

    const first = (page - 1) * limit;
    return { ...meta, page, limit, stations: stations.slice(first, first + limit) };
  });
}
