import "server-only";

type ServerKey = "DATA_GO_KR_API_KEY" | "KAKAO_REST_API_KEY";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function fromProvider(keyName: ServerKey, request: (key: string) => Promise<unknown>) {
  const key = process.env[keyName]?.trim();
  if (!key) return json({ error: "PROVIDER_NOT_CONFIGURED" }, 503);

  return providerResponse(() => request(key));
}

export async function providerResponse(request: () => Promise<unknown>) {
  try {
    return json(await request());
  } catch (error) {
    const code = providerErrorCode(error);
    const status = code === "NO_RESULTS" ? 404 : code === "RATE_LIMITED" ? 503 : code === "PROVIDER_TIMEOUT" ? 504 : 502;
    return json({ error: code }, status);
  }
}

export class ProviderHttpError extends Error {
  constructor(readonly status: number) { super("Upstream HTTP error"); }
}

export class ProviderDataError extends Error {
  constructor(readonly code: "AUTH_FAILED" | "FORBIDDEN" | "RATE_LIMITED" | "NO_RESULTS") { super(code); }
}

export function providerErrorCode(error: unknown) {
  if (error instanceof ProviderDataError) return error.code;
  if (error instanceof ProviderHttpError) {
    if (error.status === 401) return "AUTH_FAILED";
    if (error.status === 403) return "FORBIDDEN";
    if (error.status === 429) return "RATE_LIMITED";
  }
  return error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE";
}

export function checkDataGoKrAccess(code?: string) {
  if (code === "30" || code === "31") throw new ProviderDataError("AUTH_FAILED");
  if (code === "20" || code === "32") throw new ProviderDataError("FORBIDDEN");
  if (code === "22" || code === "23") throw new ProviderDataError("RATE_LIMITED");
}

export async function fetchJson<T>(url: URL, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new ProviderHttpError(response.status);
  return response.json();
}

export function numberValue(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
    throw new Error("Missing upstream number");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid upstream number");
  return number;
}

export function textValue(value: unknown) {
  if (typeof value !== "string") throw new Error("Invalid upstream text");
  return value;
}
