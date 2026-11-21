import type { Point } from "../../sample-data";

export type DepartureForecast = {
  grid: { nx: number; ny: number };
  issuedAt: string;
  forecastAt: string;
  temperatureC: number;
  precipitationProbability: number;
  windSpeedMps?: number;
};

export function forecastGrid([lat, lng]: Point) {
  // KMA DFS: 5 km Lambert conformal conic grid.
  const radians = Math.PI / 180;
  const firstParallel = 30 * radians;
  const secondParallel = 60 * radians;
  const tangent = (latitude: number) => Math.tan(Math.PI / 4 + latitude / 2);
  const cone = Math.log(Math.cos(firstParallel) / Math.cos(secondParallel)) /
    Math.log(tangent(secondParallel) / tangent(firstParallel));
  const scale = (6371.00877 / 5) * Math.cos(firstParallel) * tangent(firstParallel) ** cone / cone;
  const originRadius = scale / tangent(38 * radians) ** cone;
  const radius = scale / tangent(lat * radians) ** cone;
  const angle = (lng - 126) * radians * cone;
  return {
    nx: Math.round(43 + radius * Math.sin(angle)),
    ny: Math.round(136 + originRadius - radius * Math.cos(angle)),
  };
}

export function forecastCycle(now: number, previous = false) {
  // API data can arrive after the nominal KST issuance.
  const local = new Date(now + 9 * 3_600_000 - 15 * 60_000 - (previous ? 3 * 3_600_000 : 0));
  local.setUTCMinutes(0, 0, 0);
  local.setUTCHours(local.getUTCHours() - (local.getUTCHours() + 1) % 3);
  const stamp = local.toISOString();
  return { date: stamp.slice(0, 10).replaceAll("-", ""), time: stamp.slice(11, 13) + "00" };
}

export function forecastTimestamp(date: string, time: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time.slice(0, 2)}:${time.slice(2)}:00+09:00`;
}
