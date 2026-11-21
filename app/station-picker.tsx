import DataTime from "./data-time";
import { dataErrorMessage, formatDistance, type DataResult } from "./dashboard-data";
import { stationSearchRadii, type NearbyStations } from "./station-types";

type Results = NearbyStations["stations"];
export const stationDisplayLimit = 30;

export default function StationPicker({
  departure, result, refreshing, radius, onRadius, query, onQuery,
  available, onAvailable, matches, selectedId, onSelect, onRefresh,
}: {
  departure: string;
  result?: DataResult<NearbyStations>;
  refreshing: boolean;
  radius: number;
  onRadius(radius: number): void;
  query: string;
  onQuery(query: string): void;
  available: boolean;
  onAvailable(available: boolean): void;
  matches: Results;
  selectedId?: string;
  onSelect(station: Results[number]): void;
  onRefresh(): void;
}) {
  const data = result?.data;
  return (
    <section className="panel station-panel" aria-labelledby="station-title">
      <div className="section-heading">
        <h2 id="station-title"><span className="section-icon" aria-hidden="true">◎</span> 출발지 주변 따릉이</h2>
        <button className="quiet-button" type="button" disabled={refreshing} onClick={onRefresh}>새로고침</button>
      </div>
      <div className="station-tools">
        <input aria-label="대여소 이름 또는 번호" placeholder="대여소 이름 또는 번호" type="search" value={query} onChange={(event) => onQuery(event.target.value)} />
        <div className="station-options">
          <label><span>반경</span><select aria-label="대여소 검색 반경" value={radius} onChange={(event) => onRadius(Number(event.target.value))}>
            {stationSearchRadii.map((distance) => <option key={distance} value={distance}>{formatDistance(distance)}</option>)}
          </select></label>
          <label className="check-option"><input type="checkbox" checked={available} onChange={(event) => onAvailable(event.target.checked)} /> 대여 가능만</label>
        </div>
      </div>
      <p className="station-status" role="status">
        {!result ? "대여소를 불러오는 중입니다." :
          result.error ? dataErrorMessage(result.error, "서울시 따릉이") :
          data ? `${departure} 기준 · ${matches.length}곳${matches.length > stationDisplayLimit ? ` 중 가까운 ${stationDisplayLimit}곳 표시` : ""}` : ""}
        {data?.scope === "sample" && " · 공개 샘플 범위"}
        {refreshing && data && " · 갱신 중"}
      </p>
      {data?.stale && <p className="notice-inline" role="status">마지막 조회 자료입니다. 잔여 대수는 현재와 다를 수 있습니다.</p>}
      {!!matches.length ? (
        <ul className="station-list">
          {matches.slice(0, stationDisplayLimit).map((station) => (
            <li key={station.id}>
              <button className="station-select" type="button" aria-pressed={selectedId === station.id} onClick={() => onSelect(station)}>
                <span className="station-symbol" aria-hidden="true">↗</span>
                <span className="station-name"><strong>{station.name}</strong>
                  <small>{formatDistance(station.distanceMeters)} · {station.id} · 거치대 {station.racks}개</small>
                </span>
                <span className={station.bikes ? "bike-count" : "bike-count unavailable"}><b>{station.bikes}</b>대</span>
              </button>
            </li>
          ))}
        </ul>
      ) : data && <p className="empty-state">조건에 맞는 대여소가 없습니다.</p>}
      {selectedId && <a className="station-map-link" href="#map-title">선택한 경로 지도 보기 <span aria-hidden="true">→</span></a>}
      <p className="data-meta">
        <a href="https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do">서울 열린데이터광장</a>
        {data && <> · 조회 <DataTime value={data.fetchedAt} /></>}
      </p>
      {data && <p className="data-meta">제공처 측정시각 미제공 · 60초마다 갱신</p>}
    </section>
  );
}
