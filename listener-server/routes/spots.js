const express = require('express');
const blockchain = require('../blockchain');
const { isWithinActiveTime, haversineDistance, expandGeoHashPrefixes } = require('../utils');

const router = express.Router();

// 단일 루프: active 플래그 + 필터 + 거리 계산을 한 번에 처리
function processSpots(spots, filter, userLat, userLng) {
  const result = [];
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const active = s.remaining > 0 && isWithinActiveTime(s.start_time, s.end_time, s.daily_start_time, s.daily_end_time, s.utc_offset);
    if (filter === 'active' && !active) continue;
    if (filter === 'inactive' && active) continue;
    const entry = { ...s, active };
    if (userLat != null) {
      entry.distance = Math.round(haversineDistance(userLat, userLng, s.lat, s.lng));
    }
    result.push(entry);
  }
  return result;
}

// 적응형 GeoHash 검색: 좁은 범위에서 넓은 범위로 확대
const ADAPTIVE_PRECISIONS = [5, 4, 3]; // ~5km → ~39km → ~156km

function adaptiveGeoSearch(userLat, userLng, filter, needed) {
  for (const precision of ADAPTIVE_PRECISIONS) {
    const prefixes = expandGeoHashPrefixes(userLat, userLng, precision);
    const candidates = blockchain.getSpotsByGeoHash(prefixes);
    const processed = processSpots(candidates, filter, userLat, userLng);
    if (processed.length >= needed) {
      processed.sort((a, b) => a.distance - b.distance);
      return processed;
    }
  }
  // fallback: 전체 조회
  const allSpots = blockchain.getAllSpotsCached();
  const processed = processSpots(allSpots, filter, userLat, userLng);
  processed.sort((a, b) => a.distance - b.distance);
  return processed;
}

// GET /api/spots — 스팟 목록 (페이지네이션 지원)
// 쿼리 파라미터:
//   lat, lng  → 위치 기반 거리 정렬 (선택) + GeoHash 적응형 검색
//   limit     → 페이지 크기 (기본 50, 최대 200) — lat/lng와 함께 사용 시 페이지네이션 활성화
//   offset    → 시작 위치 (기본 0)
//   filter    → active / inactive (선택)
// 하위 호환: limit/lat/lng 없이 호출하면 기존처럼 전체 배열 반환
router.get('/', async (req, res) => {
  try {
    const { lat, lng, limit, offset, filter } = req.query;
    const hasLocation = lat != null && lng != null;
    const hasPagination = limit != null;

    // 페이지네이션 파라미터 파싱 (필터링에 필요)
    const rawLimit = parseInt(limit, 10);
    const parsedLimit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    let filtered;

    if (hasLocation) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const needed = parsedOffset + parsedLimit;
      filtered = adaptiveGeoSearch(userLat, userLng, filter, needed);
    } else {
      // 위치 없으면 전체 조회
      const allSpots = blockchain.getAllSpotsCached();
      filtered = processSpots(allSpots, filter, null, null);
    }

    // 페이지네이션 없으면 전체 반환 (하위 호환)
    if (!hasPagination) {
      return res.json(filtered);
    }

    // 페이지네이션 적용
    const total = filtered.length;
    const paged = filtered.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      spots: paged,
      pagination: {
        total,
        offset: parsedOffset,
        limit: parsedLimit,
        hasMore: parsedOffset + parsedLimit < total,
      },
    });
  } catch (err) {
    console.error('스팟 목록 에러:', err.message);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

// POST /api/spots/:id/allow-duplicate-claims — 중복 발행 허용 여부 수정
router.post('/:id/allow-duplicate-claims', async (req, res) => {
  try {
    const spotId = Number(req.params.id);
    const { allow } = req.body;

    if (allow === undefined || allow === null) {
      return res.status(400).json({ error: 'allow value is required' });
    }

    // 스팟 존재 확인
    const spot = await blockchain.getSpot(spotId);
    if (!spot || spot.reward === 0) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    await blockchain.updateAllowDuplicateClaims(spotId, allow);

    res.json({
      message: `Duplicate claims ${allow ? 'enabled' : 'disabled'}`,
      spot_id: spotId,
      allow_duplicate_claims: allow,
    });
  } catch (err) {
    console.error('중복 발행 설정 에러:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update duplicate claims setting' });
  }
});

module.exports = router;
