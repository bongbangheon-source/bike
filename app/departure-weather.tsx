"use client";

import { useEffect, useState } from "react";
import DataTime from "./data-time";
import { dataErrorMessage, loadData, type DataResult } from "./dashboard-data";
import type { DepartureForecast } from "./api/weather/forecast";
import type { Point } from "./sample-data";

export default function DepartureWeather({ name, point }: { name: string; point: Point }) {
  const [lat, lng] = point;
  const url = `/api/weather?lat=${lat}&lng=${lng}`;
  const [result, setResult] = useState<({ url: string } & DataResult<DepartureForecast>) | null>(null);
  const current = result?.url === url ? result : null;
  const forecast = current?.data;

  useEffect(() => {
    const controller = new AbortController();
    void loadData<DepartureForecast>(url, controller.signal).then((response) => {
      if (!controller.signal.aborted) setResult({ url, ...response });
    });
    return () => controller.abort();
  }, [url]);

  return (
    <section className="panel weather" aria-labelledby="weather-title">
      <h2 id="weather-title"><span className="section-icon" aria-hidden="true">☼</span> 출발지 단기예보</h2>
      <p className="data-meta">{name} · 출처 <a href="https://www.data.go.kr/data/15084084/openapi.do">기상청</a></p>
      <div aria-live="polite">
        {forecast ? <>
          <dl className="weather-values">
            <div><dt>기온</dt><dd>{forecast.temperatureC}°C</dd></div>
            <div><dt>강수확률</dt><dd>{forecast.precipitationProbability}%</dd></div>
          </dl>
          <dl>
            <div><dt>발표시각</dt><dd><DataTime value={forecast.issuedAt} /></dd></div>
            <div><dt>예보시각</dt><dd><DataTime value={forecast.forecastAt} /></dd></div>
          </dl>
        </> : <p className="station-status">{current?.error ? dataErrorMessage(current.error, "기상청 단기예보") : "출발지 예보를 불러오는 중입니다."}</p>}
      </div>
    </section>
  );
}
