import type { NearbyStations, Station } from "../../station-types";
import { fetchJson, fromProvider, json, numberValue, ProviderDataError, providerResponse, textValue } from "../_lib/provider";

type SeoulStations = {
  RESULT?: { CODE: string };
  rentBikeStatus?: {
    RESULT?: { CODE: string };
    row?: {
      stationId: string;
      stationName: string;
      parkingBikeTotCnt: string;
      stationLatitude: string;
      stationLongitude: string;
    }[];
  };
};

// The public Seoul sample URL contains no private credentials.
const sampleUrl = new URL("http://openapi.seoul.go.kr:8088/sample/json/bikeList/1/5/");
const batchSize = 1000;

async function readStations(url: URL) {
  const result = await fetchJson<SeoulStations>(url);
  const status = result.rentBikeStatus;
  const code = status?.RESULT?.CODE ?? result.RESULT?.CODE;
  if (code === "INFO-100") throw new ProviderDataError("AUTH_FAILED");
  if (code === "INFO-200") return { count: 0, stations: [] };
  if (code !== "INFO-000" || !Array.isArray(status?.row)) {
    throw new Error("Invalid Seoul API response");
  }

  const stations = status.row.map((row) => ({
    id: textValue(row.stationId),
    name: textValue(row.stationName),
    bikes: numberValue(row.parkingBikeTotCnt),
    lat: numberValue(row.stationLatitude),
    lng: numberValue(row.stationLongitude),
  })).filter(({ lat, lng, bikes }) =>
    lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    Number.isInteger(bikes) && bikes >= 0,
  );

  return { count: status.row.length, stations };
}

function nearby(stations: Station[], lat: number, lng: number, scope: NearbyStations["scope"]): NearbyStations {
  const radians = Math.PI / 180;
  return {
    source: "seoul",
    scope,
    fetchedAt: new Date().toISOString(),
    stations: stations.map((station) => {
      const a = Math.sin((station.lat - lat) * radians / 2) ** 2 +
        Math.cos(lat * radians) * Math.cos(station.lat * radians) *
        Math.sin((station.lng - lng) * radians / 2) ** 2;
      return { ...station, distanceMeters: 12_742_000 * Math.asin(Math.sqrt(Math.min(1, a))) };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 10)
      .map((station) => ({ ...station, distanceMeters: Math.round(station.distanceMeters) })),
  };
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

  const origin = process.env.SEOUL_API_HTTPS_ORIGIN?.trim();
  if (!origin) {
    if (!searchNearby) return json({ error: "SEOUL_HTTPS_ORIGIN_REQUIRED" }, 503);
    return providerResponse(async () => nearby((await readStations(sampleUrl)).stations, lat, lng, "sample"));
  }

  let base: URL;
  try {
    base = new URL(origin);
    if (base.protocol !== "https:" || base.origin !== origin.replace(/\/$/, "")) {
      return json({ error: "INVALID_SEOUL_HTTPS_ORIGIN" }, 503);
    }
  } catch {
    return json({ error: "INVALID_SEOUL_HTTPS_ORIGIN" }, 503);
  }

  return fromProvider("SEOUL_API_KEY", async (key) => {
    const readBatch = (first: number, size: number) =>
      readStations(new URL(`/${encodeURIComponent(key)}/json/bikeList/${first}/${first + size - 1}/`, base));

    if (!searchNearby) {
      const { stations } = await readBatch((page - 1) * limit + 1, limit);
      return { source: "seoul", page, limit, fetchedAt: new Date().toISOString(), stations };
    }

    const stations = new Map<string, Station>();
    for (let first = 1; first <= 10000; first += batchSize) {
      const batch = await readBatch(first, batchSize);
      for (const station of batch.stations) stations.set(station.id, station);
      if (batch.count < batchSize) return nearby([...stations.values()], lat, lng, "full");
    }
    throw new Error("Incomplete Seoul station inventory");
  });
}
