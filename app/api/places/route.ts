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

type KakaoAddresses = {
  documents?: {
    address_name: string;
    road_address?: { address_name: string } | null;
    x: string;
    y: string;
  }[];
};

export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 100) return json({ error: "INVALID_QUERY" }, 400);

  return fromProvider("KAKAO_REST_API_KEY", async (key) => {
    const headers = { Authorization: `KakaoAK ${key}` };
    const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    addressUrl.search = new URLSearchParams({ query, size: "8" }).toString();
    const addresses = await fetchJson<KakaoAddresses>(addressUrl, headers);
    if (!Array.isArray(addresses.documents)) throw new Error("Invalid Kakao address response");
    if (addresses.documents.length > 0) {
      return {
        source: "kakao",
        places: addresses.documents.map((match) => {
          const name = textValue(match.address_name);
          const lat = numberValue(match.y);
          const lng = numberValue(match.x);
          return { id: `address:${lat},${lng}:${name}`, name, address: match.road_address?.address_name ?? name, lat, lng };
        }),
      };
    }

    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.search = new URLSearchParams({ query, x: "126.978", y: "37.5665", radius: "20000", size: "8" }).toString();
    const result = await fetchJson<KakaoPlaces>(url, headers);
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
