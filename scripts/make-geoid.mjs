// GOCO06s 지오이드 높이를 1° 격자로 → public/geoid.bin
//   npm run make:geoid
//
// NASA SVS "The Geoid" (2026, https://svs.gsfc.nasa.gov/5660/) 가 쓴 중력장 모델 GOCO06s
// (위성 19대 · 관측 11.6억 건으로 만든 위성 전용 모델, 차수 300) 의 구면조화 계수에서 지오이드 높이를 직접 계산.
// 계수 파일(10 MB)은 처음 한 번 받아서 scripts/.cache 에 둠 (저장소엔 안 넣음).
//   Kvas et al. (2019): The satellite-only gravity field model GOCO06s. GFZ Data Services.
//   https://doi.org/10.5880/ICGEM.2019.002 (CC BY 4.0)
//
// 형식: Int16 리틀 엔디언, 단위 0.1m. 181 줄(위도 90 → -90) × 360 칸(경도 -180 → 179).
//
// 계산 (Bruns): N = GM / (r·γ) · Σn (R/r)^n Σm (ΔC̄nm cos mλ + S̄nm sin mλ) P̄nm(sin φ̄)
//   - 기준 시점(2010-01-01)의 정적 성분(gfct)만. 추세·연주기 항은 mm 수준이라 뺌
//   - 정규 중력장 = WGS84 타원체. 짝수 띠 계수를 모델의 GM·R 로 맞춰서 빼고, 0차 항은 GM 차이만 (W0 = U0)
//   - 점은 WGS84 타원체 위 (측지 위도 → 지심 위도·반지름), γ 는 Somigliana 정규 중력
//   - 산지에서 높이 이상과 지오이드의 차이(티베트에서 2~3 m)는 무시

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://datapub.gfz-potsdam.de/download/10.5880.ICGEM.2019.002/GOCO06s.gfc';
const CACHE = fileURLToPath(new URL('./.cache/GOCO06s.gfc', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../public/geoid.bin', import.meta.url));
const ROWS = 181;
const COLS = 360;

// WGS84 (NIMA TR8350.2): 정규 중력장의 완전 정규화 짝수 띠 계수 C̄n0
const WGS84 = { a: 6378137, f: 1 / 298.257223563, GM: 3.986004418e14, gammaE: 9.7803253359, k: 0.00193185265241 };
const NORMAL = { 2: -0.484166774985e-3, 4: 0.790303733511e-6, 6: -0.168725117669e-8, 8: 0.346053316702e-11, 10: -0.265006218331e-14 };
const e2 = WGS84.f * (2 - WGS84.f);

if (!existsSync(CACHE)) {
  console.log(`계수 파일 받는 중 … ${SOURCE}`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`${SOURCE}: ${response.status} ${response.statusText}`);
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, Buffer.from(await response.arrayBuffer()));
}

// ── 계수 읽기 (ICGEM gfc 형식) ────────────────────────

const text = await readFile(CACHE, 'utf8');
const end = text.search(/^end_of_head/m);
const header = Object.fromEntries(
  text
    .slice(text.search(/^begin_of_head/m), end)
    .split('\n')
    .map((line) => line.trim().split(/\s+/)),
);
const GM = Number(header.earth_gravity_constant);
const R = Number(header.radius);
const N_MAX = Number(header.max_degree);
if (header.norm !== 'fully_normalized') throw new Error(`정규화가 다름: ${header.norm}`);

const at = (n, m) => (n * (n + 1)) / 2 + m;
const C = new Float64Array(at(N_MAX, N_MAX) + 1);
const S = new Float64Array(C.length);
for (const line of text.slice(end).split('\n').slice(1)) {
  const [key, n, m, c, s] = line.trim().split(/\s+/);
  if (key !== 'gfc' && key !== 'gfct') continue; // trnd / acos / asin 은 뺌
  const k = at(Number(n), Number(m));
  C[k] = Number(c.replace(/d/i, 'e'));
  S[k] = Number(s.replace(/d/i, 'e'));
}

// 교란 퍼텐셜 T = V − U 의 계수
C[0] -= WGS84.GM / GM;
for (const [n, value] of Object.entries(NORMAL)) C[at(Number(n), 0)] -= value * (WGS84.GM / GM) * (WGS84.a / R) ** Number(n);

// ── 합성 ────────────────────────────────────────────

// 완전 정규화 르장드르 함수 P̄nm(t), t = sin(지심 위도), u = cos. 차수 300 이면 배율 조정 없이도 충분
const P = new Float64Array(C.length);
function legendre(t, u) {
  P[0] = 1;
  P[at(1, 0)] = Math.sqrt(3) * t;
  P[at(1, 1)] = Math.sqrt(3) * u;
  for (let m = 0; m <= N_MAX; m++) {
    if (m >= 2) P[at(m, m)] = u * Math.sqrt((2 * m + 1) / (2 * m)) * P[at(m - 1, m - 1)];
    if (m >= 1 && m < N_MAX) P[at(m + 1, m)] = t * Math.sqrt(2 * m + 3) * P[at(m, m)];
    for (let n = m + 2; n <= N_MAX; n++) {
      const a = Math.sqrt(((2 * n - 1) * (2 * n + 1)) / ((n - m) * (n + m)));
      const b = Math.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((n - m) * (n + m) * (2 * n - 3)));
      P[at(n, m)] = a * t * P[at(n - 1, m)] - b * P[at(n - 2, m)];
    }
  }
}

const cosTable = new Float64Array((N_MAX + 1) * COLS);
const sinTable = new Float64Array((N_MAX + 1) * COLS);
for (let m = 0; m <= N_MAX; m++) {
  for (let col = 0; col < COLS; col++) {
    const lambda = ((col - 180) * Math.PI) / 180;
    cosTable[m * COLS + col] = Math.cos(m * lambda);
    sinTable[m * COLS + col] = Math.sin(m * lambda);
  }
}

const data = new Int16Array(ROWS * COLS);
const A = new Float64Array(N_MAX + 1);
const B = new Float64Array(N_MAX + 1);
let min = [Infinity];
let max = [-Infinity];
for (let row = 0; row < ROWS; row++) {
  // 타원체 위의 점: 측지 위도 → 지심 반지름·위도
  const phi = ((90 - row) * Math.PI) / 180;
  const sin2 = Math.sin(phi) ** 2;
  const radius = WGS84.a / Math.sqrt(1 - e2 * sin2);
  const x = radius * Math.cos(phi);
  const z = radius * (1 - e2) * Math.sin(phi);
  const r = Math.hypot(x, z);
  const gamma = (WGS84.gammaE * (1 + WGS84.k * sin2)) / Math.sqrt(1 - e2 * sin2);
  legendre(z / r, x / r);

  const q = R / r;
  A.fill(0);
  B.fill(0);
  let qn = 1;
  for (let n = 0; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      const k = at(n, m);
      A[m] += qn * C[k] * P[k];
      B[m] += qn * S[k] * P[k];
    }
    qn *= q;
  }

  const scale = GM / (r * gamma);
  for (let col = 0; col < COLS; col++) {
    let sum = 0;
    for (let m = 0; m <= N_MAX; m++) sum += A[m] * cosTable[m * COLS + col] + B[m] * sinTable[m * COLS + col];
    const height = scale * sum;
    data[row * COLS + col] = Math.round(height * 10);
    if (height < min[0]) min = [height, 90 - row, col - 180];
    if (height > max[0]) max = [height, 90 - row, col - 180];
  }
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, new Uint8Array(data.buffer));
const where = ([h, lat, lon]) => `${h.toFixed(1)} m (${lat}°, ${lon}°)`;
console.log(`geoid.bin: ${header.modelname} 차수 ${N_MAX}, ${ROWS}×${COLS}, 최저 ${where(min)} … 최고 ${where(max)}`);
