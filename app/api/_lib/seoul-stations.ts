import "server-only";
import { get } from "node:http";
import type { NearbyStations, Station } from "../../station-types";
import { numberValue, ProviderDataError, providerErrorCode, ProviderHttpError, textValue } from "./provider";

type Row = {
  stationId: string;
  stationName: string;
  parkingBikeTotCnt: string;
  rackTotCnt: string;
  stationLatitude: string;
  stationLongitude: string;
};
type BikeListResponse = {
  RESULT?: { CODE: string };
  rentBikeStatus?: { RESULT?: { CODE: string }; row?: Row[] };
};

const batchSize = 1000;
const freshMs = 60_000;
const staleMs = 15 * 60_000;
const retryMs = 15_000;
type Scope = NearbyStations["scope"];
type Snapshot = { stations: Station[]; fetchedAt: string; fetchedMs: number };
type CacheEntry = { snapshot?: Snapshot; pending?: Promise<Snapshot>; retryAfter?: number };
const cache: Record<Scope, CacheEntry> = { sample: {}, full: {} };

function requestPage(key: string, first: number, last: number): Promise<BikeListResponse> {
  return new Promise((resolve, reject) => {
    const timeout = AbortSignal.timeout(5_000);
    // Keep credential-bearing paths out of Next.js fetch tracing and error messages.
    const request = get({
      hostname: "openapi.seoul.go.kr", port: 8088,
      path: `/${encodeURIComponent(key)}/json/bikeList/${first}/${last}/`,
      signal: timeout, headers: { Accept: "application/json" },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new ProviderHttpError(response.statusCode ?? 502));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (part: string) => {
        body += part;
        if (body.length > 2_000_000) {
          reject(new Error("Seoul response exceeded size limit"));
          response.destroy();
        }
      });
      response.on("error", () => reject(timeout.aborted ? timeout.reason : new Error("Seoul response interrupted")));
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid Seoul response"));
        }
      });
    });
    request.on("error", () => reject(timeout.aborted ? timeout.reason : new Error("Seoul connection failed")));
  });
}

function nonNegativeInt(value: unknown) {
  const number = numberValue(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Invalid Seoul count");
  return number;
}

function normalize(row: Row): Station | null {
  const lat = numberValue(row.stationLatitude);
  const lng = numberValue(row.stationLongitude);
  if (!lat || !lng || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const id = textValue(row.stationId).trim();
  if (!id) throw new Error("Missing Seoul station ID");
  return {
    id, name: textValue(row.stationName).trim(), lat, lng,
    bikes: nonNegativeInt(row.parkingBikeTotCnt),
    racks: nonNegativeInt(row.rackTotCnt),
  };
}

async function loadSnapshot(scope: Scope, key: string): Promise<Snapshot> {
  const stations = new Map<string, Station>();
  const size = scope === "sample" ? 5 : batchSize;

  // Bound pagination defensively. Reaching this limit is a failed refresh, not a partial snapshot.
  for (let first = 1; first <= 10_001; first += size) {
    const data = await requestPage(key, first, first + size - 1);
    const result = data?.rentBikeStatus;
    const code = result?.RESULT?.CODE ?? data?.RESULT?.CODE;
    if (code === "INFO-100") throw new ProviderDataError("AUTH_FAILED");
    if (code === "INFO-200") return snapshot(stations);
    if (code !== "INFO-000" || !Array.isArray(result?.row) || result.row.length > size) {
      throw new Error("Invalid Seoul bikeList response");
    }

    const before = stations.size;
    for (const row of result.row) {
      const station = normalize(row);
      if (station) stations.set(station.id, station);
    }
    if (result.row.length < size || scope === "sample") return snapshot(stations);
    if (stations.size === before) throw new Error("Seoul pagination did not advance");
  }

  throw new Error("Seoul pagination limit reached");
}

function snapshot(stations: Map<string, Station>): Snapshot {
  const now = Date.now();
  return { stations: [...stations.values()], fetchedAt: new Date(now).toISOString(), fetchedMs: now };
}

export async function loadStations(scope: Scope, key: string) {
  const entry = cache[scope];
  const now = Date.now();
  const last = entry.snapshot;
  if (last && now - last.fetchedMs < freshMs) return { ...last, stale: false };
  if (last && now < (entry.retryAfter ?? 0) && now - last.fetchedMs < staleMs) return { ...last, stale: true };

  const pending = entry.pending ??= loadSnapshot(scope, key);
  try {
    const latest = await pending;
    entry.snapshot = latest;
    entry.retryAfter = undefined;
    return { ...latest, stale: false };
  } catch (error) {
    const code = providerErrorCode(error);
    if (code === "AUTH_FAILED" || code === "FORBIDDEN") {
      entry.snapshot = undefined;
      entry.retryAfter = undefined;
    } else if (last && Date.now() - last.fetchedMs < staleMs) {
      entry.retryAfter = Date.now() + retryMs;
      return { ...last, stale: true };
    }
    throw error;
  } finally {
    if (entry.pending === pending) entry.pending = undefined;
  }
}
