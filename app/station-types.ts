export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bikes: number;
};

export type NearbyStations = {
  source: "seoul";
  scope: "sample" | "full";
  fetchedAt: string;
  stations: (Station & { distanceMeters: number })[];
};
