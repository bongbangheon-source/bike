export type Point = readonly [lat: number, lng: number];

export const places = [
  { name: "여의도 한강공원", area: "영등포구 여의도동", point: [37.5285, 126.9335] },
  { name: "반포 한강공원", area: "서초구 반포동", point: [37.5099, 126.9942] },
  { name: "망원 한강공원", area: "마포구 망원동", point: [37.5521, 126.8958] },
  { name: "이촌 한강공원", area: "용산구 이촌동", point: [37.5175, 126.9704] },
] as const satisfies readonly { name: string; area: string; point: Point }[];
