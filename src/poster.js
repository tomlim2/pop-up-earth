// 포스터에 인쇄된 것들: 종이 결, 큰 제목, 감자가 튀어나온 동그란 칼선 자리, 지오이드 색 범례, 작은 글자들.
// 위치 정보 칸은 자주 바뀌니 따로 작은 캔버스로 (포스터 전체를 다시 올리지 않게)

import { formatCoordinates, formatHeight, korean, POSTER } from './geo.js';
import { rampStops } from './potato.js';

export const ACCENT = '#ff4a1c';
export const INK = '#141414';
const GREY = '#8c877d';
const PAPER = '#efece4';
const SANS = '"Helvetica Neue", Helvetica, "Apple SD Gothic Neo", "Pretendard", Arial, sans-serif';

const M = 150; // 여백
export const SOCKET = { x: 1024, y: 1360, radius: 540 }; // 감자가 튀어나온 자리 (포스터 px)
export const INFO = { top: 2100, height: 300 }; // 위치 정보 칸 (포스터 px)
const COLUMNS = { name: M, coordinates: 1130, height: 1560 };

// 마우스가 없는 기기(폰)에선 '올려서' 대신 '눌러서'
const touch = matchMedia('(hover: none)').matches;

const TEXT = korean
  ? {
      kicker: ['팝업 포스터', 'GOCO06s 지오이드 ×10,000', 'Natural Earth 1:110m'],
      subtitle: '중력으로 보면, 감자.',
      legend: '지오이드 높이',
      labels: ['위치', '좌표', '지오이드 높이'],
      hint: touch ? '끌어서 돌리고, 눌러서 읽어요' : '끌어서 돌리고, 올려서 읽어요',
      empty: touch ? '감자를 눌러 보세요' : '감자 위에 올려 보세요',
      credit: '지오이드 GOCO06s — Kvas 외 (2019), CC BY 4.0 · NASA SVS 〈The Geoid〉(2026)가 쓴 중력장 모델',
    }
  : {
      kicker: ['Pop-up poster', 'GOCO06s geoid ×10,000', 'Natural Earth 1:110m'],
      subtitle: 'Seen by gravity, a potato.',
      legend: 'Geoid height',
      labels: ['Place', 'Coordinates', 'Geoid height'],
      hint: touch ? 'Drag to spin · Tap to read' : 'Drag to spin · Hover to read',
      empty: touch ? 'Tap the potato' : 'Hover the potato',
      credit: 'Geoid: GOCO06s — Kvas et al. (2019), CC BY 4.0 · the gravity model behind NASA SVS “The Geoid” (2026)',
    };

export function drawPoster(geoid) {
  const canvas = canvasOf(POSTER.width, POSTER.height);
  const ctx = canvas.getContext('2d');
  const W = POSTER.width;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, POSTER.height);
  grain(ctx, W, POSTER.height);

  // 제목 "Earth." — 마침표는 주황
  ctx.fillStyle = INK;
  ctx.font = `700 400px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Earth', M - 18, 520);
  const end = M - 18 + ctx.measureText('Earth').width;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(end + 52, 486, 34, 0, Math.PI * 2);
  ctx.fill();

  // 오른쪽 위 작은 글자
  ctx.textAlign = 'right';
  ctx.font = `500 34px ${SANS}`;
  TEXT.kicker.forEach((line, i) => {
    ctx.fillStyle = i ? GREY : INK;
    ctx.fillText(line, W - M, 360 + i * 50);
  });
  ctx.textAlign = 'left';

  hairline(ctx, 640);
  ctx.fillStyle = INK;
  ctx.font = `500 44px ${SANS}`;
  ctx.fillText(TEXT.subtitle, M, 730);

  // 감자가 튀어나온 동그란 자리: 살짝 꺼진 바닥 + 가는 칼선
  const { x, y, radius } = SOCKET;
  const well = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
  well.addColorStop(0, '#e9e5dc');
  well.addColorStop(1, '#e4dfd5');
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  legend(ctx, geoid);

  // 아래: 위치 정보 칸 제목, 꼬리말
  hairline(ctx, 2000);
  ctx.font = `600 28px ${SANS}`;
  ctx.fillStyle = GREY;
  const [nameLabel, coordinatesLabel, heightLabel] = TEXT.labels;
  spaced(ctx, nameLabel, COLUMNS.name, 2068);
  spaced(ctx, coordinatesLabel, COLUMNS.coordinates, 2068);
  spaced(ctx, heightLabel, COLUMNS.height, 2068);

  hairline(ctx, 2600);
  ctx.font = `500 32px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(TEXT.hint, M, 2690);
  ctx.textAlign = 'right';
  ctx.fillStyle = GREY;
  ctx.fillText('N° 01 — 2026', W - M, 2690);
  ctx.textAlign = 'left';
  // 자료 출처 (CC BY)
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText(TEXT.credit, M, 2752);
  return canvas;
}

// 지오이드 색 띠: 가장 낮은 곳 ~ 가장 높은 곳
function legend(ctx, geoid) {
  const left = M;
  const top = 1918;
  const width = 360;
  const height = 14;
  const stops = rampStops();
  const lowest = geoid.min;
  const highest = geoid.max;
  const gradient = ctx.createLinearGradient(left, 0, left + width, 0);
  for (const [h, color] of stops) {
    const t = (Math.min(Math.max(h, lowest), highest) - lowest) / (highest - lowest);
    gradient.addColorStop(t, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, width, height);
  ctx.font = `500 26px ${SANS}`;
  ctx.fillStyle = GREY;
  ctx.fillText(TEXT.legend, left, top - 16);
  ctx.fillStyle = INK;
  ctx.fillText(formatHeight(lowest), left, top + height + 34);
  ctx.textAlign = 'right';
  ctx.fillText(formatHeight(highest), left + width, top + height + 34);
  ctx.textAlign = 'left';
}

/** 위치 정보 칸 (투명 배경). place 가 없으면 안내 문구 */
export function drawInfo(canvas, place) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';
  if (!place) {
    ctx.fillStyle = GREY;
    ctx.font = `500 64px ${SANS}`;
    ctx.fillText(TEXT.empty, COLUMNS.name, 140);
    return;
  }
  ctx.fillStyle = INK;
  let size = 88;
  ctx.font = `700 ${size}px ${SANS}`;
  const room = COLUMNS.coordinates - COLUMNS.name - 60;
  const width = ctx.measureText(place.name).width;
  if (width > room) {
    size = Math.max(44, Math.floor((size * room) / width));
    ctx.font = `700 ${size}px ${SANS}`;
  }
  ctx.fillText(place.name, COLUMNS.name, 140);
  ctx.font = `500 40px ${SANS}`;
  ctx.fillText(formatCoordinates(place.lat, place.lon), COLUMNS.coordinates, 128);
  ctx.font = `700 52px ${SANS}`;
  ctx.fillStyle = place.height >= 0 ? ACCENT : '#4f6f93';
  ctx.fillText(formatHeight(place.height), COLUMNS.height, 132);
  // 지금 가리키는 곳 표시: 주황 점
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(COLUMNS.name - 52, 108, 14, 0, Math.PI * 2);
  ctx.fill();
}

export function createInfoCanvas() {
  return canvasOf(POSTER.width, INFO.height);
}

export const OCEAN = korean ? '바다' : 'Ocean';

function hairline(ctx, y) {
  ctx.fillStyle = INK;
  ctx.fillRect(M, y, POSTER.width - M * 2, 2);
}

// 대문자 + 자간 넓게 (canvas letterSpacing 지원하면 쓰고, 아니면 그냥)
function spaced(ctx, text, x, y) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(text.toUpperCase(), x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// 아주 옅은 종이 결
function grain(ctx, width, height) {
  const tile = canvasOf(256, 256);
  const tctx = tile.getContext('2d');
  const image = tctx.createImageData(256, 256);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() < 0.5 ? 0 : 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = Math.random() * 10;
  }
  tctx.putImageData(image, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, width, height);
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
