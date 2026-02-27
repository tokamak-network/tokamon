#!/usr/bin/env node
/**
 * 스타벅스 GPS 데이터 수집
 *
 * 1차: GitHub CSV (chrismeller/StarbucksLocations) — 한국, 일본, 프랑스 등 전 세계
 * 2차: Overpass API — CSV에 없거나 보충이 필요한 도시
 *
 * 도시 하나 성공할 때마다 파일 저장, 다시 실행하면 이어하기
 *
 * 사용법: node scripts/fetch-starbucks.js [--limit 1000]
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'starbucks-data.json');
const CSV_URL = 'https://raw.githubusercontent.com/chrismeller/StarbucksLocations/master/stores.csv';

// ── 도시 설정 ──
// csvFilter: CSV에서 필터링할 조건 (countryCode + city 매칭)
// overpass: CSV 결과가 부족할 때 보충용
const CITIES = [
  {
    city: 'Seoul', country: 'KR', utcOffset: 9,
    csvFilter: { countryCode: 'KR', cities: ['서울', 'Seoul', 'seoul'] },
  },
  {
    city: 'Busan', country: 'KR', utcOffset: 9,
    csvFilter: { countryCode: 'KR', cities: ['부산', 'Busan', 'busan'] },
  },
  {
    city: 'Tokyo', country: 'JP', utcOffset: 9,
    csvFilter: { countryCode: 'JP', cities: ['Tokyo', 'tokyo', '東京', 'Chiyoda', 'Shibuya', 'Shinjuku', 'Minato', 'Setagaya', 'Meguro', 'Toshima', 'Chuo', 'Taito', 'Bunkyo', 'Shinagawa', 'Koto', 'Sumida', 'Nakano', 'Suginami', 'Itabashi', 'Nerima', 'Adachi', 'Katsushika', 'Edogawa', 'Ota'] },
  },
  {
    city: 'Osaka', country: 'JP', utcOffset: 9,
    csvFilter: { countryCode: 'JP', cities: ['Osaka', 'osaka', '大阪'] },
  },
  {
    city: 'New York', country: 'US', utcOffset: -5,
    csvFilter: { countryCode: 'US', cities: ['New York', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx'], stateCode: 'NY' },
  },
  {
    city: 'Los Angeles', country: 'US', utcOffset: -8,
    csvFilter: { countryCode: 'US', cities: ['Los Angeles', 'LA'], stateCode: 'CA' },
  },
  {
    city: 'London', country: 'GB', utcOffset: 0,
    csvFilter: { countryCode: 'GB', cities: ['London', 'london'] },
  },
  {
    city: 'Paris', country: 'FR', utcOffset: 1,
    csvFilter: { countryCode: 'FR', cities: ['Paris', 'paris'] },
  },
  {
    city: 'Bangkok', country: 'TH', utcOffset: 7,
    csvFilter: { countryCode: 'TH', cities: ['Bangkok', 'bangkok'] },
  },
  {
    city: 'Singapore', country: 'SG', utcOffset: 8,
    csvFilter: { countryCode: 'SG', cities: [] }, // 국가 전체
  },
];

// ── CSV 파싱 ──

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];
  const header = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseCSVLine(line);
    const obj = {};
    header.forEach((h, i) => (obj[h.trim()] = (fields[i] || '').trim()));
    return obj;
  });
}

// ── CSV에서 도시별 필터링 ──

function filterCityFromCSV(rows, cityConfig) {
  const { csvFilter } = cityConfig;
  const cc = csvFilter.countryCode;
  const cityNames = new Set(csvFilter.cities.map((c) => c.toLowerCase()));
  const stateCode = csvFilter.stateCode;

  return rows.filter((row) => {
    if (row.CountryCode !== cc) return false;
    if (stateCode && row.CountrySubdivisionCode !== stateCode) return false;

    // 국가 전체 (cities가 비어있으면)
    if (cityNames.size === 0) return true;

    const rowCity = (row.City || '').toLowerCase();
    return cityNames.has(rowCity);
  });
}

function csvRowToSpot(row, cityConfig) {
  const lat = parseFloat(row.Latitude);
  const lng = parseFloat(row.Longitude);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

  return {
    name: row.Name || 'Starbucks',
    lat,
    lng,
    city: cityConfig.city,
    country: cityConfig.country,
    utcOffset: cityConfig.utcOffset,
  };
}

// ── 중복 제거 ──

function dedup(spots) {
  const seen = new Set();
  return spots.filter((s) => {
    const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 메인 ──

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 1000;

  console.log(`스타벅스 데이터 수집 시작 (최대 ${limit}개)`);
  console.log(`데이터 소스: GitHub CSV (chrismeller/StarbucksLocations)`);
  console.log(`대상 도시: ${CITIES.map((c) => c.city).join(', ')}\n`);

  // CSV 다운로드
  console.log('CSV 다운로드 중...');
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`CSV 다운로드 실패: ${res.status} ${res.statusText}`);
  const csvText = await res.text();
  const allRows = parseCSV(csvText);
  console.log(`CSV 로드 완료: ${allRows.length}개 매장\n`);

  // 기존 데이터 로드 (이어하기)
  let allSpots = [];
  const completedCities = new Set();
  if (fs.existsSync(OUTPUT_PATH)) {
    allSpots = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    for (const s of allSpots) completedCities.add(s.city);
    console.log(`기존 데이터 로드: ${allSpots.length}개 (${[...completedCities].join(', ')})\n`);
  }

  // 도시별 추출
  for (const cityConfig of CITIES) {
    if (completedCities.has(cityConfig.city)) {
      console.log(`  ${cityConfig.city} (${cityConfig.country}) — 이미 수집됨, 스킵`);
      continue;
    }

    process.stdout.write(`  ${cityConfig.city} (${cityConfig.country}) 추출 중...`);

    const filtered = filterCityFromCSV(allRows, cityConfig);
    const spots = filtered
      .map((row) => csvRowToSpot(row, cityConfig))
      .filter(Boolean);
    const unique = dedup(spots);

    console.log(` ${unique.length}개`);
    allSpots.push(...unique);

    // 즉시 저장
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allSpots, null, 2));
    console.log(`    → 저장 완료 (누적 ${allSpots.length}개)`);
  }

  // 전체 중복 제거
  const before = allSpots.length;
  allSpots = dedup(allSpots);
  if (before !== allSpots.length) {
    console.log(`\n전체 중복 제거: ${before} → ${allSpots.length}개`);
  }

  if (allSpots.length > limit) {
    allSpots = allSpots.slice(0, limit);
    console.log(`limit 적용: ${limit}개로 제한`);
  }

  // 도시별 통계
  const stats = {};
  for (const s of allSpots) stats[s.city] = (stats[s.city] || 0) + 1;
  console.log('\n도시별 수집 결과:');
  for (const [city, count] of Object.entries(stats)) console.log(`  ${city}: ${count}개`);
  console.log(`  ─────────────`);
  console.log(`  합계: ${allSpots.length}개`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allSpots, null, 2));
  console.log(`\n저장 완료: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error('오류:', e.message);
  process.exit(1);
});
