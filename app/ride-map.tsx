"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "./sample-data";
import type { Hotspot } from "./accident-hotspots";
import type { Station } from "./station-types";
import { bicycleStyles, type BicycleRoute } from "./bicycle-routes";

type Position = object;
type MapInstance = {
  setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void;
  getLevel(): number;
  setLevel(level: number): void;
  relayout(): void;
};
type Bounds = { extend(position: Position): void };
type Layer = { setMap(map: MapInstance | null): void };
type Maps = {
  load(callback: () => void): void;
  Map: new (node: HTMLElement, options: { center: Position; level: number }) => MapInstance;
  LatLng: new (lat: number, lng: number) => Position;
  LatLngBounds: new () => Bounds;
  Polyline: new (options: {
    path: Position[][]; strokeWeight: number; strokeColor: string; strokeOpacity: number;
    strokeStyle?: "solid" | "shortdash"; zIndex: number;
  }) => Layer;
  CustomOverlay: new (options: { position: Position; content: HTMLElement; yAnchor: number; zIndex: number }) => Layer;
};

declare global {
  interface Window { kakao?: { maps?: Maps } }
}

const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim();
let loadingSdk: Promise<Maps> | undefined;

function loadSdk(appKey: string) {
  if (loadingSdk) return loadingSdk;
  loadingSdk = new Promise<Maps>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 7000);

    function fail() {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("Kakao Maps SDK failed to load"));
    }

    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.onerror = fail;
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) { fail(); return; }
      maps.load(() => {
        window.clearTimeout(timer);
        if (typeof maps.Map === "function") resolve(maps);
        else fail();
      });
    };
    document.head.append(script);
  });
  loadingSdk.catch(() => { loadingSdk = undefined; });
  return loadingSdk;
}

type Pin = { point: Point; kind: "station" | "endpoint" | "incident" | "incident near"; label: string; text: string };
const river: Point[] = [
  [37.565, 126.871], [37.553, 126.898], [37.543, 126.914], [37.532, 126.929],
  [37.524, 126.944], [37.520, 126.959], [37.519, 126.974], [37.515, 126.989],
  [37.520, 127.005], [37.530, 127.028],
];
const districts: { point: Point; name: string }[] = [
  { point: [37.543, 126.926], name: "마포구" }, { point: [37.535, 126.971], name: "용산구" },
  { point: [37.515, 126.926], name: "영등포구" }, { point: [37.500, 126.961], name: "동작구" },
  { point: [37.497, 126.998], name: "서초구" }, { point: [37.522, 126.957], name: "한강" },
];

function fitBounds(map: MapInstance, sdk: Maps, path: Point[]) {
  const bounds = new sdk.LatLngBounds();
  path.forEach(([lat, lng]) => bounds.extend(new sdk.LatLng(lat, lng)));
  map.setBounds(bounds, 72, 54, 90, 54);
}

function pinElement(pin: Pin) {
  const element = document.createElement("span");
  element.className = `map-pin ${pin.kind}`;
  element.title = pin.label;
  element.textContent = pin.text;
  return element;
}

function Preview({ routes, pins, bounds, zoom }: { routes: BicycleRoute[]; pins: Pin[]; bounds: Point[]; zoom: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const c = element?.getContext("2d");
    if (!element || !c) return;

    const draw = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      c.scale(ratio, ratio);
      const latitudes = bounds.map(([lat]) => lat);
      const longitudes = bounds.map(([, lng]) => lng);
      const lat = (Math.max(...latitudes) + Math.min(...latitudes)) / 2;
      const lng = (Math.max(...longitudes) + Math.min(...longitudes)) / 2;
      const scale = Math.min((width - 54) / Math.max(.029, Math.max(...longitudes) - Math.min(...longitudes)), (height - 125) / Math.max(.020, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.26)) * .83 * zoom;
      const project = ([y, x]: Point) => [width / 2 + (x - lng) * scale, height / 2 - (y - lat) * scale * 1.26] as const;
      const line = (points: Point[], color: string, weight: number, dashed = false) => {
        c.beginPath();
        points.forEach((point, index) => {
          const [x, y] = project(point);
          if (index) c.lineTo(x, y);
          else c.moveTo(x, y);
        });
        c.strokeStyle = color;
        c.lineWidth = weight;
        c.lineCap = c.lineJoin = "round";
        c.setLineDash(dashed ? [8, 6] : []);
        c.stroke();
        c.setLineDash([]);
      };

      c.fillStyle = "#eaf0e6";
      c.fillRect(0, 0, width, height);
      for (let row = -23; row <= 23; row++) {
        for (let col = -28; col <= 28; col++) {
          const x = width / 2 + col * 34 + row * 11;
          const y = height / 2 + row * 23 - col * 4;
          if ((row * 9 + col * 7) % 11 === 0) {
            c.fillStyle = "#d8e9d1";
            c.fillRect(x + 3, y + 2, 28, 17);
          }
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + 34, y - 4);
          c.moveTo(x, y);
          c.lineTo(x + 11, y + 23);
          c.strokeStyle = (row % 5 === 0 || col % 6 === 0) ? "#fffdf6" : "#f7f9f1";
          c.lineWidth = (row % 5 === 0 || col % 6 === 0) ? 4 : 1.5;
          c.stroke();
        }
      }
      line(river, "#cee6cf", scale * .011);
      line(river, "#b9dce6", scale * .0085);
      for (const [north, south] of [
        [[37.547, 126.933], [37.507, 126.933]],
        [[37.533, 126.964], [37.503, 126.954]],
        [[37.529, 126.996], [37.497, 126.982]],
      ] as [Point, Point][]) {
        line([north, south], "#d4dbc9", 8);
        line([north, south], "#fffdf6", 5);
      }
      c.textAlign = "center";
      c.font = "600 13px system-ui";
      districts.forEach(({ point, name }) => {
        const [x, y] = project(point);
        c.fillStyle = name === "한강" ? "#468197" : "#52675f";
        c.fillText(name, x, y);
      });
      routes.forEach((route) => {
        const style = bicycleStyles[route.mode];
        route.segments.forEach((segment) => line(segment, style.color, style.dashed ? 4 : 7, style.dashed));
      });
      pins.forEach((pin) => {
        const [x, y] = project(pin.point);
        c.beginPath();
        c.arc(x, y, pin.kind === "incident" ? 7 : 11, 0, Math.PI * 2);
        c.fillStyle = pin.kind === "incident near" ? "#9d2548" : pin.kind === "incident" ? "#ad452f" : pin.kind === "station" ? "#d4fa83" : "#173a2b";
        c.fill();
        c.strokeStyle = "white";
        c.lineWidth = 2;
        c.stroke();
        c.font = "bold 10px system-ui";
        c.fillStyle = pin.kind === "station" ? "#173a2b" : "white";
        c.fillText(pin.text, x, y + 3);
      });
    };

    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [routes, pins, bounds, zoom]);

  return <canvas ref={canvas} className="preview-map" role="img" aria-label="대여소 및 자전거 경로 개략도" />;
}

export default function RideMap({ routes, origin, destination, stations, hotspots, highlightedHotspots }: {
  routes: BicycleRoute[]; origin: Point; destination: Point; stations: Station[];
  hotspots: Hotspot[]; highlightedHotspots: Set<string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<{ sdk: Maps; map: MapInstance } | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const bounds = useMemo<Point[]>(() => [
    origin, destination, ...routes.flatMap((route) => route.segments.flat()),
    ...stations.map(({ lat, lng }) => [lat, lng] as const),
  ], [origin, destination, routes, stations]);
  const pins = useMemo<Pin[]>(() => [
    ...hotspots.map(({ id, point, name, crashes }): Pin => ({
      point, kind: highlightedHotspots.has(id) ? "incident near" : "incident",
      label: `${name} · 과거 사고 ${crashes}건`, text: "!",
    })).sort((a, b) => Number(a.kind === "incident near") - Number(b.kind === "incident near")),
    ...stations.map(({ lat, lng, name, bikes }): Pin => ({
      point: [lat, lng] as const, kind: "station", label: `${name} · 대여 가능 ${bikes}대`, text: String(bikes),
    })),
    { point: origin, kind: "endpoint", label: "출발지", text: "S" },
    { point: destination, kind: "endpoint", label: "목적지", text: "F" },
  ], [origin, destination, stations, hotspots, highlightedHotspots]);

  useEffect(() => {
    if (!key) return;
    let active = true;
    let observer: ResizeObserver | undefined;
    loadSdk(key).then((sdk) => {
      const node = container.current;
      if (!active || !node) return;
      const map = new sdk.Map(node, { center: new sdk.LatLng(37.523, 126.958), level: 6 });
      observer = new ResizeObserver(() => map.relayout());
      observer.observe(node);
      setEngine({ sdk, map });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (engine) fitBounds(engine.map, engine.sdk, bounds);
    setZoom(1);
  }, [engine, bounds]);

  useEffect(() => {
    if (!engine) return;
    const { sdk, map } = engine;
    const layers: Layer[] = [
      ...routes.map((route) => {
        const style = bicycleStyles[route.mode];
        return new sdk.Polyline({
          path: route.segments.map((segment) => segment.map(([lat, lng]) => new sdk.LatLng(lat, lng))),
          strokeWeight: style.dashed ? 4 : 7, strokeColor: style.color, strokeOpacity: 1,
          strokeStyle: style.dashed ? "shortdash" : "solid", zIndex: style.dashed ? 2 : 1,
        });
      }),
      ...pins.map((pin) => new sdk.CustomOverlay({
        position: new sdk.LatLng(...pin.point), content: pinElement(pin),
        yAnchor: .5, zIndex: pin.kind === "endpoint" ? 5 : pin.kind === "incident" ? 3 : 4,
      })),
    ];
    layers.forEach((layer) => layer.setMap(map));
    return () => layers.forEach((layer) => layer.setMap(null));
  }, [engine, routes, pins]);

  function changeZoom(step: number) {
    if (engine) engine.map.setLevel(engine.map.getLevel() - step);
    else setZoom((value) => Math.max(.65, Math.min(2.1, value * (step > 0 ? 1.2 : 1 / 1.2))));
  }

  return (
    <div className="map-frame">
      {!engine && <Preview routes={routes} pins={pins} bounds={bounds} zoom={zoom} />}
      <div ref={container} className={engine ? "kakao-map active" : "kakao-map"} role="region" aria-label="카카오 지도" aria-hidden={!engine} />
      <div className="map-status">{engine ? "카카오맵" : "개략도"}{routes.length > 0 && " · 카카오 자전거 경로"}</div>
      <div className="map-controls">
        <button type="button" onClick={() => changeZoom(1)} aria-label="지도 확대">+</button>
        <button type="button" onClick={() => changeZoom(-1)} aria-label="지도 축소">−</button>
        <button type="button" onClick={() => engine ? fitBounds(engine.map, engine.sdk, bounds) : setZoom(1)} aria-label="경로와 대여소 전체 보기">⦿</button>
      </div>
      {!engine && <div className="map-message" role="status">
        {!key ? "카카오 지도 키가 설정되면 실제 지도가 표시됩니다." : failed ?
          `카카오 지도를 불러오지 못했습니다. JavaScript 키와 등록 도메인(${window.location.origin})을 확인해 주세요. 개략도를 표시합니다.` :
          "카카오 지도 연결 중"}
      </div>}
    </div>
  );
}
