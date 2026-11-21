"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import RideMap from "./ride-map";
import DepartureWeather from "./departure-weather";
import PlaceSearch, { type PlaceInput, type SearchPlace } from "./place-search";
import DataTime from "./data-time";
import { dataErrorMessage, loadData, type DataResult } from "./dashboard-data";
import { places, type Point } from "./sample-data";
import { hotspotsAlongRoute, nearRouteMeters, type AccidentHotspots, type Hotspot } from "./accident-hotspots";
import { bicycleErrorMessage, bicycleStyles, type BicycleResult, type BicycleRoute } from "./bicycle-routes";
import type { NearbyStations, Station } from "./station-types";

const emptyStations: NearbyStations["stations"] = [];
const emptyHotspots: Hotspot[] = [];
const routeDistance = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });

function formatDistance(meters: number) {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

export default function Home() {
  const [start, setStart] = useState<PlaceInput>({ text: places[0].name, place: places[0] });
  const [finish, setFinish] = useState<PlaceInput>({ text: places[1].name, place: places[1] });
  const [selection, setSelection] = useState<{ from: SearchPlace; to: SearchPlace }>({ from: places[0], to: places[1] });
  const [error, setError] = useState("");
  const [showStations, setShowStations] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const { from: departure, to: destination } = selection;
  const [stationChoice, setStationChoice] = useState<{ station: Station; attempt: number } | null>(null);
  const chosenStation = stationChoice?.station;
  const mapOrigin = useMemo<Point>(() => chosenStation ? [chosenStation.lat, chosenStation.lng] : departure.point, [chosenStation, departure]);
  const bicycleUrl = chosenStation ?
    `/api/bicycle-route?startLat=${chosenStation.lat}&startLng=${chosenStation.lng}&endLat=${destination.point[0]}&endLng=${destination.point[1]}` : null;
  const attempt = stationChoice?.attempt;
  const [routeResult, setRouteResult] = useState<{
    url: string; attempt: number; results?: BicycleResult[]; fetchedAt?: string; error?: string;
  } | null>(null);
  const currentRoute = routeResult?.url === bicycleUrl && routeResult.attempt === attempt ? routeResult : null;
  const routes = useMemo(() => currentRoute?.results?.filter((result): result is BicycleRoute => !("error" in result)) ?? [], [currentRoute]);
  const [hotspotResult, setHotspotResult] = useState<DataResult<AccidentHotspots> | null>(null);
  const hotspotData = hotspotResult?.data;
  const hotspots = hotspotData?.hotspots ?? emptyHotspots;
  const routeHotspots = useMemo(() => routes.map((route) => ({
    mode: route.mode, matches: hotspotsAlongRoute(hotspots, route),
  })), [hotspots, routes]);
  const highlightedHotspots = useMemo(() => new Set(
    routeHotspots.flatMap(({ matches }) => matches.map(({ id }) => id)),
  ), [routeHotspots]);
  const stationUrl = `/api/stations?lat=${departure.point[0]}&lng=${departure.point[1]}`;
  const [refresh, setRefresh] = useState(0);
  const [stationResult, setStationResult] = useState<{
    url: string; refresh: number;
  } & DataResult<NearbyStations> | null>(null);
  const currentResult = stationResult?.url === stationUrl && stationResult.refresh === refresh ? stationResult : null;
  const stations = currentResult?.data?.stations ?? emptyStations;

  useEffect(() => {
    const controller = new AbortController();
    void loadData<AccidentHotspots>("/api/accident-hotspots", controller.signal).then((result) => {
      if (!controller.signal.aborted) setHotspotResult(result);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData<NearbyStations>(stationUrl, controller.signal).then((result) => {
      if (!controller.signal.aborted) setStationResult({ url: stationUrl, refresh, ...result });
    });
    return () => controller.abort();
  }, [stationUrl, refresh]);

  useEffect(() => {
    if (!bicycleUrl || attempt === undefined) return;
    const url = bicycleUrl;
    const requestAttempt = attempt;
    const controller = new AbortController();
    async function searchRoutes() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        const data: { results?: BicycleResult[]; fetchedAt?: string; error?: string } = await response.json();
        if (!controller.signal.aborted) {
          setRouteResult(response.ok && Array.isArray(data.results) ?
            { url, attempt: requestAttempt, results: data.results, fetchedAt: data.fetchedAt } :
            { url, attempt: requestAttempt, error: data.error ?? "PROVIDER_UNAVAILABLE" });
        }
      } catch {
        if (!controller.signal.aborted) setRouteResult({ url, attempt: requestAttempt, error: "PROVIDER_UNAVAILABLE" });
      }
    }
    void searchRoutes();
    return () => controller.abort();
  }, [bicycleUrl, attempt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { place: from } = start;
    const { place: to } = finish;
    if (!from || !to) {
      setError(`${!from ? "출발지" : "목적지"}를 검색 결과에서 선택해 주세요.`);
      document.getElementById(!from ? "start" : "finish")?.focus();
      return;
    }
    if (from.point[0] !== departure.point[0] || from.point[1] !== departure.point[1]) setStationChoice(null);
    setSelection({ from, to });
    setError("");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/" className="brand"><span className="brand-icon" aria-hidden="true">🚲︎</span><span>Safe Bike <em>Seoul</em></span></a>
        </div>
      </header>
      <main className="dashboard">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">서울 자전거 지도</h1>
          <p className="intro-copy">따릉이 대여소를 선택하고 두 자전거 경로의 거리와 주변 사고 기록을 비교하세요.</p>
        </section>
        <div className="workspace">
          <aside className="sidebar" aria-label="경로 검색 및 날씨">
            <section className="panel planner">
              <h2><span className="section-icon" aria-hidden="true">↗</span> 경로 검색</h2>
              <form onSubmit={submit}>
                <div className="fields">
                  <PlaceSearch id="start" label="출발지" input={start} onChange={(value) => { setStart(value); setError(""); }} />
                  <button className="swap" type="button" aria-label="출발지와 목적지 바꾸기" onClick={() => { setStart(finish); setFinish(start); setError(""); }}>⇅</button>
                  <PlaceSearch id="finish" label="목적지" input={finish} onChange={(value) => { setFinish(value); setError(""); }} />
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="search-button" type="submit">출발지·목적지 적용 <span aria-hidden="true">→</span></button>
              </form>
            </section>
            <DepartureWeather name={departure.name} point={departure.point} />
          </aside>
          <section className="panel map-panel" aria-labelledby="map-title">
            <div className="map-header">
              <h2 id="map-title">경로 지도</h2>
              <div className="filters" aria-label="지도에 표시할 정보">
                <button type="button" aria-pressed={showStations} onClick={() => setShowStations(!showStations)}><i className="station-dot" /> 따릉이</button>
                <button type="button" aria-pressed={showIncidents} onClick={() => setShowIncidents(!showIncidents)}><i className="incident-dot" /> 사고다발지역</button>
              </div>
            </div>
            <RideMap routes={routes} origin={mapOrigin}
              destination={destination.point} stations={showStations ? stations : emptyStations}
              hotspots={showIncidents ? hotspots : emptyHotspots} highlightedHotspots={highlightedHotspots} />
            <div className="legend">
              <span><i className="route-line BIKE_ONLY" /> 자전거도로 우선</span>
              <span><i className="route-line SHORTEST" /> 최단 경로</span>
              <span><i className="station-dot" /> 따릉이 대여소 · 숫자는 대여 가능 대수</span>
              <span><i className="incident-dot" /> 사고다발지역{hotspotData && ` · ${hotspotData.year}년`}</span>
              {highlightedHotspots.size > 0 && <span><i className="incident-dot near" /> 경로 주변 사고다발지역</span>}
            </div>
            <section className="route-comparison" aria-labelledby="comparison-title" aria-live="polite">
              <h2 id="comparison-title">경로 비교</h2>
              <p className="data-meta">
                경로 출처 <a href="https://developers.kakao.com/docs/ko/kakaomap/rest-api#bicycle-routing">카카오맵</a>
                {currentRoute?.fetchedAt && routes.length > 0 && <> · 조회 완료 <DataTime value={currentRoute.fetchedAt} /></>}
              </p>
              {chosenStation ? <>
                <p className="comparison-trip">{chosenStation.name} <span aria-hidden="true">→</span> {destination.name}</p>
                {!currentRoute && <p className="station-status">두 경로를 조회하는 중입니다.</p>}
                {currentRoute?.error && <p className="route-error">{bicycleErrorMessage(currentRoute.error)}</p>}
                {currentRoute?.results && <table aria-labelledby="comparison-title">
                  <thead><tr><th scope="col">경로</th><th scope="col">거리 · 예상 시간</th><th scope="col">주변 사고다발지역</th></tr></thead>
                  <tbody>{currentRoute.results.map((result) => {
                    const matches = routeHotspots.find(({ mode }) => mode === result.mode)?.matches;
                    return <tr key={result.mode}>
                      <th scope="row"><i className={`route-line ${result.mode}`} /> {bicycleStyles[result.mode].label}</th>
                      {"error" in result ? <>
                        <td className="route-error">{bicycleErrorMessage(result.error)}</td>
                        <td>비교 불가</td>
                      </> : <>
                        <td><strong>{routeDistance.format(result.distanceMeters / 1000)} km</strong>
                          <small>약 {Math.max(1, Math.ceil(result.durationSeconds / 60))}분</small></td>
                        <td>{!hotspotResult ? "집계 중" : !hotspotData?.hotspots.length || !matches ? "자료 없음" : <strong>{matches.length}곳</strong>}</td>
                      </>}
                    </tr>;
                  })}</tbody>
                </table>}
              </> : <p className="station-status">출발지 주변 목록에서 따릉이 대여소를 선택하세요.</p>}
              <p className="comparison-note">
                {hotspotData ? `${hotspotData.year}년 ` : ""}과거 집계에서 경로선과 다발지역 중심점이 {nearRouteMeters}m 이내인 곳을 셉니다.
                {" "}이 수치만으로 실제 주행 안전성을 판단할 수 없습니다.
              </p>
            </section>
          </section>
        </div>
        <div className="info-grid">
          <section className="panel info-card">
            <div className="station-heading">
              <h2><span className="section-icon" aria-hidden="true">◎</span> 출발지 주변 따릉이</h2>
              <button type="button" onClick={() => setRefresh((count) => count + 1)} disabled={!currentResult}>새로고침</button>
            </div>
            <p className="data-meta">
              출처 <a href="https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do">서울 열린데이터광장</a>
              {currentResult?.data && <> · 조회 완료 <DataTime value={currentResult.data.fetchedAt} /></>}
            </p>
            {currentResult?.data && <p className="station-status">대여 가능 대수의 측정시각은 원본 응답에서 제공하지 않습니다.</p>}
            <p className="station-status" role="status">
              {!currentResult ? "대여소를 불러오는 중입니다." :
                currentResult.error ? dataErrorMessage(currentResult.error, "서울시 따릉이") :
                !currentResult.data ? "조회된 대여소가 없습니다." :
                currentResult.data.scope === "sample" ? "서울시 공개 샘플 최대 5곳 · 조회된 대여소 안에서 거리순" :
                `${departure.name} 기준 · 가까운 대여소 최대 10곳`}
            </p>
            {currentResult?.data && !stations.length && <p className="station-status">조회된 대여소가 없습니다.</p>}
            {!!stations.length && <ul>{stations.map((station) => (
              <li key={station.id}>
                <button className="station-select" type="button" aria-pressed={chosenStation?.id === station.id}
                  onClick={() => setStationChoice({ station, attempt: (attempt ?? 0) + 1 })}>
                  <span>{station.name}<small>직선거리 {formatDistance(station.distanceMeters)}</small></span>
                  <strong>대여 가능 {station.bikes}대</strong>
                </button>
              </li>
            ))}</ul>}
          </section>
          <section className="panel info-card">
            <h2><span className="section-icon incident-icon" aria-hidden="true">!</span> 자전거 사고다발지역
              {hotspotData && <span className="badge">{hotspotData.year}년 기준</span>}
            </h2>
            <p className="data-meta">출처 <a href="https://www.data.go.kr/data/15056681/openapi.do">한국도로교통공단</a></p>
            <p className="station-status">과거 사고를 집계한 지역입니다. 실시간 사고·도로 상황은 반영되지 않습니다.</p>
            <p className="station-status" role="status">
              {!hotspotResult ? "사고다발지역을 불러오는 중입니다." :
                hotspotResult.error ? dataErrorMessage(hotspotResult.error, "한국도로교통공단") :
                hotspots.length ? `서울 집계 ${hotspots.length}곳` : "제공된 사고다발지역 자료가 없습니다."}
            </p>
            {hotspotData && hotspots.length > 0 && (routeHotspots.length ? routeHotspots.map(({ mode, matches }) => (
              <div className="hotspot-route" key={mode}>
                <h3>{bicycleStyles[mode].label}</h3>
                {matches.length ? <ul>{matches.map((hotspot) => (
                  <li key={hotspot.id}>
                    <span>{hotspot.name}<small>경로에서 {formatDistance(Math.round(hotspot.distance))}</small></span>
                    <span>사고 {hotspot.crashes}건</span>
                  </li>
                ))}</ul> : <p className="station-status">경로 주변에 집계된 사고다발지역이 없습니다.</p>}
              </div>
            )) : <p className="station-status">경로를 조회하면 주변 사고다발지역을 확인할 수 있습니다.</p>)}
          </section>
        </div>
        <footer>표시 시각은 한국 표준시입니다. 주소와 장소 검색은 카카오맵 데이터를 사용합니다.</footer>
      </main>
    </>
  );
}
