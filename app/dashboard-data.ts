export function formatDistance(meters: number) {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

export type DataResult<T> = { data: T; error?: never } | { data?: never; error: string };

export async function loadData<T>(url: string, signal: AbortSignal): Promise<DataResult<T>> {
  try {
    const response = await fetch(url, { signal });
    const body = await response.json();
    if (response.ok) return { data: body as T };
    return { error: typeof body?.error === "string" ? body.error : "PROVIDER_UNAVAILABLE" };
  } catch {
    return { error: "PROVIDER_UNAVAILABLE" };
  }
}

export function dataErrorMessage(error: string, source: string) {
  switch (error) {
    case "PROVIDER_NOT_CONFIGURED": return `${source} API 인증키가 서버에 설정되지 않았습니다.`;
    case "AUTH_FAILED": return `${source} API 인증키가 유효하지 않습니다.`;
    case "FORBIDDEN": return `${source} API 인증키 또는 서비스 이용 권한을 확인해 주세요.`;
    case "RATE_LIMITED": return `${source} API 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.`;
    case "PROVIDER_TIMEOUT": return `${source} API 응답 시간이 초과됐습니다.`;
    case "NO_RESULTS": return `${source}에서 조회된 자료가 없습니다.`;
    default: return `${source} 데이터를 불러오지 못했습니다.`;
  }
}
