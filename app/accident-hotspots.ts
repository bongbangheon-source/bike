import type { BicycleRoute } from "./bicycle-routes";
import type { Point } from "./sample-data";

export const nearRouteMeters = 200;

export type Hotspot = {
  id: string;
  name: string;
  district: string;
  point: Point;
  crashes: number;
};

export type AccidentHotspots = { year: number; hotspots: Hotspot[] };

function distanceToRoute([lat, lng]: Point, route: BicycleRoute) {
  // Local projection centered at the hotspot, accurate for Seoul-scale routes.
  const latScale = Math.PI * 6_371_000 / 180;
  const lngScale = latScale * Math.cos(lat * Math.PI / 180);
  let closestSquared = Infinity;

  for (const segment of route.segments) {
    for (let index = 1; index < segment.length; index++) {
      const [aLat, aLng] = segment[index - 1];
      const [bLat, bLng] = segment[index];
      const x = (aLng - lng) * lngScale;
      const y = (aLat - lat) * latScale;
      const dx = (bLng - aLng) * lngScale;
      const dy = (bLat - aLat) * latScale;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
      closestSquared = Math.min(closestSquared, (x + t * dx) ** 2 + (y + t * dy) ** 2);
    }
  }

  return Math.sqrt(closestSquared);
}

export function hotspotsAlongRoute(hotspots: Hotspot[], route: BicycleRoute) {
  return hotspots.map((hotspot) => ({ ...hotspot, distance: distanceToRoute(hotspot.point, route) }))
    .filter(({ distance }) => distance <= nearRouteMeters)
    .sort((a, b) => a.distance - b.distance);
}
