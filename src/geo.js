// 지구 데이터: 나라 경계(Natural Earth 1:110m, world-atlas) + 지오이드 높이(GOCO06s 로 계산한 1° 격자, public/geoid.bin)

import { geoBounds, geoContains } from 'd3-geo';
import isoCountries from 'i18n-iso-countries';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';

// 포스터 인쇄면 캔버스 크기 (px). 3D 에선 가로 1 = POSTER.width px
export const POSTER = { width: 2048, height: 2868 }; // 1 : 1.4

// 시스템 언어를 따르고, 주소에 ?lang=ko / ?lang=en 을 붙이면 그걸로
const lang = new URLSearchParams(location.search).get('lang') ?? navigator.language ?? '';
export const korean = lang.toLowerCase().startsWith('ko');
const regionNames = new Intl.DisplayNames([korean ? 'ko' : 'en'], { type: 'region' });

export function loadEarth() {
  const land = feature(world, world.objects.land);
  // 해안선은 선으로 따로: 땅 다각형을 그대로 그으면 날짜변경선에서 잘린 자리에 세로선이 생김
  const coast = mesh(world, world.objects.land);
  const countries = feature(world, world.objects.countries).features.map((country) => ({
    feature: country,
    name: nameOf(country),
    bounds: geoBounds(country), // [[서, 남], [동, 북]] 빠르게 거르기용
  }));
  return { land, coast, countries };
}

/** 그 경위도에 있는 나라 이름. 바다면 null */
export function countryAt(earth, lon, lat) {
  for (const country of earth.countries) {
    const [[west, south], [east, north]] = country.bounds;
    if (lat < south || lat > north) continue;
    // 날짜변경선을 넘는 나라(러시아, 피지)는 west > east
    if (west <= east ? lon < west || lon > east : lon < west && lon > east) continue;
    if (geoContains(country.feature, [lon, lat])) return country.name;
  }
  return null;
}

// 시스템 언어로 된 나라 이름 (ISO 코드가 없는 곳은 데이터의 영어 이름)
function nameOf(country) {
  const alpha2 = country.id ? isoCountries.numericToAlpha2(country.id) : null;
  if (alpha2) {
    try {
      return regionNames.of(alpha2);
    } catch {
      // 모르는 코드면 아래로
    }
  }
  return country.properties.name;
}

// ── 지오이드 ────────────────────────────────────────

const ROWS = 181; // 위도 90 → -90
const COLS = 360; // 경도 -180 → 179

export async function loadGeoid() {
  const response = await fetch(`${import.meta.env.BASE_URL}geoid.bin`);
  const raw = new Int16Array(await response.arrayBuffer());
  const heights = Float32Array.from(raw, (v) => v / 10); // 0.1m 단위 → m
  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { rows: ROWS, cols: COLS, heights, min, max, sample: (lat, lon) => sample(heights, lat, lon) };
}

// 양선형 보간. 경도는 한 바퀴 돌아 이어짐
function sample(heights, lat, lon) {
  const y = Math.min(ROWS - 1.0001, Math.max(0, 90 - lat));
  const x = ((((lon + 180) % 360) + 360) % 360);
  const r0 = Math.floor(y);
  const c0 = Math.floor(x);
  const c1 = (c0 + 1) % COLS;
  const fy = y - r0;
  const fx = x - c0;
  const top = heights[r0 * COLS + c0] * (1 - fx) + heights[r0 * COLS + c1] * fx;
  const bottom = heights[(r0 + 1) * COLS + c0] * (1 - fx) + heights[(r0 + 1) * COLS + c1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// ── 글자 ───────────────────────────────────────────

export function formatCoordinates(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}  ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export function formatHeight(meters) {
  const rounded = Math.round(meters);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)} m`;
}
