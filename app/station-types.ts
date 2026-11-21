export const stationSearchRadii = [500, 1000, 2000, 5000] as const;

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bikes: number;
  racks: number;
};

export type NearbyStations = {
  source: "seoul";
  scope: "sample" | "full";
  fetchedAt: string;
  stale: boolean;
  total: number;
  stations: (Station & { distanceMeters: number })[];
};
