"use client";

import { useEffect, useState } from "react";
import { dataErrorMessage, loadData, type DataResult } from "./dashboard-data";
import type { Point } from "./sample-data";

export type SearchPlace = { name: string; point: Point };
export type PlaceInput = { text: string; place: SearchPlace | null };
type PlaceMatch = { id: string; name: string; address: string; lat: number; lng: number };
type SearchResponse = { places: PlaceMatch[] };

export default function PlaceSearch({ id, label, input, onChange }: {
  id: string; label: string; input: PlaceInput; onChange(value: PlaceInput): void;
}) {
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [result, setResult] = useState<{ query: string; response: DataResult<SearchResponse> } | null>(null);
  const query = input.text.trim();
  const active = open && !input.place && !composing && query.length >= 2;
  const response = result?.query === query ? result.response : undefined;
  const matches = response?.data?.places ?? [];

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadData<SearchResponse>(`/api/places?q=${encodeURIComponent(query)}`, controller.signal).then((response) => {
        if (!controller.signal.aborted) setResult({ query, response });
      });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query]);

  function select(match: PlaceMatch) {
    onChange({ text: match.name, place: { name: match.name, point: [match.lat, match.lng] } });
    document.getElementById(id)?.focus();
    setOpen(false);
  }

  return (
    <div className="place-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <label htmlFor={id}><span className={id === "start" ? "start-dot" : "finish-dot"} />{label}</label>
      <input id={id} autoComplete="off" maxLength={100} value={input.text} placeholder="주소 또는 장소명 검색"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onChange={(event) => {
          onChange({ text: event.target.value, place: null });
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || input.place || event.nativeEvent.isComposing || composing) return;
          if (!open) { setOpen(true); event.preventDefault(); return; }
          const exact = matches.filter((match) => match.name === query);
          const match = matches.length === 1 ? matches[0] : exact.length === 1 ? exact[0] : undefined;
          if (active && match) {
            event.preventDefault();
            select(match);
          } else if (active && !response) {
            event.preventDefault();
          }
        }} />
      {open && !input.place && <div className="search-results" aria-label={`${label} 검색 결과`}>
        {active && matches.map((match) => <button key={match.id} type="button" onClick={() => select(match)}>
          <strong>{match.name}</strong>{match.address !== match.name && <small>{match.address}</small>}
        </button>)}
        {active && !matches.length && <p role="status">{!response ? "카카오에서 검색 중입니다." :
          response.error ? dataErrorMessage(response.error, "카카오 장소 검색") : "검색 결과가 없습니다. 주소나 장소명을 확인해 주세요."}</p>}
        {query.length < 2 && <p>주소 또는 장소명을 두 글자 이상 입력하세요.</p>}
      </div>}
    </div>
  );
}
