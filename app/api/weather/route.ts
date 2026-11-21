import { checkDataGoKrAccess, fetchJson, fromProvider, json, numberValue, ProviderDataError } from "../_lib/provider";
import { forecastCycle, forecastGrid, forecastTimestamp, type DepartureForecast } from "./forecast";

type ForecastItem = {
  baseDate: string; baseTime: string; fcstDate: string; fcstTime: string;
  category: string; fcstValue: string;
};
type KmaResponse = {
  response?: {
    header?: { resultCode: string };
    body?: { items?: { item?: ForecastItem[] } };
  };
};

const endpoint = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

async function forecastItems(serviceKey: string, grid: DepartureForecast["grid"], cycle: ReturnType<typeof forecastCycle>) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    serviceKey, dataType: "JSON", pageNo: "1", numOfRows: "100",
    base_date: cycle.date, base_time: cycle.time, nx: String(grid.nx), ny: String(grid.ny),
  }).toString();
  const { response } = await fetchJson<KmaResponse>(url);
  const code = response?.header?.resultCode;
  checkDataGoKrAccess(code);
  if (code === "03") return [];
  const items = response?.body?.items?.item;
  if (code !== "00" || !Array.isArray(items)) throw new Error("Invalid KMA forecast response");
  return items;
}

function nextForecast(items: ForecastItem[], now: number, grid: DepartureForecast["grid"]): DepartureForecast | undefined {
  const byTime = new Map<string, { forecastAt: string; issuedAt: string; tmp?: string; pop?: string; wind?: string }>();
  for (const item of items) {
    if (item.category !== "TMP" && item.category !== "POP" && item.category !== "WSD") continue;
    const forecastAt = forecastTimestamp(item.fcstDate, item.fcstTime);
    const validAt = Date.parse(forecastAt);
    if (!Number.isFinite(validAt) || validAt < now) continue;
    const issuedAt = forecastTimestamp(item.baseDate, item.baseTime);
    if (!Number.isFinite(Date.parse(issuedAt))) continue;
    const key = `${forecastAt}/${issuedAt}`;
    const entry = byTime.get(key) ?? { forecastAt, issuedAt };
    if (item.category === "TMP") entry.tmp = item.fcstValue;
    else if (item.category === "POP") entry.pop = item.fcstValue;
    else entry.wind = item.fcstValue;
    byTime.set(key, entry);
  }

  const earliest = [...byTime.values()].filter((entry) => entry.tmp !== undefined && entry.pop !== undefined)
    .sort((a, b) => a.forecastAt.localeCompare(b.forecastAt))[0];
  if (!earliest) return undefined;
  const temperatureC = numberValue(earliest.tmp);
  const precipitationProbability = numberValue(earliest.pop);
  if (precipitationProbability < 0 || precipitationProbability > 100) throw new Error("Invalid rain probability");
  const windSpeed = Number(earliest.wind?.trim() || NaN);
  const windSpeedMps = Number.isFinite(windSpeed) && windSpeed >= 0 ? windSpeed : undefined;
  return { grid, issuedAt: earliest.issuedAt, forecastAt: earliest.forecastAt, temperatureC, precipitationProbability, windSpeedMps };
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const latParam = params.get("lat")?.trim();
  const lngParam = params.get("lng")?.trim();
  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (!latParam || !lngParam || !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) >= 90 || Math.abs(lng) > 180) return json({ error: "INVALID_COORDINATES" }, 400);

  const grid = forecastGrid([lat, lng]);
  if (grid.nx < 1 || grid.nx > 149 || grid.ny < 1 || grid.ny > 253) {
    return json({ error: "OUTSIDE_FORECAST_GRID" }, 400);
  }

  return fromProvider("DATA_GO_KR_API_KEY", async (key) => {
    const serviceKey = key.includes("%") ? decodeURIComponent(key) : key;
    const now = Date.now();
    for (const previous of [false, true]) {
      const items = await forecastItems(serviceKey, grid, forecastCycle(now, previous));
      const forecast = nextForecast(items, now, grid);
      if (forecast) return forecast;
    }
    throw new ProviderDataError("NO_RESULTS");
  });
}
