"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import RideMap from "./ride-map";
import DepartureWeather from "./departure-weather";
import PlaceSearch, { type PlaceInput, type SearchPlace } from "./place-search";
import DataTime from "./data-time";
import StationPicker, { stationDisplayLimit } from "./station-picker";
import { dataErrorMessage, formatDistance, loadData, type DataResult } from "./dashboard-data";
import { places, type Point } from "./sample-data";
import { hotspotsAlongRoute, nearRouteMeters, type AccidentHotspots, type Hotspot } from "./accident-hotspots";
import { bicycleErrorMessage, bicycleStyles, type BicycleMode, type BicycleResult, type BicycleRoute } from "./bicycle-routes";
import type { NearbyStations, Station } from "./station-types";

const emptyStations: NearbyStations["stations"] = [];
const emptyHotspots: Hotspot[] = [];
const routeDistance = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

export default function Home() {
  const [start, setStart] = useState<PlaceInput>({ text: places[0].name, place: places[0] });
  const [finish, setFinish] = useState<PlaceInput>({ text: places[1].name, place: places[1] });
  const [selection, setSelection] = useState<{ from: SearchPlace; to: SearchPlace }>({ from: places[0], to: places[1] });
  const [error, setError] = useState("");
  const [showStations, setShowStations] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [stationRadius, setStationRadius] = useState(2000);
  const [stationQuery, setStationQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [mapMode, setMapMode] = useState<BicycleMode | "all">("all");
  const [hotspotRadius, setHotspotRadius] = useState(nearRouteMeters);
  const [nearOnly, setNearOnly] = useState(false);
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
  const distanceGap = routes.length === 2 ? Math.abs(routes[0].distanceMeters - routes[1].distanceMeters) : null;
  const timeGap = routes.length === 2 ? Math.abs(minutes(routes[0].durationSeconds) - minutes(routes[1].durationSeconds)) : null;
  const visibleMode = routes.some((route) => route.mode === mapMode) ? mapMode : "all";
  const visibleRoutes = useMemo(() => visibleMode === "all" ? routes : routes.filter((route) => route.mode === visibleMode), [routes, visibleMode]);
  const [hotspotResult, setHotspotResult] = useState<DataResult<AccidentHotspots> | null>(null);
  const hotspotData = hotspotResult?.data;
  const hotspots = hotspotData?.hotspots ?? emptyHotspots;
  const routeHotspots = useMemo(() => routes.map((route) => ({
    mode: route.mode, matches: hotspotsAlongRoute(hotspots, route, hotspotRadius),
  })), [hotspots, routes, hotspotRadius]);
  const highlightedHotspots = useMemo(() => new Set(
    routeHotspots.filter(({ mode }) => visibleMode === "all" || mode === visibleMode)
      .flatMap(({ matches }) => matches.map(({ id }) => id)),
  ), [routeHotspots, visibleMode]);
  const visibleHotspots = useMemo(() => !showIncidents ? emptyHotspots :
    nearOnly && visibleRoutes.length ? hotspots.filter(({ id }) => highlightedHotspots.has(id)) : hotspots,
  [showIncidents, nearOnly, visibleRoutes, hotspots, highlightedHotspots]);
  const stationUrl = `/api/stations?lat=${departure.point[0]}&lng=${departure.point[1]}&radius=${stationRadius}`;
  const [refresh, setRefresh] = useState(0);
  const [stationResult, setStationResult] = useState<{
    url: string; refresh: number;
  } & DataResult<NearbyStations> | null>(null);
  const currentResult = stationResult?.url === stationUrl ? stationResult : null;
  const stationRefreshing = !currentResult || currentResult.refresh !== refresh;
  const stations = currentResult?.data?.stations ?? emptyStations;
  const filteredStations = useMemo(() => {
    const query = stationQuery.trim().toLowerCase().replace(/\s+/g, "");
    return stations.filter(({ name, id, bikes }) =>
      (!availableOnly || bikes > 0) && `${name}${id}`.toLowerCase().replace(/\s+/g, "").includes(query),
    );
  }, [stations, stationQuery, availableOnly]);
  const mapStations = useMemo(() => showStations ? filteredStations.slice(0, stationDisplayLimit) : emptyStations, [showStations, filteredStations]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((count) => count + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (from.point[0] !== departure.point[0] || from.point[1] !== departure.point[1]) {
      setStationChoice(null);
      setStationQuery("");
    }
    setSelection({ from, to });
    setError("");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/" className="brand"><span className="brand-icon" aria-hidden="true">↗</span><span>Safe Bike <em>Seoul</em></span></a>
          <nav className="top-nav" aria-label="화면 이동"><a href="#map-title">지도</a><a href="#comparison-title">경로 비교</a><a href="#weather-title">예보</a></nav>
        </div>
      </header>
      <main className="dashboard">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">서울 자전거 길찾기</h1>
          <p className="intro-copy">출발지 주변 따릉이를 고르고, 두 경로의 거리와 주변 사고 기록을 비교하세요.</p>
        </section>
        <div className="workspace">
          <aside className="sidebar" aria-label="장소 및 대여소 선택">
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
            <StationPicker departure={departure.name} result={currentResult ?? undefined} refreshing={stationRefreshing}
              radius={stationRadius} onRadius={setStationRadius} query={stationQuery} onQuery={setStationQuery}
              available={availableOnly} onAvailable={setAvailableOnly} matches={filteredStations}
              selectedId={chosenStation?.id}
              onSelect={(station) => setStationChoice({ station, attempt: (attempt ?? 0) + 1 })}
              onRefresh={() => setRefresh((count) => count + 1)} />
          </aside>
          <section className="panel map-panel" aria-labelledby="map-title">
            <div className="map-header">
              <h2 id="map-title">경로 지도</h2>
              <div className="filters" aria-label="지도에 표시할 정보">
                <button type="button" aria-pressed={showStations} onClick={() => setShowStations(!showStations)}><i className="station-dot" /> 따릉이</button>
                <button type="button" aria-pressed={showIncidents} onClick={() => setShowIncidents(!showIncidents)}><i className="incident-dot" /> 사고다발지역</button>
              </div>
            </div>
            {chosenStation && <div className="route-numbers" aria-label="두 경로의 거리와 예상 시간" aria-live="polite">
              {!currentRoute && <p className="station-status">두 경로를 조회하는 중입니다.</p>}
              {currentRoute?.error && <p className="route-error">{bicycleErrorMessage(currentRoute.error)}</p>}
              {currentRoute?.results && <div className="route-number-grid">
                {currentRoute.results.map((result) => (
                  <div className={`route-number-card ${result.mode}`} key={result.mode}>
                    <h3><i className={`route-line ${result.mode}`} />{bicycleStyles[result.mode].label}</h3>
                    {"error" in result ? <p className="route-error">{bicycleErrorMessage(result.error)}</p> : <>
                      <p className="route-number-distance"><strong>{routeDistance.format(result.distanceMeters / 1000)}</strong> km</p>
                      <p className="route-number-time">예상 <strong>{minutes(result.durationSeconds)}분</strong></p>
                    </>}
                  </div>
                ))}
              </div>}
              {distanceGap !== null && <p className="route-insight">
                거리 차이 <strong>{distanceGap.toLocaleString("ko-KR")} m</strong>
                {timeGap !== null && <> · 예상 시간 차이 <strong>{timeGap}분</strong></>}
              </p>}
            </div>}
            {routes.length > 0 && <div className="map-modes" role="group" aria-label="지도 경로 선택">
              <button type="button" className="quiet-button" aria-pressed={visibleMode === "all"} onClick={() => setMapMode("all")}>모든 경로</button>
              {routes.map(({ mode }) => <button key={mode} type="button" className="quiet-button" aria-pressed={visibleMode === mode}
                onClick={() => setMapMode(mode)}><i className={`route-line ${mode}`} /> {bicycleStyles[mode].label}</button>)}
            </div>}
            <RideMap routes={visibleRoutes} origin={mapOrigin}
              destination={destination.point} stations={mapStations}
              hotspots={visibleHotspots} highlightedHotspots={highlightedHotspots} />
            <div className="legend">
              <span><i className="route-line BIKE_ONLY" /> 자전거도로 우선</span>
              <span><i className="route-line SHORTEST" /> 최단 경로</span>
              <span><i className="station-dot" /> 따릉이 대여소 · 숫자는 대여 가능 대수</span>
              <span><i className="incident-dot" /> 사고다발지역{hotspotData && ` · ${hotspotData.year}년`}</span>
              {highlightedHotspots.size > 0 && <span><i className="incident-dot near" /> 경로 주변 사고다발지역</span>}
            </div>
            <section className="route-comparison" aria-labelledby="comparison-title" aria-live="polite">
              <div className="section-heading">
                <h2 id="comparison-title">경로 비교</h2>
                <label className="compact-field">사고 집계 반경
                  <select value={hotspotRadius} onChange={(event) => setHotspotRadius(Number(event.target.value))}>
                    {[100, 200, 300, 500, 1000].map((radius) => <option key={radius} value={radius}>{formatDistance(radius)}</option>)}
                  </select>
                </label>
              </div>
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
                          <small>약 {minutes(result.durationSeconds)}분</small></td>
                        <td>{!hotspotResult ? "집계 중" : !hotspotData?.hotspots.length || !matches ? "자료 없음" : <strong>{matches.length}곳</strong>}</td>
                      </>}
                    </tr>;
                  })}</tbody>
                </table>}
              </> : <p className="station-status">출발지 주변 목록에서 따릉이 대여소를 선택하세요.</p>}
              <p className="comparison-note">
                {hotspotData ? `${hotspotData.year}년 ` : ""}과거 집계에서 경로선과 다발지역 중심점이 {formatDistance(hotspotRadius)} 이내인 곳을 셉니다.
                {" "}이 수치만으로 실제 주행 안전성을 판단할 수 없습니다.
              </p>
            </section>
          </section>
        </div>
        <div className="info-grid">
          <DepartureWeather name={departure.name} point={departure.point} />
          <section className="panel info-card">
            <div className="section-heading">
              <h2><span className="section-icon incident-icon" aria-hidden="true">!</span> 자전거 사고다발지역
                {hotspotData && <span className="badge">{hotspotData.year}년</span>}
              </h2>
              <label className="check-option"><input type="checkbox" checked={nearOnly} disabled={!routes.length || !showIncidents}
                onChange={(event) => setNearOnly(event.target.checked)} /> 지도에 경로 주변만</label>
            </div>
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
