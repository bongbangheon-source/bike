import { connection } from "next/server";
import type { AccidentHotspots, Hotspot } from "../../accident-hotspots";
import { checkDataGoKrAccess, fetchJson, fromProvider, numberValue, textValue } from "../_lib/provider";

// Latest published year in the KoROAD dataset catalog.
const year = 2025;
const pageSize = 100;
const endpoint = "https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle";

type HotspotRow = {
  afos_fid: string | number;
  spot_nm: string;
  sido_sgg_nm: string;
  la_crd: string | number;
  lo_crd: string | number;
  occrrnc_cnt: string | number;
};
type Page = { resultCode?: string; items?: { item?: HotspotRow[] }; totalCount?: number | string; };
type ProviderPage = Page & { response?: { header?: Page; body?: Page } };

async function getPage(key: string, page: number) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    ServiceKey: key, searchYearCd: String(year), siDo: "11", guGun: "",
    type: "json", numOfRows: String(pageSize), pageNo: String(page),
  }).toString();
  const result = await fetchJson<ProviderPage>(url);
  const body = result.response?.body ?? result;
  const code = result.response?.header?.resultCode ?? result.resultCode;
  checkDataGoKrAccess(code);
  if (code === "03") return { total: 0, rows: [] };
  const rows = body.items?.item;
  if (code !== "00" || !Array.isArray(rows)) throw new Error("Invalid KoROAD response");

  const total = numberValue(body.totalCount);
  if (!Number.isSafeInteger(total) || total < 0 || total > 10_000) throw new Error("Invalid KoROAD row count");
  return { total, rows };
}

function normalize(row: HotspotRow): Hotspot {
  const lat = numberValue(row.la_crd);
  const lng = numberValue(row.lo_crd);
  const crashes = numberValue(row.occrrnc_cnt);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isInteger(crashes) || crashes < 0) {
    throw new Error("Invalid hotspot location or crash count");
  }

  return {
    id: typeof row.afos_fid === "number" ? String(row.afos_fid) : textValue(row.afos_fid),
    name: textValue(row.spot_nm), district: textValue(row.sido_sgg_nm),
    point: [lat, lng], crashes,
  };
}

export async function GET() {
  await connection();
  return fromProvider("DATA_GO_KR_API_KEY", async (key): Promise<AccidentHotspots> => {
    const decodedKey = key.includes("%") ? decodeURIComponent(key) : key;
    const first = await getPage(decodedKey, 1);
    const rows = [...first.rows];
    for (let page = 2; rows.length < first.total; page++) {
      const next = await getPage(decodedKey, page);
      if (next.total !== first.total || !next.rows.length) throw new Error("Incomplete KoROAD dataset");
      rows.push(...next.rows);
    }

    const hotspots = rows.map(normalize);
    if (hotspots.length !== first.total || new Set(hotspots.map(({ id }) => id)).size !== first.total) {
      throw new Error("Inconsistent KoROAD dataset");
    }
    return { year, hotspots };
  });
}
