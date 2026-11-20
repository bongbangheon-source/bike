import { bicycleModes, type BicycleMode, type BicycleResult } from "../../bicycle-routes";
import type { Point } from "../../sample-data";
import { fetchJson, fromProvider, json, providerErrorCode } from "../_lib/provider";

type KakaoRoute = {
  status?: string;
  route?: {
    properties: { totalDistance: number; totalTime: number };
    legs: { steps: { path?: { points?: unknown[] } }[] }[];
  };
};

const pathErrors = new Set(["STARTNODES_NULL", "ENDNODES_NULL", "EQUAL_POINTS", "INVALID_REQUEST", "NO_RESULTS"]);

function coordinates(lat: unknown, lng: unknown): Point | null {
  if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

async function getBicycleRoute(mode: BicycleMode, start: Point, end: Point, key: string): Promise<BicycleResult> {
  const url = new URL("https://dapi.kakao.com/v2/routing/bicycle");
  url.search = new URLSearchParams({
    start_x: String(start[1]), start_y: String(start[0]),
    end_x: String(end[1]), end_y: String(end[0]), route_mode: mode,
    input_coord: "WGS84", output_coord: "WGS84",
  }).toString();

  try {
    const data = await fetchJson<KakaoRoute>(url, { Authorization: `KakaoAK ${key}` });
    if (data?.status !== "OK") {
      return { mode, error: data?.status && pathErrors.has(data.status) ? data.status : "INVALID_PROVIDER_RESPONSE" };
    }

    const route = data.route;
    const distanceMeters = route?.properties?.totalDistance;
    const durationSeconds = route?.properties?.totalTime;
    if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters) || distanceMeters < 0 ||
        typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0 ||
        !Array.isArray(route?.legs)) return { mode, error: "INVALID_PROVIDER_RESPONSE" };

    const segments: Point[][] = [];
    for (const leg of route.legs) {
      if (!Array.isArray(leg?.steps)) return { mode, error: "INVALID_PROVIDER_RESPONSE" };
      for (const step of leg.steps) {
        const points = step?.path?.points;
        if (!Array.isArray(points) || points.length < 2) continue;
        const segment: Point[] = [];
        for (const point of points) {
          const coordinate = Array.isArray(point) ? coordinates(point[1], point[0]) : null;
          if (!coordinate) return { mode, error: "INVALID_PROVIDER_RESPONSE" };
          segment.push(coordinate);
        }
        segments.push(segment);
      }
    }
    return segments.length ? { mode, distanceMeters, durationSeconds, segments } : { mode, error: "INVALID_PROVIDER_RESPONSE" };
  } catch (error) {
    if (error instanceof SyntaxError) return { mode, error: "INVALID_PROVIDER_RESPONSE" };
    return { mode, error: providerErrorCode(error) };
  }
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  function read(name: string) {
    const value = params.get(name);
    return value?.trim() ? Number(value) : NaN;
  }
  const start = coordinates(read("startLat"), read("startLng"));
  const end = coordinates(read("endLat"), read("endLng"));
  if (!start || !end) return json({ error: "INVALID_COORDINATES" }, 400);
  if (start[0] === end[0] && start[1] === end[1]) return json({ error: "EQUAL_POINTS" }, 400);

  return fromProvider("KAKAO_REST_API_KEY", async (key) => ({
    results: await Promise.all(bicycleModes.map((mode) => getBicycleRoute(mode, start, end, key))),
    fetchedAt: new Date().toISOString(),
  }));
}
