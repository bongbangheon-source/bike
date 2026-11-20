import type { Point } from "./sample-data";

export const bicycleModes = ["BIKE_ONLY", "SHORTEST"] as const;
export type BicycleMode = typeof bicycleModes[number];

export const bicycleStyles = {
  BIKE_ONLY: { label: "자전거도로 우선", color: "#287852", dashed: false },
  SHORTEST: { label: "최단 경로", color: "#4645af", dashed: true },
} satisfies Record<BicycleMode, { label: string; color: string; dashed: boolean }>;

export type BicycleRoute = {
  mode: BicycleMode;
  distanceMeters: number;
  durationSeconds: number;
  segments: Point[][];
};

export type BicycleResult = BicycleRoute | { mode: BicycleMode; error: string };

const errorMessages: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED: "카카오 REST API 키가 설정되지 않았습니다.",
  AUTH_FAILED: "카카오 REST API 키 인증에 실패했습니다.",
  FORBIDDEN: "이 카카오 앱에 자전거 경로 조회 권한이 없습니다.",
  RATE_LIMITED: "카카오 API 호출 한도를 초과했습니다.",
  PROVIDER_TIMEOUT: "카카오 응답 시간이 초과됐습니다.",
  PROVIDER_UNAVAILABLE: "카카오 경로 서버에 연결하지 못했습니다.",
  INVALID_PROVIDER_RESPONSE: "카카오 응답에 표시할 경로 데이터가 없습니다.",
  STARTNODES_NULL: "이 대여소 주변에서 경로 시작점을 찾지 못했습니다.",
  ENDNODES_NULL: "목적지 주변에서 경로 도착점을 찾지 못했습니다.",
  EQUAL_POINTS: "출발 대여소와 목적지가 같은 위치입니다.",
  INVALID_REQUEST: "카카오가 출발지 또는 목적지 요청을 거부했습니다.",
  INVALID_COORDINATES: "출발지 또는 목적지 좌표가 올바르지 않습니다.",
  NO_RESULTS: "카카오가 이 구간의 자전거 경로를 찾지 못했습니다.",
};

export function bicycleErrorMessage(code: string) {
  return Object.hasOwn(errorMessages, code) ? errorMessages[code] : "카카오 자전거 경로를 조회하지 못했습니다.";
}
