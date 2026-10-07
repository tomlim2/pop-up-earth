// 포스터에 인쇄된 것들: 종이 결, 큰 제목, 감자가 튀어나온 동그란 칼선 자리, 지오이드 색 범례, 작은 글자들.
// 위치 정보 칸은 자주 바뀌니 따로 작은 캔버스로 (포스터 전체를 다시 올리지 않게)

import { formatCoordinates, formatHeight, korean, POSTER } from './geo.js';
import { rampStops } from './potato.js';

export const ACCENT = '#141414';
export const INK = '#141414';
const GREY = '#666666';
const PAPER = '#f2f2f2';
const SANS = '"Helvetica Neue", Helvetica, "Apple SD Gothic Neo", "Pretendard", Arial, sans-serif';

const M = 150; // 여백
export const SOCKET = { x: 1024, y: 1400, radius: 650 }; // 감자가 튀어나온 자리 (포스터 px)
export const INFO = { top: 2300, height: 300 }; // 위치 정보 칸 (포스터 px)
const COLUMNS = { name: M, coordinates: 1130, height: 1560 };

const TEXT = korean
  ? {
      kicker: ['팝업 포스터', 'GOCO06s 지오이드 ×10,000', 'Natural Earth 1:110m'],
      subtitle: '중력으로 보면, 감자.',
      legend: '지오이드 높이',
      labels: ['위치', '좌표', '지오이드 높이'],
      credit: '지오이드 GOCO06s — Kvas 외 (2019), CC BY 4.0 · NASA SVS 〈The Geoid〉(2026)가 쓴 중력장 모델',
    }
  : {
      kicker: ['Pop-up poster', 'GOCO06s geoid ×10,000', 'Natural Earth 1:110m'],
      subtitle: 'Seen by gravity, a potato.',
      legend: 'Geoid height',
      labels: ['Place', 'Coordinates', 'Geoid height'],
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
  ctx.font = `700 300px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '-10px';
  ctx.fillText('Earth', M - 14, 430);
  const end = M - 14 + ctx.measureText('Earth').width;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(end + 40, 404, 26, 0, Math.PI * 2);
  ctx.fill();

  // 오른쪽 위 작은 글자
  // 오른쪽 여백선을 넘지 않게: 가장 긴 줄 기준으로 글자 크기를 줄여 세 줄을 같은 크기로
  let kickerSize = 32;
  ctx.font = `500 ${kickerSize}px ${SANS}`;
  const kickerRoom = W - M - COLUMNS.height;
  const kickerWidth = Math.max(...TEXT.kicker.map((line) => ctx.measureText(line).width));
  if (kickerWidth > kickerRoom) kickerSize = Math.floor((kickerSize * kickerRoom) / kickerWidth);
  ctx.font = `500 ${kickerSize}px ${SANS}`;
  TEXT.kicker.forEach((line, i) => {
    ctx.fillStyle = i ? GREY : INK;
    ctx.fillText(line, COLUMNS.height, 330 + i * 50); // 높이 열과 왼쪽 맞춤, 마지막 줄이 제목 밑선(430)에 맞음
  });

  hairline(ctx, 540);
  ctx.fillStyle = INK;
  ctx.font = `500 52px ${SANS}`;
  ctx.fillText(TEXT.subtitle, M, 625);

  // 감자가 튀어나온 동그란 자리: 살짝 꺼진 바닥 + 가는 칼선
  const { x, y, radius } = SOCKET;
  const well = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
  well.addColorStop(0, '#ebebeb');
  well.addColorStop(1, '#e6e6e6');
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  legend(ctx, geoid);

  // 아래: 위치 정보 칸 제목, 꼬리말
  hairline(ctx, 2200);
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = GREY;
  const [nameLabel, coordinatesLabel, heightLabel] = TEXT.labels;
  spaced(ctx, nameLabel, COLUMNS.name, 2268);
  spaced(ctx, coordinatesLabel, COLUMNS.coordinates, 2268);
  spaced(ctx, heightLabel, COLUMNS.height, 2268);

  hairline(ctx, 2600);
  ctx.fillStyle = GREY;
  // 자료 출처 (CC BY)
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText(TEXT.credit, M, 2690);
  return canvas;
}

// 지오이드 색 띠: 가장 낮은 곳 ~ 가장 높은 곳
function legend(ctx, geoid) {
  const left = M;
  const top = 2118;
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
  ctx.font = `500 30px ${SANS}`;
  ctx.fillStyle = GREY;
  ctx.fillText(TEXT.legend, left, top - 20);
  ctx.fillStyle = INK;
  ctx.fillText(formatHeight(lowest), left, top + height + 40);
  ctx.textAlign = 'right';
  ctx.fillText(formatHeight(highest), left + width, top + height + 40);
  ctx.textAlign = 'left';
}

/** 위치 정보 칸 (투명 배경). place 가 없으면 안내 문구 */
export function drawInfo(canvas, place) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';
  if (!place) return;
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
  ctx.font = `500 44px ${SANS}`;
  ctx.fillText(formatCoordinates(place.lat, place.lon), COLUMNS.coordinates, 140);
  ctx.font = `700 56px ${SANS}`;
  ctx.fillStyle = place.height >= 0 ? '#ff4a1c' : '#4f6f93';
  ctx.fillText(formatHeight(place.height), COLUMNS.height, 140);
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
