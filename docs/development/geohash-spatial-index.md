# GeoHash 공간 인덱싱 — Spots API 성능 개선

## 배경

기존 `/api/spots` 엔드포인트는 매 요청마다 전체 스팟(~1,217개)에 대해 거리 계산 + 정렬을 수행했다.
인메모리 캐시(`spotMetadata`)에 공간 인덱싱이 없어서, 서울 사용자가 요청해도 전 세계 스팟을 전부 순회했다.

## 해결 방법

GeoHash 기반 공간 인덱스를 추가하여 요청자 위치 근처의 스팟만 빠르게 조회하도록 개선.

### GeoHash란?

위도/경도를 Base32 문자열로 인코딩하여 2D 좌표를 1D 문자열로 변환하는 기법.
같은 접두사를 공유하는 해시는 지리적으로 인접한 위치를 나타낸다.

| precision | 셀 크기 | 용도 |
|-----------|---------|------|
| 3 | ~156km | 나라/광역 수준 |
| 4 | ~39km | 도시 수준 |
| 5 | ~5km | 구/동 수준 |

## 구현 상세

### 1. GeoHash 유틸리티 (`listener-server/utils.js`)

외부 라이브러리 없이 직접 구현한 3개 함수:

- **`encodeGeoHash(lat, lng, precision)`** — 위도/경도를 geohash 문자열로 변환
- **`geoHashNeighbors(hash)`** — 인접 8개 셀의 geohash 반환 (경계 효과 방지)
- **`expandGeoHashPrefixes(lat, lng, precision)`** — 중심 + 8개 이웃 = 9개 prefix 반환

### 2. 공간 인덱스 (`listener-server/blockchain.js`)

```
geoIndex = { "wydm": Set([spotId1, spotId2, ...]), ... }
cachedSpotArray = null  // getAllSpotsCached() 결과 캐시
```

**인덱스 관리:**
- `addToGeoIndex(spot)` — geohash 계산 후 인덱스에 추가
- `removeFromGeoIndex(spot)` — 기존 위치에서 제거 (SpotUpdated 시)
- `rebuildGeoIndex()` — 전체 재구축 (초기화/복원 시)
- `invalidateSpotArrayCache()` — 배열 캐시 무효화

**인덱스 업데이트 시점:**
- `loadMetadata()` 후
- Firestore 복원 후
- 놓친 이벤트 복구 후
- 7개 이벤트 핸들러: SpotCreated, SpotUpdated, Redeposited, CooldownUpdated, AllowDuplicateClaimsUpdated, TelegramClaimed, DeviceClaimed

### 3. 적응형 검색 (`listener-server/routes/spots.js`)

위치 기반 요청 시 좁은 범위에서 넓은 범위로 점진적 확대:

```
precision 5 (~5km) → 결과 부족? → precision 4 (~39km) → 부족? → precision 3 (~156km) → 부족? → 전체 fallback
```

추가로 기존 3중 `.map()` 체인을 단일 루프 `processSpots()`로 통합하여 불필요한 객체 복사 제거.

### 4. Firebase Functions (`functions/index.js`)

- 동일한 GeoHash 유틸 함수 포함
- **30초 TTL 인메모리 캐시** — warm start에서 Firestore 반복 조회 방지
- 캐시 데이터 위에 GeoHash 인덱스 구축 후 동일한 적응형 검색 로직 적용

## 수정 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `listener-server/utils.js` | `encodeGeoHash`, `geoHashNeighbors`, `expandGeoHashPrefixes` 추가 |
| `listener-server/blockchain.js` | `geoIndex` 구조체, 인덱스 관리 함수, `getSpotsByGeoHash`, `cachedSpotArray` 캐시, 이벤트 핸들러 인덱스 업데이트 |
| `listener-server/routes/spots.js` | 적응형 GeoHash 검색 + 단일 루프 최적화 |
| `functions/index.js` | 인메모리 캐시 + GeoHash 유틸 + 적응형 검색 |
| `listener-server/__tests__/utils.test.js` | GeoHash 유틸 테스트 13개 추가 |
| `listener-server/__tests__/spots-pagination.test.js` | GeoHash 적응형 검색 테스트 6개 추가 |

## 테스트

```bash
cd listener-server && npm test  # 106 tests passed
cd functions && npm test        # 14 tests passed
```

### 추가된 테스트 케이스

**utils.test.js (GeoHash):**
- encodeGeoHash 정확성 (알려진 좌표 → 알려진 해시)
- prefix 포함 관계 (precision 3 ⊂ 4 ⊂ 5)
- 가까운 좌표 = 같은 셀, 먼 좌표 = 다른 셀
- 경계 케이스: 적도, 날짜변경선
- geoHashNeighbors: 8개 반환, 중복 없음
- expandGeoHashPrefixes: 9개 반환, 첫 번째 = 중심

**spots-pagination.test.js (GeoHash 검색):**
- 거리순 정렬 일관성
- 적응형 확대 (뉴욕 좌표 → fallback)
- getSpotsByGeoHash 호출 여부 (위치 있을 때만)
- filter=active와 GeoHash 검색 복합
- 서울 스팟 < 부산 스팟 정렬 검증

## 성능 기대치

- **기존**: 모든 요청에 O(N) 거리 계산 + O(N log N) 정렬 (N = 전체 스팟 수)
- **개선**: 위치 기반 요청 시 O(K) 거리 계산 + O(K log K) 정렬 (K = 근처 셀의 스팟 수, K << N)
- 서울에서 요청 시 ~5km 반경(precision 5)의 스팟만 먼저 검색, 대부분의 요청이 첫 단계에서 충분한 결과를 얻음
