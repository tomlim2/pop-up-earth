// 감자 지구: 경위도 격자 구에 지오이드 높이 × 10,000 을 반지름으로 더한 모양.
// 둥근 구와 감자 모양을 모프 타깃 두 벌로 만들어서 그 사이를 스프링으로 오감

import * as THREE from 'three';
import { contours } from 'd3-contour';
import { geoEquirectangular, geoGraticule, geoPath } from 'd3-geo';

export const EXAGGERATION = 10_000;
export const AXIAL_TILT = 23.4; // 자전축 기울기 (도). 3D 감자와 포스터에 인쇄된 축 선이 같이 씀
const EARTH_RADIUS_M = 6_371_000;
const LON_SEGMENTS = 256;
const LAT_SEGMENTS = 128;
const TEXTURE = { width: 2048, height: 1024 };

/** 경위도(도) → 단위 벡터. 북극 +y, 경도 0 이 +z(관객 쪽), 동쪽이 +x */
export function direction(lat, lon, target = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(lat);
  const lambda = THREE.MathUtils.degToRad(lon);
  return target.set(Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda));
}

/** 단위 벡터 → [위도, 경도] (도) */
export function latLonOf(v) {
  return [THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(v.y, -1, 1))), THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z))];
}

/** 높이(m) → 감자 반지름 (둥근 구 = 1) */
export function radiusOf(height, amount = 1) {
  return 1 + (height * EXAGGERATION * amount) / EARTH_RADIUS_M;
}

export function potatoGeometry(geoid) {
  const columns = LON_SEGMENTS + 1;
  const count = columns * (LAT_SEGMENTS + 1);
  const sphere = new Float32Array(count * 3);
  const potato = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const dir = new THREE.Vector3();

  for (let j = 0; j <= LAT_SEGMENTS; j++) {
    const lat = 90 - (j * 180) / LAT_SEGMENTS;
    for (let i = 0; i <= LON_SEGMENTS; i++) {
      const lon = -180 + (i * 360) / LON_SEGMENTS;
      const k = j * columns + i;
      direction(lat, lon, dir);
      sphere.set([dir.x, dir.y, dir.z], k * 3);
      const r = radiusOf(geoid.sample(lat, lon));
      potato.set([dir.x * r, dir.y * r, dir.z * r], k * 3);
      uvs.set([i / LON_SEGMENTS, 1 - j / LAT_SEGMENTS], k * 2);
    }
  }

  const index = [];
  for (let j = 0; j < LAT_SEGMENTS; j++) {
    for (let i = 0; i < LON_SEGMENTS; i++) {
      const a = j * columns + i;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new THREE.BufferAttribute(sphere, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(sphere.slice(), 3)); // 단위 구는 위치 = 법선
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.morphAttributes.position = [new THREE.BufferAttribute(potato, 3)];
  geometry.morphAttributes.normal = [new THREE.BufferAttribute(normalsOf(potato, columns), 3)];
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.25);
  return geometry;
}

// 이웃 정점으로 접선을 구해 법선 (경도는 한 바퀴 이어서 이음매가 안 보이게, 극은 바깥 방향)
function normalsOf(positions, columns) {
  const normals = new Float32Array(positions.length);
  const at = (i, j, v) => v.fromArray(positions, (j * columns + i) * 3);
  const east = new THREE.Vector3();
  const west = new THREE.Vector3();
  const north = new THREE.Vector3();
  const south = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let j = 0; j <= LAT_SEGMENTS; j++) {
    for (let i = 0; i <= LON_SEGMENTS; i++) {
      const k = (j * columns + i) * 3;
      if (j === 0 || j === LAT_SEGMENTS) {
        n.fromArray(positions, k).normalize();
      } else {
        at((i + 1) % LON_SEGMENTS, j, east);
        at((i - 1 + LON_SEGMENTS) % LON_SEGMENTS, j, west);
        at(i, j - 1, north);
        at(i, j + 1, south);
        n.crossVectors(east.sub(west), north.sub(south)).normalize(); // 동 × 북 = 위(바깥)
      }
      n.toArray(normals, k);
    }
  }
  return normals;
}

// 색 띠: 낮은 곳(파랑 회색) → 0m(종이) → 높은 곳(주황). 미니멀하게 연하게
const RAMP = [
  [-110, [127, 151, 178]],
  [-45, [198, 207, 215]],
  [0, [239, 236, 228]],
  [40, [246, 205, 182]],
  [85, [255, 143, 99]],
];

function colorOf(height) {
  for (let i = 1; i < RAMP.length; i++) {
    const [h1, c1] = RAMP[i];
    if (height <= h1 || i === RAMP.length - 1) {
      const [h0, c0] = RAMP[i - 1];
      const t = THREE.MathUtils.clamp((height - h0) / (h1 - h0), 0, 1);
      return c0.map((v, k) => v + (c1[k] - v) * t);
    }
  }
  return RAMP[0][1];
}

/** 정거원통도법 텍스처: 지오이드 색 + 20m 등고선 + 해안선 + 30° 경위선 */
export function potatoTexture(geoid, earth) {
  const { width: W, height: H } = TEXTURE;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const image = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      const [r, g, b] = colorOf(geoid.sample(lat, -180 + ((x + 0.5) / W) * 360));
      const k = (y * W + x) * 4;
      image.data[k] = r;
      image.data[k + 1] = g;
      image.data[k + 2] = b;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // 등고선: 격자 둘레를 한 칸씩 덧대서 그림. 경도는 반대쪽 끝을 이어 붙여 날짜변경선을 건너가게 하고,
  // 등고선 다각형이 격자 테두리를 따라 도는 선은 캔버스 밖으로 밀려나게
  const { rows, cols, heights } = geoid;
  const padded = new Float64Array((cols + 2) * (rows + 2));
  for (let r = 0; r < rows + 2; r++) {
    const row = THREE.MathUtils.clamp(r - 1, 0, rows - 1);
    for (let c = 0; c < cols + 2; c++) padded[r * (cols + 2) + c] = heights[row * cols + ((c - 1 + cols) % cols)];
  }
  const levels = [];
  for (let h = -100; h <= 80; h += 20) levels.push(h);
  const sx = W / cols;
  const sy = H / (rows - 1);
  // 격자 좌표(값이 칸 가운데, 덧댄 한 칸) → 캔버스 좌표
  for (const contour of contours().size([cols + 2, rows + 2]).thresholds(levels)(padded)) {
    ctx.beginPath();
    for (const polygon of contour.coordinates) {
      for (const ring of polygon) {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - 1.5) * sx, (y - 1.5) * sy));
        ctx.closePath();
      }
    }
    ctx.strokeStyle = contour.value === 0 ? 'rgba(20, 20, 20, 0.34)' : 'rgba(20, 20, 20, 0.16)';
    ctx.lineWidth = contour.value === 0 ? 2.2 : 1.4;
    ctx.stroke();
  }

  const projection = geoEquirectangular()
    .scale(W / (2 * Math.PI))
    .translate([W / 2, H / 2]);
  const path = geoPath(projection, ctx);
  ctx.beginPath();
  path(geoGraticule().step([30, 30])());
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.08)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  path(earth.land);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.fill();
  ctx.beginPath();
  path(earth.coast);
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.78)';
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas;
}

/** 색 띠 (포스터 범례용): [[높이, 'rgb(…)'], …] */
export function rampStops() {
  return RAMP.map(([h, [r, g, b]]) => [h, `rgb(${r}, ${g}, ${b})`]);
}
