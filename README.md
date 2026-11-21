This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

카카오맵을 표시하려면 `.env`의 `NEXT_PUBLIC_KAKAO_JS_KEY`에 카카오 JavaScript 키를 설정하고, 카카오 개발자 콘솔에서 접속할 주소를 JavaScript SDK 도메인으로 등록합니다. 로컬에서는 `http://localhost:3000`을 사용합니다. `localhost`와 `127.0.0.1` 또는 포트가 다른 주소는 별도로 등록해야 합니다. 환경 변수를 바꾼 뒤 개발 서버를 다시 실행하세요. 키가 없거나 SDK를 불러오지 못하면 개략도가 표시됩니다.

출발지와 목적지는 카카오맵에서 도로명·지번 주소 또는 장소명으로 검색합니다. 검색 결과를 선택하고 적용한 뒤 따릉이 대여소를 선택하면 두 자전거 경로를 조회합니다. 따릉이는 서울시 `bikeList`, 자전거 경로는 카카오맵 REST API를 사용합니다.

## 서버 API

새 환경에서는 `.env.example`을 `.env`로 복사하고 발급받은 키를 입력합니다. 기존 `.env`가 있으면 필요한 항목만 확인하세요. Git에서는 빈 템플릿만 공유합니다. `SEOUL_OPEN_API_KEY`, `DATA_GO_KR_API_KEY`, `KAKAO_REST_API_KEY`는 서버에서만 읽습니다. 지도 SDK는 별도 공개 키 `NEXT_PUBLIC_KAKAO_JS_KEY`를 사용합니다.

| GET 요청 | 반환 데이터 | 필요한 설정 |
| --- | --- | --- |
| `/api/stations?lat=37.5285&lng=126.9335` | 출발지와의 직선거리순 대여소 최대 10곳, 좌표, 자전거 수, 거치대 수 | `SEOUL_OPEN_API_KEY`. 미설정 시 공개 샘플 5곳 |
| `/api/stations?page=1&limit=100` | 전체 대여소 스냅샷의 페이지. `total`은 중복 제거 및 위치 검증을 마친 대여소 수 | `SEOUL_OPEN_API_KEY` |
| `/api/weather?lat=37.5285&lng=126.9335` | 출발지 격자, 다음 예보의 기온·강수확률, 발표시각·예보시각 | `DATA_GO_KR_API_KEY` |
| `/api/places?q=여의도` | 주소 검색 결과 또는 서울 중심 20km 이내 장소 검색 결과 | `KAKAO_REST_API_KEY` |
| `/api/bicycle-route?startLat=37.5285&startLng=126.9335&endLat=37.5099&endLng=126.9942` | 자전거도로 우선 및 최단 경로의 좌표, 거리, 시간 또는 옵션별 오류 | `KAKAO_REST_API_KEY` |
| `/api/accident-hotspots` | 서울 자전거 사고다발지역의 기준연도, 중심점, 사고건수 | `DATA_GO_KR_API_KEY` |

사고다발지역은 [한국도로교통공단](https://opendata.koroad.or.kr/api/selectBicycleDataSet.do)의 최신 공개 기준연도인 2025년 집계입니다. 공공데이터포털에서 [자전거 교통사고 다발지역 API](https://www.data.go.kr/data/15056681/openapi.do) 활용 권한이 필요합니다. 경로를 조회하면 각 경로선에서 중심점까지 200m 이내인 지역을 표시합니다. 이 거리는 앱의 표시 기준이며, 데이터는 과거 사고 집계입니다.

지도 아래 비교표에 두 경로의 거리, 예상 시간, 주변 사고다발지역 수를 표시합니다. 집계 수는 실제 주행 안전성의 판정으로 사용하지 않습니다. 따릉이·경로의 `fetchedAt`은 서버 조회 완료 시각입니다. 따릉이 원본 응답에는 대여 가능 대수의 측정시각이 없습니다. 사고 자료는 기준연도, 날씨는 발표시각과 예보시각을 화면에 표시합니다.

따릉이는 [서울시 공식 `bikeList`](https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do)를 서버에서 `openapi.seoul.go.kr:8088`로 호출합니다. Vercel 운영 주소의 브라우저→앱 요청은 HTTPS로 암호화됩니다. 앱 서버→서울시 구간은 HTTP라 인증키와 응답이 전송 중 암호화되지 않습니다. 인증키는 서버 환경변수에서 읽고 앱 응답과 앱 로그에 기록하지 않습니다.

서버 인스턴스마다 완성된 목록을 60초 동안 재사용합니다. 동시에 요청이 들어오면 한 번만 갱신합니다. 일시적 갱신 실패 시 마지막으로 받은 시각부터 15분 이내 스냅샷만 `stale: true`와 원래 `fetchedAt`으로 반환하며, 화면에 오래된 자료임을 표시합니다. 인증 실패·권한 오류는 그대로 반환합니다. 인스턴스가 재시작되면 메모리 캐시는 초기화됩니다.

날씨 API는 출발지 위·경도를 [기상청 5km 격자](https://apihub.kma.go.kr/apiList.do?apiMov=%ED%86%B5%EB%B3%B4%EB%AC%B8&seqApi=10&seqApiSub=286)로 변환하고 기온과 강수확률이 함께 제공되는 가장 가까운 예정 예보시각을 표시합니다. 두 시각은 한국 표준시입니다. 공공데이터포털에서 [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do) 활용 권한이 필요합니다. 설정을 바꿨다면 개발 서버를 다시 실행하세요.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Vercel 배포

1. [Vercel 새 프로젝트](https://vercel.com/new)에서 GitHub의 `bongbangheon-source/bike`를 가져옵니다. 프레임워크는 **Next.js**, 루트 디렉터리는 저장소 루트(`.`), 빌드 명령은 기본값(`npm run build`)을 사용합니다. 로컬 검증 기준은 Node.js 26.x입니다.
2. **Settings → Environment Variables**에서 아래 값을 **Production**에 추가합니다. 프리뷰에서도 켜려면 **Preview** 환경에도 별도로 추가합니다. 서버 키는 Vercel에 직접 입력하고 GitHub에는 값이 비어 있는 `.env.example`만 커밋합니다.

| 변수 | 설정할 값 |
| --- | --- |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 JavaScript 키. 브라우저의 지도 SDK가 사용합니다. |
| `KAKAO_REST_API_KEY` | 카카오 REST 키. 서버의 장소·자전거 경로 API가 사용합니다. |
| `DATA_GO_KR_API_KEY` | 공공데이터포털 키. 기상청 단기예보와 한국도로교통공단 자전거 사고다발지역 API 활용 승인이 필요합니다. |
| `SEOUL_OPEN_API_KEY` | 따릉이 전체 조회용 서울 열린데이터광장 일반 인증키. 기존 `SEOUL_API_KEY`를 사용했다면 새 이름으로 등록합니다. 키 미설정 시 공개 샘플 최대 5곳을 조회합니다. |

3. 배포 후 Vercel **Settings → Domains**에서 실제 운영 주소를 확인합니다. [카카오 개발자 콘솔](https://developers.kakao.com/docs/ko/app-setting/app)의 **앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에 해당 오리진(예: `https://your-project.vercel.app`)을 등록합니다. 프리뷰 지도도 필요하면 실제 프리뷰 오리진을 등록합니다.
4. Vercel 환경변수를 추가하거나 수정했다면 다시 배포합니다. 특히 `NEXT_PUBLIC_KAKAO_JS_KEY`는 빌드 시 브라우저 코드에 포함됩니다. 배포 주소에서 지도 타일, 대여소, 두 자전거 경로, 사고다발지역, 날씨를 확인합니다.
