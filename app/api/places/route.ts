import { fetchJson, fromProvider, json, numberValue, textValue } from "../_lib/provider";

type KakaoPlaces = {
  documents?: {
    id: string;
    place_name: string;
    road_address_name: string;
    address_name: string;
    x: string;
    y: string;
  }[];
};

export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 100) return json({ error: "INVALID_QUERY" }, 400);

  return fromProvider("KAKAO_REST_API_KEY", async (key) => {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.search = new URLSearchParams({ query, x: "126.978", y: "37.5665", radius: "20000", size: "8" }).toString();
    const result = await fetchJson<KakaoPlaces>(url, { Authorization: `KakaoAK ${key}` });
    if (!Array.isArray(result.documents)) throw new Error("Invalid Kakao API response");

    return {
      source: "kakao",
      places: result.documents.map((place) => ({
        id: textValue(place.id),
        name: textValue(place.place_name),
        address: textValue(place.road_address_name || place.address_name),
        lat: numberValue(place.y),
        lng: numberValue(place.x),
      })),
    };
  });
}
